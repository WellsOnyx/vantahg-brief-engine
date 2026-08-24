import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';
import { logAuditEvent } from '@/lib/audit';
import { dispatchFinalization } from '@/lib/intake/brief-queue';
import { isDemoMode } from '@/lib/demo-mode';
import { applyRateLimit } from '@/lib/rate-limit-middleware';
import {
  verifyIntakeSignature,
  getIntakeWebhookSecrets,
  SIGNATURE_HEADER,
  TIMESTAMP_HEADER,
  LEGACY_SIGNATURE_HEADER,
} from '@/lib/intake/gr-contract';
import { intakePersistenceGuard } from '@/lib/intake/persistence-guard';
import { normalizeGrHandoff } from '@/lib/intake/gr-handoff';

/**
 * POST /api/gr/webhook — Canonical Intake Contract v1.1, handoff channel
 * (see docs/INTAKE_CONTRACT.md). The stable external face for Gravity Rail:
 * endpoint and GR_WEBHOOK_SECRET are unchanged from v1.
 *
 * Inbound from Gravity Rail when an intake chat (web, sms, voice) reaches handoff.
 * Turned into a VantaUM case via the shared chassis (dispatchFinalization).
 *
 * Security   : v1.1 — HMAC-SHA256 over `${X-GR-Timestamp}.${rawBody}` in
 *              `X-GR-Signature`, ±300s replay window, dual-secret rotation
 *              (GR_WEBHOOK_SECRET / GR_WEBHOOK_SECRET_SECONDARY; legacy
 *              GRAVITY_RAIL_WEBHOOK_SECRET still honored). The v1 scheme
 *              (plain body HMAC in `X-Webhook-Signature`) is accepted
 *              during the transition window — see ACCEPT_V1_LEGACY_SIGNATURES
 *              in lib/intake/gr-contract.ts.
 *              Production with no secret FAILS CLOSED (500
 *              webhook_secret_not_configured). Live intake is never
 *              silently demo-dropped.
 * Idempotency: `Idempotency-Key` header, else the GR `chat_id`. Re-delivery of the
 *              same key returns the existing case (200, idempotent:true) instead
 *              of creating a duplicate.
 *
 * This route is code-complete against the contract. It is not live-keyed
 * and is not production-ready until Cole/Jonah provision a real GR workspace.
 */
export async function POST(request: NextRequest) {
  const rateLimited = await applyRateLimit(request, { maxRequests: 120 });
  if (rateLimited) return rateLimited;

  // 1) Read the RAW body once — HMAC must verify the exact bytes GR signed.
  const rawBody = await request.text();

  // 2) Verify the signature. Production without a secret refuses intake
  //    (contract §2.3). Demo-mode is not a substitute for a missing secret
  //    on a production deploy — that was the silent-drop path.
  const secrets = getIntakeWebhookSecrets();
  if (secrets.length === 0) {
    if (process.env.NODE_ENV === 'production') {
      return NextResponse.json({ error: 'webhook_secret_not_configured' }, { status: 500 });
    }
    // Dev/test only: unsigned traffic allowed so local HMAC tests and
    // scripts/gr-intake-verify.ts can run against a demo deploy.
  } else {
    const verdict = verifyIntakeSignature({
      rawBody,
      signatureHeader: request.headers.get(SIGNATURE_HEADER),
      timestampHeader: request.headers.get(TIMESTAMP_HEADER),
      legacySignatureHeader: request.headers.get(LEGACY_SIGNATURE_HEADER),
      secrets,
    });
    if (!verdict.ok) {
      return NextResponse.json({ error: 'invalid_signature', code: verdict.code }, { status: 401 });
    }
    if (verdict.scheme === 'v1_legacy') {
      await logAuditEvent(null, 'gr_intake_legacy_signature_used', 'system', {
        channel: 'gr_webhook',
      });
    }
  }

  // 3) Parse the verified body.
  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody || '{}');
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const workspaceId =
    (typeof payload.workspace_id === 'string' && payload.workspace_id) ||
    (typeof payload.wid === 'string' && payload.wid) ||
    '';
  if (!workspaceId) {
    return NextResponse.json({ error: 'workspace_id required' }, { status: 400 });
  }

  // 4) Idempotency key is REQUIRED for exactly-once delivery.
  const idempotencyKey =
    request.headers.get('idempotency-key') ||
    (payload.chat_id != null ? String(payload.chat_id) : null);
  if (!idempotencyKey) {
    return NextResponse.json(
      { error: 'idempotency_key_required', detail: 'Send an Idempotency-Key header or a chat_id.' },
      { status: 400 },
    );
  }
  const caseNumber = `GR-${idempotencyKey}`;

  // Fail closed if this env requires real persistence but the DB isn't wired.
  const persistenceBlocked = intakePersistenceGuard();
  if (persistenceBlocked) return persistenceBlocked;

  // Production never acknowledges live intake as a demo success. Local/test
  // demo may acknowledge the contract without a database.
  if (isDemoMode()) {
    if (process.env.NODE_ENV === 'production') {
      return NextResponse.json(
        {
          error: 'persistence_unavailable',
          detail:
            'Production intake cannot be demo-dropped. Configure the database or unset NODE_ENV=production.',
        },
        { status: 503 },
      );
    }
    return NextResponse.json({ success: true, demo: true, case_number: caseNumber, idempotent: false });
  }

  try {
    const supabase = getServiceClient();

    // 5) Idempotent short-circuit: same key already produced a case → return it.
    const { data: existing } = await supabase
      .from('cases')
      .select('id')
      .eq('case_number', caseNumber)
      .maybeSingle();
    if (existing) {
      await logAuditEvent(existing.id, 'gr_intake_duplicate', 'system', {
        idempotency_key: idempotencyKey,
        gr_workspace_id: workspaceId,
      });
      return NextResponse.json({ success: true, case_id: existing.id, idempotent: true }, { status: 200 });
    }

    // Find the concierge who owns this GR workspace (optional — missing is not fatal).
    const { data: staff } = await supabase
      .from('staff')
      .select('id')
      .eq('gr_workspace_id', workspaceId)
      .maybeSingle();
    const conciergeId = staff?.id || null;

    const fields = normalizeGrHandoff(payload);

    const { data: newCase, error: createErr } = await supabase
      .from('cases')
      .insert({
        case_number: caseNumber,
        status: 'intake',
        intake_channel: 'phone',
        priority: fields.priority,
        patient_name: fields.patient_name,
        patient_dob: fields.patient_dob,
        patient_member_id: fields.patient_member_id,
        procedure_codes: fields.procedure_codes,
        diagnosis_codes: fields.diagnosis_codes,
        procedure_description: fields.procedure_description,
        clinical_question: fields.clinical_question,
        requesting_provider: fields.requesting_provider,
        requesting_provider_npi: fields.requesting_provider_npi,
        facility_name: fields.facility_name,
        payer_name: fields.payer_name,
        assigned_concierge_id: conciergeId,
      })
      .select('id')
      .single();

    if (createErr || !newCase) {
      // Lost an idempotency race? Re-read and return the winner rather than erroring.
      const { data: raced } = await supabase
        .from('cases')
        .select('id')
        .eq('case_number', caseNumber)
        .maybeSingle();
      if (raced) {
        return NextResponse.json({ success: true, case_id: raced.id, idempotent: true }, { status: 200 });
      }
      throw new Error(createErr?.message || 'Failed to create case from GR webhook');
    }

    const caseId = newCase.id;
    await dispatchFinalization(caseId, { channel: 'phone', actor: 'gravity_rail' });
    await logAuditEvent(caseId, 'gravity_rail_intake_handoff', 'system', {
      idempotency_key: idempotencyKey,
      gr_chat_id: payload.chat_id,
      gr_workspace_id: workspaceId,
      concierge_id: conciergeId,
      extraction_source: fields.extraction_source,
    });

    return NextResponse.json({ success: true, case_id: caseId, idempotent: false }, { status: 201 });
  } catch (err) {
    // Do not log the payload — it may contain PHI / member identifiers.
    const errorKind = err instanceof Error ? err.name : typeof err;
    console.error('GR webhook error', errorKind);
    return NextResponse.json({ error: 'webhook processing failed' }, { status: 500 });
  }
}
