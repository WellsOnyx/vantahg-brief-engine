import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';
import { logAuditEvent } from '@/lib/audit';
import { finalizeIntakeCase } from '@/lib/intake/finalize-case';
import { isDemoMode } from '@/lib/demo-mode';
import { applyRateLimit } from '@/lib/rate-limit-middleware';
import { parseEmailPayload } from '@/lib/intake/email-parser';
import type { ParsedEmailData } from '@/lib/intake/email-parser';
import { verifyWebhookSignature } from '@/lib/webhook-verify';

/**
 * POST /api/gr/webhook — Canonical Intake Contract (see docs/INTAKE_CONTRACT.md).
 *
 * Inbound from Gravity Rail when an intake chat (web, sms, voice) reaches handoff.
 * Turned into a VantaUM case via the shared chassis.
 *
 * Security   : HMAC-SHA256 over the RAW body in `X-Webhook-Signature` (hex),
 *              keyed by GR_WEBHOOK_SECRET. Enforced whenever the secret is set;
 *              real mode requires it (fails closed).
 * Idempotency: `Idempotency-Key` header, else the GR `chat_id`. Re-delivery of the
 *              same key returns the existing case (200, idempotent:true) instead
 *              of creating a duplicate.
 */
export async function POST(request: NextRequest) {
  const rateLimited = await applyRateLimit(request, { maxRequests: 120 });
  if (rateLimited) return rateLimited;

  // 1) Read the RAW body once — HMAC must verify the exact bytes GR signed.
  const rawBody = await request.text();

  // 2) Verify the signature. Enforced when a secret is configured; real mode
  //    requires one (never accept unsigned intake into the persistence path).
  const secret = process.env.GR_WEBHOOK_SECRET;
  if (secret) {
    const signature = request.headers.get('x-webhook-signature') || '';
    const ok = await verifyWebhookSignature(rawBody, signature, secret);
    if (!ok) {
      return NextResponse.json({ error: 'invalid_signature' }, { status: 401 });
    }
  } else if (!isDemoMode()) {
    return NextResponse.json({ error: 'webhook_secret_not_configured' }, { status: 500 });
  }

  // 3) Parse the verified body.
  let payload: Record<string, any>;
  try {
    payload = JSON.parse(rawBody || '{}');
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const workspaceId = payload.workspace_id || payload.wid;
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

  // Demo mode: acknowledge the (verified) contract without persistence.
  if (isDemoMode()) {
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

    // Find the concierge who owns this GR workspace.
    const { data: staff } = await supabase
      .from('staff')
      .select('id, name, email')
      .eq('gr_workspace_id', workspaceId)
      .single();
    const conciergeId = staff?.id || null;

    const transcript = payload.transcript || payload.field_values?.transcript;
    const parsed = parseEmailPayload(
      transcript || JSON.stringify(payload.field_values || {}),
    ) as ParsedEmailData & Record<string, any>;

    const { data: newCase, error: createErr } = await supabase
      .from('cases')
      .insert({
        case_number: caseNumber,
        status: 'intake',
        intake_channel: 'phone',
        patient_name: parsed.patient_name || payload.from_number || payload.member?.email || 'GR Member',
        patient_dob: parsed.patient_dob || null,
        patient_member_id: parsed.patient_member_id || null,
        procedure_codes: parsed.procedure_codes || [],
        diagnosis_codes: parsed.diagnosis_codes || [],
        procedure_description: parsed.procedure_description || payload.title || 'Gravity Rail intake',
        clinical_question: parsed.clinical_question || null,
        requesting_provider: parsed.requesting_provider || null,
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
    await finalizeIntakeCase(caseId, { channel: 'phone', actor: 'gravity_rail' });
    await logAuditEvent(caseId, 'gravity_rail_intake_handoff', 'system', {
      idempotency_key: idempotencyKey,
      gr_chat_id: payload.chat_id,
      gr_workspace_id: workspaceId,
      concierge_id: conciergeId,
    });

    return NextResponse.json({ success: true, case_id: caseId, idempotent: false }, { status: 201 });
  } catch (err) {
    console.error('GR webhook error', err);
    return NextResponse.json({ error: 'webhook processing failed' }, { status: 500 });
  }
}
