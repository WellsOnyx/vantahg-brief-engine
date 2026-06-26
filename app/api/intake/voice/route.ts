/**
 * POST /api/intake/voice
 *
 * Inbound webhook for the Gravity Rail voice channel. When a `phone-voice`
 * chat completes, Gravity Rail POSTs the call here; we normalize it into the
 * SAME `cases` object every other channel produces (intake_channel = 'phone')
 * and run the shared downstream chassis via `finalizeIntakeCase`.
 *
 * ⚠️ ASSUMED CONTRACT — confirm with the Gravity Rail team before go-live.
 * The GR voice workflow + webhook payload are owned by the GR team and were not
 * finalized when this was written (see ROADMAP.md "Gravity Rail webhook
 * contract"). This endpoint is built defensively to accept the shape implied by
 * `lib/gravity-rails.ts`:
 *
 *   {
 *     "event": "chat.completed",            // optional
 *     "chat_id": 12345,                      // GRChat.id (number) — or "chatId"
 *     "channel": "phone-voice",
 *     "from_number": "+14155551234",         // caller — or "caller" / "from"
 *     "transcript": "..." | [ { role, content } ],  // string or GRMessage[]
 *     "field_values": { ... },               // optional structured extraction
 *                                            //   from the GR assistant
 *     "workspace_id": "uuid", "workflow_id": 7
 *   }
 *
 * When `field_values` is present we trust GR's structured extraction; otherwise
 * we run the transcript text through the shared clinical-text extractor
 * (`parseEmailPayload`, which is channel-neutral regex extraction over free
 * text). Until GR is wired in prod (GRAVITY_RAIL_* unset) this endpoint is
 * dormant — nothing calls it.
 *
 * Security: optional HMAC-SHA256 over the raw body via
 * `GRAVITY_RAIL_WEBHOOK_SECRET`, mirroring the generic eFax webhook. Rate
 * limited. No raw PHI in logs (patient names hashed).
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';
import { isDemoMode } from '@/lib/demo-mode';
import { logAuditEvent } from '@/lib/audit';
import { applyRateLimit } from '@/lib/rate-limit-middleware';
import { parseEmailPayload, type EmailPayload, type ParsedEmailData } from '@/lib/intake/email-parser';
import {
  generateAuthorizationNumber,
  logIntakeEvent,
  hashPatientName,
  sendReceiptConfirmation,
} from '@/lib/intake/confirmation';
import {
  computeSubmissionFingerprint,
  findDuplicateCase,
} from '@/lib/intake/efax/storage';
import { finalizeIntakeCase, isChannelAgnosticIntakeEnabled } from '@/lib/intake/finalize-case';
import { apiError } from '@/lib/api-error';
import { getRequestContext } from '@/lib/security';
import crypto from 'crypto';

export const dynamic = 'force-dynamic';

interface VoiceTranscriptMessage {
  role?: string;
  content?: string;
}

interface VoiceWebhookPayload {
  event?: string;
  chat_id?: number | string;
  chatId?: number | string;
  channel?: string;
  from_number?: string;
  from?: string;
  caller?: string;
  title?: string;
  transcript?: string | VoiceTranscriptMessage[];
  messages?: VoiceTranscriptMessage[];
  field_values?: Record<string, unknown>;
  workspace_id?: string;
  workflow_id?: number | string;
}

/** Collapse a GR transcript (string or message array) into plain text. */
function transcriptToText(payload: VoiceWebhookPayload): string {
  if (typeof payload.transcript === 'string') return payload.transcript;
  const msgs = Array.isArray(payload.transcript)
    ? payload.transcript
    : Array.isArray(payload.messages)
      ? payload.messages
      : [];
  return msgs
    .filter((m) => m && typeof m.content === 'string')
    .map((m) => `${m.role ?? 'speaker'}: ${m.content}`)
    .join('\n');
}

/** Pick the first present string from a record for any of the given keys. */
function pickStr(fv: Record<string, unknown>, keys: string[]): string | null {
  for (const k of keys) {
    const v = fv[k];
    if (typeof v === 'string' && v.trim()) return v.trim();
    if (typeof v === 'number') return String(v);
  }
  return null;
}

/** Pick a string-array (or comma/space-split string) for any of the given keys. */
function pickArr(fv: Record<string, unknown>, keys: string[]): string[] {
  for (const k of keys) {
    const v = fv[k];
    if (Array.isArray(v)) return v.map(String).map((s) => s.trim()).filter(Boolean);
    if (typeof v === 'string' && v.trim()) {
      return v.split(/[,;\s]+/).map((s) => s.trim()).filter(Boolean);
    }
  }
  return [];
}

/**
 * Normalize a voice webhook into the clinical fields the case insert needs.
 * Prefers GR's structured `field_values`; falls back to text extraction over
 * the transcript via the shared email/text parser.
 */
function normalizeVoice(payload: VoiceWebhookPayload): {
  parsed: ParsedEmailData;
  source: 'field_values' | 'transcript';
} {
  const fromIdentifier = payload.from_number || payload.from || payload.caller || '';
  const transcriptText = transcriptToText(payload);

  // Always run the text extractor — it yields confidence + manual-review flags
  // for free, and is the fallback when GR sends no structured fields.
  const emailPayload: EmailPayload = {
    from: fromIdentifier,
    to: 'voice-intake@vantaum.com',
    subject: payload.title || 'Voice intake (Gravity Rail)',
    text: transcriptText,
    attachments: 0,
  };
  const parsed = parseEmailPayload(emailPayload);

  const fv = payload.field_values;
  if (fv && Object.keys(fv).length > 0) {
    // Trust GR's structured extraction where it provides a value; keep the
    // text-derived value otherwise.
    const procedureCodes = pickArr(fv, ['procedure_codes', 'cpt_codes', 'cpt']);
    const diagnosisCodes = pickArr(fv, ['diagnosis_codes', 'icd_codes', 'icd10']);
    const merged: ParsedEmailData = {
      ...parsed,
      patient_name: pickStr(fv, ['patient_name', 'patient', 'member_name']) ?? parsed.patient_name,
      patient_dob: pickStr(fv, ['patient_dob', 'dob', 'date_of_birth']) ?? parsed.patient_dob,
      member_id: pickStr(fv, ['member_id', 'subscriber_id', 'policy_number']) ?? parsed.member_id,
      provider_name: pickStr(fv, ['provider_name', 'requesting_provider', 'physician']) ?? parsed.provider_name,
      provider_npi: pickStr(fv, ['provider_npi', 'npi']) ?? parsed.provider_npi,
      facility_name: pickStr(fv, ['facility_name', 'facility']) ?? parsed.facility_name,
      payer_name: pickStr(fv, ['payer_name', 'payer', 'insurance']) ?? parsed.payer_name,
      procedure_codes: procedureCodes.length > 0 ? procedureCodes : parsed.procedure_codes,
      diagnosis_codes: diagnosisCodes.length > 0 ? diagnosisCodes : parsed.diagnosis_codes,
    };
    return { parsed: merged, source: 'field_values' };
  }

  return { parsed, source: 'transcript' };
}

export async function POST(request: NextRequest) {
  try {
    const rateLimited = await applyRateLimit(request, { maxRequests: 60 });
    if (rateLimited) return rateLimited;

    // Optional HMAC signature verification (mirrors the generic eFax webhook).
    const webhookSecret = process.env.GRAVITY_RAIL_WEBHOOK_SECRET;
    if (webhookSecret) {
      const signature =
        request.headers.get('x-gr-signature') ||
        request.headers.get('x-webhook-signature') ||
        '';
      const rawBody = await request.clone().text();
      const expected = crypto.createHmac('sha256', webhookSecret).update(rawBody).digest('hex');
      if (signature !== expected && signature !== `sha256=${expected}`) {
        await logAuditEvent(null, 'security:voice_webhook_invalid_signature', 'system', {
          channel: 'phone',
        });
        return NextResponse.json({ error: 'Invalid webhook signature' }, { status: 401 });
      }
    }

    let body: VoiceWebhookPayload;
    try {
      body = (await request.json()) as VoiceWebhookPayload;
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const chatId = body.chat_id ?? body.chatId ?? null;
    const fromNumber = body.from_number || body.from || body.caller || null;

    const { parsed, source } = normalizeVoice(body);
    const authNumber = await generateAuthorizationNumber();

    // Voice auto-create gate (lenient, applied uniformly to both the structured
    // field_values path and the transcript-extraction path): create the case
    // when we have a patient name + at least one procedure code, and let the
    // downstream chassis (brief + concierge follow-up) fill the rest. Sparse
    // calls are returned for manual handling instead of creating a junk case.
    const canAutoCreate = !!parsed.patient_name && parsed.procedure_codes.length > 0;

    await logIntakeEvent({
      channel: 'phone',
      source_identifier: fromNumber,
      authorization_number: authNumber,
      case_id: null,
      patient_name_hash: parsed.patient_name ? hashPatientName(parsed.patient_name) : null,
      status: 'processing',
      rejection_reason: null,
      metadata: {
        gr_chat_id: chatId,
        extraction_source: source,
        confidence: parsed.confidence_score,
      },
      processed_at: null,
      processed_by: null,
    });

    await logAuditEvent(null, 'voice_intake_received', 'system', {
      gr_chat_id: chatId,
      from_number: fromNumber,
      extraction_source: source,
      authorization_number: authNumber,
      needs_manual_review: !canAutoCreate,
    });

    if (isDemoMode()) {
      return NextResponse.json({
        success: true,
        demo: true,
        authorization_number: authNumber,
        case_id: canAutoCreate ? `voice-${Date.now()}` : null,
        status: canAutoCreate ? 'case_created' : 'queued_for_review',
        extraction_source: source,
        needs_manual_review: !canAutoCreate,
        manual_review_reasons: parsed.manual_review_reasons,
      });
    }

    // Low-confidence voice intakes are returned for manual handling rather than
    // auto-creating a junk case. (There is no dedicated voice_queue table yet —
    // a triage queue for voice is a future enhancement; avoiding a migration
    // here keeps this change schema-free.)
    if (!canAutoCreate) {
      return NextResponse.json({
        success: true,
        authorization_number: authNumber,
        case_id: null,
        status: 'queued_for_review',
        needs_manual_review: true,
        manual_review_reasons: parsed.manual_review_reasons,
      });
    }

    const supabase = getServiceClient();

    // Cross-channel dedup against every other channel.
    const fingerprint = computeSubmissionFingerprint({
      patient_name: parsed.patient_name,
      patient_dob: parsed.patient_dob,
      patient_member_id: parsed.member_id ?? null,
      procedure_codes: parsed.procedure_codes,
      from_number: fromNumber,
    });

    if (fingerprint) {
      const duplicate = await findDuplicateCase(fingerprint);
      if (duplicate) {
        await logAuditEvent(duplicate.case_id, 'voice_intake_duplicate_detected', 'system', {
          gr_chat_id: chatId,
          existing_case_number: duplicate.case_number,
          existing_age_hours: Math.round(duplicate.age_hours * 10) / 10,
        }, getRequestContext(request));
        return NextResponse.json({
          success: true,
          duplicate: true,
          case_id: duplicate.case_id,
          case_number: duplicate.case_number,
          authorization_number: duplicate.authorization_number,
          status: 'duplicate',
        });
      }
    }

    const caseNumber = `VUM-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`;

    const { data: newCase, error: caseError } = await supabase
      .from('cases')
      .insert({
        case_number: caseNumber,
        status: 'intake',
        priority: parsed.priority,
        service_category: parsed.service_category || 'other',
        review_type: parsed.review_type || 'prior_auth',
        patient_name: parsed.patient_name,
        patient_dob: parsed.patient_dob,
        patient_member_id: parsed.member_id,
        requesting_provider: parsed.provider_name,
        requesting_provider_npi: parsed.provider_npi,
        procedure_codes: parsed.procedure_codes,
        diagnosis_codes: parsed.diagnosis_codes,
        facility_name: parsed.facility_name,
        facility_type: parsed.facility_type,
        payer_name: parsed.payer_name,
        clinical_info: parsed.clinical_notes,
        intake_channel: 'phone',
        authorization_number: authNumber,
        intake_confirmation_sent: false,
        intake_received_at: new Date().toISOString(),
        submitted_documents: [],
        vertical: 'medical',
        submission_fingerprint: fingerprint,
      })
      .select('id, case_number')
      .single();

    if (caseError || !newCase) {
      return apiError(caseError, {
        operation: 'voice_intake_case_insert',
        actor: 'system',
        requestContext: getRequestContext(request),
        clientMessage: 'Failed to create case from voice intake',
      });
    }

    const caseId = newCase.id as string;

    // Receipt (best-effort) + intake log + audit.
    try {
      const confirmation = await sendReceiptConfirmation({
        caseId,
        authorizationNumber: authNumber,
        channel: 'phone',
      });
      await supabase
        .from('cases')
        .update({
          intake_confirmation_sent: confirmation.confirmation_sent,
          intake_processed_at: new Date().toISOString(),
        })
        .eq('id', caseId);
    } catch {
      // Non-fatal — the case is the source of truth.
    }

    await logIntakeEvent({
      channel: 'phone',
      source_identifier: fromNumber,
      authorization_number: authNumber,
      case_id: caseId,
      // canAutoCreate (checked above) guarantees a non-null patient_name here.
      patient_name_hash: hashPatientName(parsed.patient_name as string),
      status: 'case_created',
      rejection_reason: null,
      metadata: { gr_chat_id: chatId, extraction_source: source },
      processed_at: new Date().toISOString(),
      processed_by: 'system',
    });

    await logAuditEvent(caseId, 'case_created_from_voice', 'system', {
      gr_chat_id: chatId,
      authorization_number: authNumber,
      extraction_source: source,
    });

    // Channel-agnostic intake: run the shared downstream chassis so a voice
    // case lands the same as a portal case. Gated; off = current behavior.
    if (isChannelAgnosticIntakeEnabled()) {
      await finalizeIntakeCase(caseId, { channel: 'phone' });
    }

    return NextResponse.json({
      success: true,
      authorization_number: authNumber,
      case_id: caseId,
      case_number: newCase.case_number,
      status: 'case_created',
      extraction_source: source,
    });
  } catch (err) {
    return apiError(err, {
      operation: 'voice_intake',
      actor: 'system',
      requestContext: getRequestContext(request),
    });
  }
}
