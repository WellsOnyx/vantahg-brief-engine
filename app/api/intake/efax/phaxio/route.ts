/**
 * POST /api/intake/efax/phaxio
 *
 * Phaxio inbound fax webhook. HMAC (PHAXIO_CALLBACK_TOKEN) still gates
 * the route. Phase 2: a received / synthetic fax also becomes a case on
 * the Phase 1 spine immediately (no OCR wait) so it shows in
 * GET /api/case-spine in well under 2 minutes.
 *
 * Live OCR + AI extract remain on the existing cron path
 * (`ENABLE_REAL_EFAX`). This route does not call Phaxio media download
 * and does not invent API keys — PHAXIO_API_KEY / PHAXIO_API_SECRET
 * stay empty slots.
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
import { apiError } from '@/lib/api-error';
import {
  verifyPhaxioSignature,
  parsePhaxioWebhook,
} from '@/lib/intake/efax/providers/phaxio';
import {
  generateAuthorizationNumber,
  logIntakeEvent,
} from '@/lib/intake/confirmation';
import type { EfaxPayload } from '@/lib/intake/efax-parser';
import {
  defaultIntakeClientId,
  ingestToCaseSpine,
  mapUnknownToIntake,
} from '@/lib/intake/spine-ingest';
import type { IntakePayload } from '@/lib/case-spine';

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

function isSyntheticJson(rawBody: string, contentType: string): Record<string, unknown> | null {
  if (!contentType.toLowerCase().includes('application/json')) return null;
  try {
    const parsed = JSON.parse(rawBody) as unknown;
    if (!parsed || typeof parsed !== 'object') return null;
    const obj = parsed as Record<string, unknown>;
    return obj.synthetic === true ? obj : null;
  } catch {
    return null;
  }
}

function intakeFromFax(
  payload: EfaxPayload,
  extra: Record<string, unknown> | null,
): { client_id: string; intake: IntakePayload } {
  const nested =
    extra?.intake && typeof extra.intake === 'object'
      ? (extra.intake as Record<string, unknown>)
      : extra ?? {};
  const mapped = mapUnknownToIntake({
    ...nested,
    client_id: extra?.client_id ?? nested.client_id,
    external_id: nested.external_id ?? payload.fax_id,
    place_of_service: nested.place_of_service ?? 'fax',
    clinicals_pointer: nested.clinicals_pointer ?? payload.document_url ?? `fax:${payload.fax_id}`,
    received_at: nested.received_at ?? payload.received_at,
  });
  return {
    client_id: defaultIntakeClientId(mapped.client_id),
    intake: mapped.intake,
  };
}

export async function POST(request: NextRequest) {
  try {
    const rateLimited = await applyRateLimit(request, { maxRequests: 60 });
    if (rateLimited) return rateLimited;

    const rawBody = await request.text();
    const contentType = request.headers.get('content-type') || '';
    const signatureHeader = request.headers.get('x-phaxio-signature') || '';
    const webhookUrl = buildWebhookUrl(request);

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
      await logAuditEvent(null, 'phaxio_webhook_unverified_dev', 'system', {
        reason: 'PHAXIO_CALLBACK_TOKEN not set',
      });
    }

    const synthetic = isSyntheticJson(rawBody, contentType);
    let payload: EfaxPayload;
    try {
      if (synthetic && (!synthetic.fax || typeof synthetic.fax !== 'object')) {
        const mapped = mapUnknownToIntake(
          (synthetic.intake && typeof synthetic.intake === 'object'
            ? { ...synthetic, ...(synthetic.intake as Record<string, unknown>) }
            : synthetic) as Record<string, unknown>,
        );
        payload = {
          fax_id: mapped.intake.external_id || `synth-fax-${Date.now()}`,
          from_number: '+15555550100',
          to_number: '+15555550199',
          received_at: mapped.intake.received_at || new Date().toISOString(),
          page_count: 1,
          document_url: mapped.intake.clinicals_pointer ?? undefined,
          content_type: 'application/pdf',
          provider: 'phaxio',
          status: 'success',
          metadata: { synthetic: true },
        };
      } else {
        payload = parsePhaxioWebhook(rawBody, contentType);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);

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

    const authNumber = await generateAuthorizationNumber();

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
        synthetic: Boolean(synthetic),
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

    const mapped = intakeFromFax(payload, synthetic);
    const ingested = await ingestToCaseSpine({
      source: 'fax_phaxio',
      client_id: mapped.client_id,
      intake: mapped.intake,
      actor: 'intake:fax_phaxio',
    });

    await logAuditEvent(ingested.case.case_id, 'case_created_via_phaxio', 'system', {
      fax_id: payload.fax_id,
      authorization_number: authNumber,
      state: ingested.case.state,
      sla_clock: ingested.case.sla_clock,
      elapsed_ms: ingested.elapsed_ms,
    });

    if (isDemoMode()) {
      return NextResponse.json({
        success: true,
        status: 'queued',
        demo: true,
        source: 'fax_phaxio',
        authorization_number: authNumber,
        case_id: ingested.case.case_id,
        case_number: ingested.case.case_number,
        state: ingested.case.state,
        sla_clock: ingested.case.sla_clock,
        elapsed_ms: ingested.elapsed_ms,
        webhook_received_at: ingested.webhook_received_at,
        spine_created_at: ingested.spine_created_at,
        evaluations: ingested.evaluations,
      });
    }

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
        case_id: ingested.case.case_id,
      })
      .select('id')
      .single();

    if (efaxError || !efaxEntry) {
      console.error('[phaxio] failed to store fax', {
        fax_id: payload.fax_id,
        code: efaxError?.code ?? null,
      });
      await logAuditEvent(null, 'phaxio_webhook_db_error', 'system', {
        fax_id: payload.fax_id,
        error_code: efaxError?.code ?? null,
        authorization_number: authNumber,
      });
      return NextResponse.json({
        success: true,
        status: 'spine_only',
        error: 'Failed to persist fax queue row — spine case was created',
        authorization_number: authNumber,
        case_id: ingested.case.case_id,
        state: ingested.case.state,
        sla_clock: ingested.case.sla_clock,
        elapsed_ms: ingested.elapsed_ms,
      });
    }

    return NextResponse.json({
      success: true,
      status: 'queued',
      source: 'fax_phaxio',
      efax_queue_id: efaxEntry.id,
      authorization_number: authNumber,
      case_id: ingested.case.case_id,
      case_number: ingested.case.case_number,
      state: ingested.case.state,
      sla_clock: ingested.case.sla_clock,
      elapsed_ms: ingested.elapsed_ms,
      webhook_received_at: ingested.webhook_received_at,
      spine_created_at: ingested.spine_created_at,
      evaluations: ingested.evaluations,
    });
  } catch (err) {
    return apiError(err, {
      operation: 'phaxio_webhook',
      actor: 'system',
    });
  }
}
