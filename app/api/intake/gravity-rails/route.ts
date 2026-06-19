import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { getServiceClient } from '@/lib/supabase';
import { isDemoMode } from '@/lib/demo-mode';
import { applyRateLimit } from '@/lib/rate-limit-middleware';
import { logAuditEvent } from '@/lib/audit';
import { apiError } from '@/lib/api-error';
import { getRequestContext } from '@/lib/security';
import {
  generateAuthorizationNumber,
  logIntakeEvent,
  hashPatientName,
  sendReceiptConfirmation,
} from '@/lib/intake/confirmation';
import { computeSubmissionFingerprint, findDuplicateCase } from '@/lib/intake/efax/storage';
import { normalizeIntake, fingerprintInputs, buildCaseInsert } from '@/lib/intake/normalize';

export const dynamic = 'force-dynamic';

/**
 * POST /api/intake/gravity-rails
 *
 * Inbound webhook for the Gravity Rails AI agent. When a GR workflow
 * captures an intake, it POSTs the structured case here and we create a
 * real case in the SAME engine as every other channel (the "One Door"
 * contract — lib/intake/normalize.ts). This closes the gap where GR was
 * outbound-only (we could call GR, but a GR intake never became a case).
 *
 * Auth: HMAC-SHA256 over the raw body using GRAVITY_RAIL_WEBHOOK_SECRET,
 * sent in `x-gr-signature`. Same scheme as /api/external/submit.
 * Whitelisted in middleware (no session — it's machine-to-machine).
 *
 * Dedup: shared 24h fingerprint, so a GR submission that duplicates a fax
 * or portal case is caught cross-channel.
 */

export async function POST(request: NextRequest) {
  try {
    const rateLimited = await applyRateLimit(request, { maxRequests: 200 });
    if (rateLimited) return rateLimited;

    const rawBody = await request.text();

    // ── Auth (skipped in demo so the channel is testable without secrets) ──
    if (!isDemoMode()) {
      const secret = process.env.GRAVITY_RAIL_WEBHOOK_SECRET;
      const signature = request.headers.get('x-gr-signature');
      if (!secret) {
        await logAuditEvent(null, 'security:gr_intake_no_secret_configured', 'system');
        return NextResponse.json({ error: 'Gravity Rails intake not configured' }, { status: 503 });
      }
      if (!signature) {
        await logAuditEvent(null, 'security:gr_intake_missing_signature', 'system');
        return NextResponse.json({ error: 'x-gr-signature header required' }, { status: 401 });
      }
      const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
      const sigBuf = Buffer.from(signature);
      const expBuf = Buffer.from(expected);
      if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
        await logAuditEvent(null, 'security:gr_intake_invalid_signature', 'system');
        return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
      }
    }

    let body: Record<string, unknown>;
    try {
      body = JSON.parse(rawBody) as Record<string, unknown>;
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    // Source id for audit — GR chat/workspace id if provided.
    const sourceId =
      (typeof body.gr_chat_id === 'string' && `chat:${body.gr_chat_id}`) ||
      (typeof body.gr_workspace_id === 'string' && `ws:${body.gr_workspace_id}`) ||
      'gravity_rails';

    // ── One Door: normalize + validate via the shared contract ──
    const result = normalizeIntake('gravity_rails', body, sourceId);
    if (!result.ok || !result.intake) {
      return NextResponse.json({ error: 'Validation failed', details: result.errors }, { status: 400 });
    }
    const intake = result.intake;

    const authNumber = await generateAuthorizationNumber();
    const caseNumber = `VUM-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`;

    await logIntakeEvent({
      channel: 'gravity_rails',
      source_identifier: sourceId,
      authorization_number: authNumber,
      case_id: null,
      patient_name_hash: hashPatientName(intake.patient_name),
      status: 'processing',
      rejection_reason: null,
      metadata: { gr_chat_id: body.gr_chat_id ?? null },
      processed_at: null,
      processed_by: null,
    });

    if (isDemoMode()) {
      const demoCaseId = `gr-${Date.now()}`;
      return NextResponse.json(
        {
          success: true,
          demo: true,
          case_id: demoCaseId,
          case_number: caseNumber,
          authorization_number: authNumber,
          status: 'intake',
          message: 'Gravity Rails intake accepted (demo mode)',
        },
        { status: 201, headers: { 'X-Demo-Mode': 'true' } },
      );
    }

    const supabase = getServiceClient();

    // ── Cross-channel dedup (shared 24h fingerprint) ──
    const fingerprint = computeSubmissionFingerprint(fingerprintInputs(intake));
    if (fingerprint) {
      const duplicate = await findDuplicateCase(fingerprint);
      if (duplicate) {
        await logAuditEvent(duplicate.case_id, 'gr_intake_duplicate_detected', 'system', {
          existing_case_number: duplicate.case_number,
          existing_age_hours: Math.round(duplicate.age_hours * 10) / 10,
          source: sourceId,
        });
        return NextResponse.json(
          {
            duplicate: true,
            case_id: duplicate.case_id,
            case_number: duplicate.case_number,
            message: `Duplicate of case submitted ${Math.round(duplicate.age_hours * 10) / 10}h ago`,
          },
          { status: 409 },
        );
      }
    }

    const { data: newCase, error: caseError } = await supabase
      .from('cases')
      .insert(buildCaseInsert(intake, { caseNumber, authorizationNumber: authNumber, fingerprint }))
      .select('id, case_number, status')
      .single();

    if (caseError || !newCase) {
      return apiError(caseError, {
        operation: 'gr_intake_case_insert',
        actor: sourceId,
        requestContext: getRequestContext(request),
        clientMessage: 'Failed to create case',
      });
    }

    const confirmation = await sendReceiptConfirmation({
      caseId: newCase.id,
      authorizationNumber: authNumber,
      channel: 'gravity_rails',
      recipientEmail: intake.contact_email ?? undefined,
    });

    await supabase
      .from('cases')
      .update({
        intake_confirmation_sent: confirmation.confirmation_sent,
        intake_processed_at: new Date().toISOString(),
      })
      .eq('id', newCase.id);

    await logAuditEvent(newCase.id, 'gr_intake_case_created', 'system', {
      case_number: newCase.case_number,
      source: sourceId,
    });

    return NextResponse.json(
      {
        success: true,
        case_id: newCase.id,
        case_number: newCase.case_number,
        authorization_number: authNumber,
        status: newCase.status,
      },
      { status: 201 },
    );
  } catch (err) {
    console.error('Gravity Rails intake error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
