/**
 * /api/intake/efax
 *
 * Generic, provider-agnostic eFax webhook endpoint.
 *
 * Async contract: the POST handler is strictly store-and-return-200. It
 * accepts a pre-normalized `EfaxPayload` (JSON), verifies an optional HMAC
 * signature, writes an `efax_queue` row with status `'received'`, and
 * returns 200. No OCR, no AI extraction, no case creation, no receipt
 * confirmation — the cron worker does all of that. Provider-specific
 * normalizers (e.g. Phaxio) live in their own routes under
 * `/api/intake/efax/<provider>/route.ts`.
 *
 * The GET handler remains the admin queue lookup and is unchanged.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';
import { isDemoMode } from '@/lib/demo-mode';
import { logAuditEvent } from '@/lib/audit';
import { applyRateLimit } from '@/lib/rate-limit-middleware';
import { type EfaxPayload } from '@/lib/intake/efax-parser';
import { generateAuthorizationNumber, logIntakeEvent } from '@/lib/intake/confirmation';
import crypto from 'crypto';

export const dynamic = 'force-dynamic';

/**
 * POST /api/intake/efax
 *
 * Generic webhook for direct JSON submissions of a normalized `EfaxPayload`
 * (internal tools, load tests, future providers that ship a native JSON
 * format). The caller is expected to send an already-normalized payload;
 * this endpoint does not parse provider-specific shapes.
 *
 * Security:
 * - Optional HMAC signature verification (EFAX_WEBHOOK_SECRET)
 * - Rate limiting
 * - Full audit trail
 * - No raw PHI in logs
 */
export async function POST(request: NextRequest) {
  try {
    const rateLimited = await applyRateLimit(request, { maxRequests: 60 });
    if (rateLimited) return rateLimited;

    // Verify webhook signature if configured
    const webhookSecret = process.env.EFAX_WEBHOOK_SECRET;
    if (webhookSecret) {
      const signature =
        request.headers.get('x-webhook-signature') ||
        request.headers.get('x-efax-signature') ||
        '';
      const rawBody = await request.clone().text();
      const expectedSignature = crypto
        .createHmac('sha256', webhookSecret)
        .update(rawBody)
        .digest('hex');

      if (
        signature !== expectedSignature &&
        signature !== `sha256=${expectedSignature}`
      ) {
        await logAuditEvent(null, 'security:efax_webhook_invalid_signature', 'system', {
          from_number: 'unknown',
        });
        return NextResponse.json(
          { error: 'Invalid webhook signature' },
          { status: 401 },
        );
      }
    }

    let body: EfaxPayload;
    try {
      body = (await request.json()) as EfaxPayload;
    } catch (err) {
      await logAuditEvent(null, 'efax_webhook_parse_error', 'system', {
        error: err instanceof Error ? err.message : String(err),
      });
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    // Validate required fields: fax_id is mandatory, and we need *something*
    // the worker can actually process — either a downloadable document URL
    // or already-extracted OCR text.
    if (!body.fax_id) {
      return NextResponse.json({ error: 'fax_id is required' }, { status: 400 });
    }
    if (!body.document_url && !body.ocr_text) {
      return NextResponse.json(
        { error: 'Either document_url or ocr_text is required' },
        { status: 400 },
      );
    }

    const authNumber = await generateAuthorizationNumber();

    // Log intake event (no PHI — worker fills in the patient hash later).
    await logIntakeEvent({
      channel: 'efax',
      source_identifier: body.from_number || null,
      authorization_number: authNumber,
      case_id: null,
      patient_name_hash: null,
      status: 'processing',
      rejection_reason: null,
      metadata: {
        fax_id: body.fax_id,
        page_count: body.page_count,
        provider: body.provider || 'generic',
      },
      processed_at: null,
      processed_by: null,
    });

    await logAuditEvent(null, 'efax_received', 'system', {
      provider: body.provider || 'generic',
      fax_id: body.fax_id,
      from_number: body.from_number,
      page_count: body.page_count,
      authorization_number: authNumber,
    });

    if (isDemoMode()) {
      return NextResponse.json({
        success: true,
        status: 'queued',
        demo: true,
        authorization_number: authNumber,
      });
    }

    const supabase = getServiceClient();

    const { data: efaxEntry, error: efaxError } = await supabase
      .from('efax_queue')
      .insert({
        fax_id: body.fax_id,
        from_number: body.from_number || null,
        to_number: body.to_number || null,
        page_count: body.page_count || 0,
        document_url: body.document_url || null,
        content_type: body.content_type || 'application/pdf',
        ocr_text: body.ocr_text || null,
        ocr_confidence: body.ocr_confidence || null,
        status: 'received',
        provider: body.provider || 'generic',
        provider_metadata: body.metadata || null,
        attempts: 0,
        needs_manual_review: false,
        parsed_data: null,
        authorization_number: authNumber,
      })
      .select('id')
      .single();

    if (efaxError || !efaxEntry) {
      console.error('Failed to store e-fax:', efaxError);
      await logAuditEvent(null, 'efax_webhook_db_error', 'system', {
        fax_id: body.fax_id,
        error: efaxError?.message || 'unknown',
        authorization_number: authNumber,
      });
      // Return 200 so the caller doesn't retry and duplicate rows.
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
    console.error('Error processing e-fax:', err);
    try {
      await logAuditEvent(null, 'efax_webhook_unexpected_error', 'system', {
        error: err instanceof Error ? err.message : String(err),
      });
    } catch {
      // Audit logging itself failed — nothing more we can do.
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * GET /api/intake/efax
 *
 * Returns the e-fax queue for admin review.
 * Filtered by status, with pagination.
 */
export async function GET(request: NextRequest) {
  try {
    const rateLimited = await applyRateLimit(request, { maxRequests: 100 });
    if (rateLimited) return rateLimited;

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const needsReview = searchParams.get('needs_review');

    if (isDemoMode()) {
      // Return demo e-fax queue
      const demoQueue = [
        {
          id: 'efax-demo-001',
          created_at: '2026-02-20T09:15:00Z',
          fax_id: 'FAX-20260220-001',
          from_number: '+14155551234',
          to_number: '+18005551111',
          page_count: 4,
          status: 'case_created',
          needs_manual_review: false,
          manual_review_reasons: [],
          parsed_data: {
            patient_name: 'Maria Santos',
            procedure_codes: ['27447'],
            service_category: 'surgery',
            confidence: 92,
          },
          case_id: 'efax-case-001',
        },
        {
          id: 'efax-demo-002',
          created_at: '2026-02-21T14:30:00Z',
          fax_id: 'FAX-20260221-003',
          from_number: '+13105559876',
          to_number: '+18005551111',
          page_count: 2,
          status: 'manual_review',
          needs_manual_review: true,
          manual_review_reasons: ['Low OCR confidence', 'No procedure codes found'],
          parsed_data: {
            patient_name: 'J. Williams',
            procedure_codes: [],
            service_category: null,
            confidence: 45,
          },
          case_id: null,
        },
        {
          id: 'efax-demo-003',
          created_at: '2026-02-22T08:00:00Z',
          fax_id: 'FAX-20260222-001',
          from_number: '+12125554567',
          to_number: '+18005551111',
          page_count: 6,
          status: 'parsed',
          needs_manual_review: false,
          manual_review_reasons: [],
          parsed_data: {
            patient_name: 'Robert Chen',
            procedure_codes: ['70553', '72148'],
            service_category: 'imaging',
            confidence: 88,
          },
          case_id: null,
        },
      ];

      let filtered = demoQueue;
      if (status) filtered = filtered.filter((f) => f.status === status);
      if (needsReview === 'true') filtered = filtered.filter((f) => f.needs_manual_review);

      return NextResponse.json(filtered);
    }

    const supabase = getServiceClient();
    let query = supabase
      .from('efax_queue')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100);

    if (status) query = query.eq('status', status);
    if (needsReview === 'true') query = query.eq('needs_manual_review', true);

    const { data, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data || []);
  } catch (err) {
    console.error('Error fetching e-fax queue:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
