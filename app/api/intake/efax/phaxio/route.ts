/**
 * POST /api/intake/efax/phaxio
 *
 * Provider-specific webhook endpoint for Phaxio inbound fax events.
 *
 * Async contract: this handler is strictly store-and-return-200. It verifies
 * the Phaxio HMAC signature, normalizes the provider payload into an
 * `EfaxPayload`, writes a row to `efax_queue` with status `'received'`, and
 * returns 200. OCR, AI extraction, case creation, and receipt confirmation
 * all happen later in the cron worker — this way Phaxio never times out, we
 * can retry safely, and we never lose a fax on a crash.
 *
 * Security:
 * - HMAC signature verification (PHAXIO_CALLBACK_TOKEN)
 * - Rate limiting
 * - Full audit trail
 * - No raw PHI in logs
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';
import { isDemoMode } from '@/lib/demo-mode';
import { logAuditEvent } from '@/lib/audit';
import { applyRateLimit } from '@/lib/rate-limit-middleware';
import {
  verifyPhaxioSignature,
  parsePhaxioWebhook,
} from '@/lib/intake/efax/providers/phaxio';
import {
  generateAuthorizationNumber,
  logIntakeEvent,
  hashPatientName,
} from '@/lib/intake/confirmation';
import type { EfaxPayload } from '@/lib/intake/efax-parser';

export const dynamic = 'force-dynamic';

/**
 * Builds the exact webhook URL that Phaxio called, for HMAC reconstruction.
 * Strips a trailing slash on the pathname (Phaxio normalizes this away).
 */
function buildWebhookUrl(request: NextRequest): string {
  const url = new URL(request.url);
  if (url.pathname.length > 1 && url.pathname.endsWith('/')) {
    url.pathname = url.pathname.slice(0, -1);
  }
  return url.toString();
}

export async function POST(request: NextRequest) {
  try {
    const rateLimited = await applyRateLimit(request, { maxRequests: 60 });
    if (rateLimited) return rateLimited;

    // Read the raw body ONCE — request.text() consumes the stream.
    // Both the signature verifier and the payload parser need the raw text.
    const rawBody = await request.text();
    const contentType = request.headers.get('content-type') || '';
    const signatureHeader = request.headers.get('x-phaxio-signature') || '';
    const webhookUrl = buildWebhookUrl(request);

    // 1. Signature verification
    const verifyResult = verifyPhaxioSignature({
      contentType,
      rawBody,
      signatureHeader,
      webhookUrl,
    });

    if (!verifyResult.valid) {
      await logAuditEvent(null, 'security:phaxio_webhook_invalid_signature', 'system', {
        reason: verifyResult.reason || 'unknown',
      });
      return NextResponse.json(
        { error: 'Invalid webhook signature' },
        { status: 401 },
      );
    }

    if (verifyResult.reason === 'no_token_configured') {
      // Local dev / demo — allow but leave an audit breadcrumb.
      await logAuditEvent(null, 'phaxio_webhook_unverified_dev', 'system', {
        reason: 'PHAXIO_CALLBACK_TOKEN not set',
      });
    }

    // 2. Normalize the Phaxio payload into our shared EfaxPayload shape.
    let payload: EfaxPayload;
    try {
      payload = parsePhaxioWebhook(rawBody, contentType);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);

      // Non-received events (status callbacks, sent-fax events) are not errors
      // — we just acknowledge them and move on.
      if (message.includes('not a received fax event')) {
        await logAuditEvent(null, 'phaxio_webhook_skipped', 'system', {
          reason: message,
        });
        return NextResponse.json({
          success: true,
          skipped: true,
          reason: message,
        });
      }

      await logAuditEvent(null, 'phaxio_webhook_parse_error', 'system', {
        error: message,
      });
      return NextResponse.json(
        { error: 'Invalid Phaxio payload', reason: message },
        { status: 400 },
      );
    }

    // 3. Allocate the authorization number up front so we can echo it back
    //    on the webhook response — the worker reuses the same number later.
    const authNumber = await generateAuthorizationNumber();

    // 4. Intake + audit logs (no PHI — worker will hash once it has data).
    await logIntakeEvent({
      channel: 'efax',
      source_identifier: payload.from_number || null,
      authorization_number: authNumber,
      case_id: null,
      patient_name_hash: null,
      status: 'processing',
      rejection_reason: null,
      metadata: {
        fax_id: payload.fax_id,
        page_count: payload.page_count,
        provider: 'phaxio',
      },
      processed_at: null,
      processed_by: null,
    });

    await logAuditEvent(null, 'efax_received', 'system', {
      provider: 'phaxio',
      fax_id: payload.fax_id,
      from_number: payload.from_number,
      to_number: payload.to_number,
      page_count: payload.page_count,
      authorization_number: authNumber,
    });

    // 5. Demo mode short-circuit.
    if (isDemoMode()) {
      return NextResponse.json({
        success: true,
        status: 'queued',
        demo: true,
        authorization_number: authNumber,
      });
    }

    // 6. Persist to efax_queue with status='received'. The cron worker picks
    //    it up from here — no OCR, no case creation, no confirmation.
    const supabase = getServiceClient();
    const { data: efaxEntry, error: efaxError } = await supabase
      .from('efax_queue')
      .insert({
        fax_id: payload.fax_id,
        from_number: payload.from_number || null,
        to_number: payload.to_number || null,
        page_count: payload.page_count || 0,
        document_url: payload.document_url || null,
        content_type: payload.content_type || 'application/pdf',
        status: 'received',
        provider: 'phaxio',
        provider_metadata: payload.metadata || null,
        attempts: 0,
        needs_manual_review: false,
        parsed_data: null,
        authorization_number: authNumber,
      })
      .select('id')
      .single();

    if (efaxError || !efaxEntry) {
      // NEVER ask the provider to retry — duplicate webhook deliveries would
      // race and produce duplicate rows. Log loudly and return 200.
      console.error('Failed to store Phaxio fax:', efaxError);
      await logAuditEvent(null, 'phaxio_webhook_db_error', 'system', {
        fax_id: payload.fax_id,
        error: efaxError?.message || 'unknown',
        authorization_number: authNumber,
      });
      return NextResponse.json({
        success: false,
        status: 'error',
        error: 'Failed to persist fax — logged for manual recovery',
        authorization_number: authNumber,
      });
    }

    return NextResponse.json({
      success: true,
      status: 'queued',
      efax_queue_id: efaxEntry.id,
      authorization_number: authNumber,
    });
  } catch (err) {
    console.error('Unexpected error in Phaxio webhook:', err);
    try {
      await logAuditEvent(null, 'phaxio_webhook_unexpected_error', 'system', {
        error: err instanceof Error ? err.message : String(err),
      });
    } catch {
      // Audit logging itself failed — nothing more we can do.
    }
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
