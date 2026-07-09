/**
 * POST /api/intake/voice — Canonical Intake Contract v1.1, phone channel.
 *
 * THE CORE DEFINES THIS CONTRACT; Gravity Rail conforms to it. The
 * authoritative spec is docs/INTAKE_CONTRACT.md (GR-team quickstart:
 * docs/GRAVITY_RAIL_INTEGRATION.md). Schema, signing recipe, replay window
 * and error codes are shared with this route via lib/intake/gr-contract.ts,
 * and scripts/gr-intake-verify.ts is the acceptance test both sides run.
 *
 * Contract summary (v1.1):
 *   - HMAC-SHA256 over `${X-GR-Timestamp}.${rawBody}` in X-GR-Signature,
 *     verified against every active secret (GR_WEBHOOK_SECRET primary;
 *     rotation without downtime). Timestamps outside ±300s are rejected as
 *     replays. The v1 legacy scheme (plain body HMAC in
 *     X-Webhook-Signature) is accepted during the transition window.
 *   - Required envelope: contract_version "1.0"/"1.1", opaque
 *     submission_id, intake_channel "phone".
 *   - Idempotency: submission_id is claimed in intake_submissions (PK) BEFORE
 *     case creation — a duplicate returns 409 with the original case_id. No
 *     double-created cases, ever.
 *   - Success is 202 { case_id, received_at, contract_version, ... }.
 *   - Schema-valid but content-deficient payloads pend cleanly (202,
 *     status "pended_for_review", intake_log + audit trail — never
 *     silent corruption, never brief_ready).
 *   - Sandbox: X-GR-Sandbox header, honored only when INTAKE_SANDBOX_ENABLED
 *     is set in the environment (MVP env). Runs the REAL flow; cases are
 *     tagged with the SBX- case-number prefix for cleanup.
 *
 * PHI: nothing from the payload body appears in URLs, logs, or audit rows —
 * patient names are hashed, validation errors carry field paths only.
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
import {
  INTAKE_CONTRACT_VERSION,
  SIGNATURE_HEADER,
  TIMESTAMP_HEADER,
  LEGACY_SIGNATURE_HEADER,
  SANDBOX_HEADER,
  SANDBOX_CASE_PREFIX,
  validateVoicePayload,
  verifyIntakeSignature,
  getIntakeWebhookSecrets,
  isIntakeSandboxEnabled,
  type VoiceIntakePayload,
  type IntakeErrorCode,
  type SchemaFieldError,
} from '@/lib/intake/gr-contract';
import { apiError } from '@/lib/api-error';
import { getRequestContext } from '@/lib/security';

export const dynamic = 'force-dynamic';

/** Structured error body — the exact shape documented in INTAKE_CONTRACT.md §7. */
function contractError(
  status: number,
  code: IntakeErrorCode,
  message: string,
  extra: Record<string, unknown> = {},
): NextResponse {
  return NextResponse.json(
    { error: { code, message, ...extra }, contract_version: INTAKE_CONTRACT_VERSION },
    { status },
  );
}

/** Collapse a GR transcript (string or message array) into plain text. */
function transcriptToText(payload: VoiceIntakePayload): string {
  if (typeof payload.transcript === 'string') return payload.transcript;
  const msgs = Array.isArray(payload.transcript) ? payload.transcript : [];
  return msgs
    .filter((m) => m && typeof m.content === 'string')
    .map((m) => `${m.role ?? 'speaker'}: ${m.content}`)
    .join('\n');
}

function asArr(v: string[] | string | undefined): string[] {
  if (Array.isArray(v)) return v.map(String).map((s) => s.trim()).filter(Boolean);
  if (typeof v === 'string' && v.trim()) {
    return v.split(/[,;\s]+/).map((s) => s.trim()).filter(Boolean);
  }
  return [];
}

/**
 * Normalize a v1 voice payload into the clinical fields the case insert
 * needs. Prefers GR's structured `field_values` (canonical keys only —
 * see INTAKE_CONTRACT.md §4.3); falls back to text extraction over the
 * transcript via the shared channel-neutral parser.
 */
function normalizeVoice(payload: VoiceIntakePayload): {
  parsed: ParsedEmailData;
  source: 'field_values' | 'transcript';
} {
  const transcriptText = transcriptToText(payload);

  // Always run the text extractor — it yields confidence + manual-review
  // flags for free, and is the fallback when GR sends no structured fields.
  const emailPayload: EmailPayload = {
    from: payload.from_number,
    to: 'voice-intake@vantaum.com',
    subject: payload.title || 'Voice intake (Gravity Rail)',
    text: transcriptText,
    attachments: 0,
  };
  const parsed = parseEmailPayload(emailPayload);

  const fv = payload.field_values;
  if (fv && Object.keys(fv).length > 0) {
    const procedureCodes = asArr(fv.procedure_codes);
    const diagnosisCodes = asArr(fv.diagnosis_codes);
    const merged: ParsedEmailData = {
      ...parsed,
      patient_name: fv.patient_name?.trim() || parsed.patient_name,
      patient_dob: fv.patient_dob?.trim() || parsed.patient_dob,
      member_id: fv.member_id?.trim() || parsed.member_id,
      provider_name: fv.provider_name?.trim() || parsed.provider_name,
      provider_npi: fv.provider_npi?.trim() || parsed.provider_npi,
      facility_name: fv.facility_name?.trim() || parsed.facility_name,
      payer_name: fv.payer_name?.trim() || parsed.payer_name,
      procedure_codes: procedureCodes.length > 0 ? procedureCodes : parsed.procedure_codes,
      diagnosis_codes: diagnosisCodes.length > 0 ? diagnosisCodes : parsed.diagnosis_codes,
      clinical_notes: fv.clinical_summary?.trim() || parsed.clinical_notes,
      priority: fv.priority ?? parsed.priority,
    };
    return { parsed: merged, source: 'field_values' };
  }

  return { parsed, source: 'transcript' };
}

export async function POST(request: NextRequest) {
  const receivedAt = new Date().toISOString();
  try {
    const rateLimited = await applyRateLimit(request, { maxRequests: 60 });
    if (rateLimited) return rateLimited;

    // ------------------------------------------------------------------
    // 1. Signature + replay verification (contract §5). Fail closed: a
    //    production deployment without a configured secret refuses intake
    //    rather than accepting unsigned traffic.
    // ------------------------------------------------------------------
    const rawBody = await request.text();
    const secrets = getIntakeWebhookSecrets();

    if (secrets.length === 0) {
      if (process.env.NODE_ENV === 'production') {
        return contractError(
          503,
          'not_configured',
          'Intake webhook secret is not configured on this deployment.',
        );
      }
      // Dev/test only: unsigned traffic allowed so local flows work.
    } else {
      const verdict = verifyIntakeSignature({
        rawBody,
        signatureHeader: request.headers.get(SIGNATURE_HEADER),
        timestampHeader: request.headers.get(TIMESTAMP_HEADER),
        legacySignatureHeader: request.headers.get(LEGACY_SIGNATURE_HEADER),
        secrets,
      });
      if (!verdict.ok) {
        await logAuditEvent(null, 'security:voice_webhook_rejected', 'system', {
          channel: 'phone',
          reason: verdict.code,
        }, getRequestContext(request));
        return contractError(401, verdict.code, 'Request signature verification failed.');
      }
      if (verdict.scheme === 'v1_legacy') {
        // Transition-window visibility: shows in the trail until GR flips
        // to v1.1 signing and the window can be closed.
        await logAuditEvent(null, 'gr_intake_legacy_signature_used', 'system', {
          channel: 'phone',
        });
      }
    }

    // ------------------------------------------------------------------
    // 2. Schema validation (contract §4). Field paths only — no values.
    // ------------------------------------------------------------------
    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(rawBody);
    } catch {
      return contractError(400, 'schema_invalid', 'Body is not valid JSON.', {
        errors: [{ path: '(root)', message: 'invalid JSON' }] satisfies SchemaFieldError[],
      });
    }

    const validation = validateVoicePayload(parsedJson);
    if (!validation.ok) {
      await logAuditEvent(null, 'gr_intake_schema_invalid', 'system', {
        channel: 'phone',
        error_count: validation.errors.length,
        error_paths: validation.errors.map((e) => e.path).slice(0, 10),
      });
      return contractError(400, 'schema_invalid', 'Payload failed schema validation.', {
        errors: validation.errors,
      });
    }
    const body = validation.payload;

    // ------------------------------------------------------------------
    // 3. Sandbox gate (contract §9) — environment-scoped, never a
    //    demo-mode shortcut. Honored only where INTAKE_SANDBOX_ENABLED=true.
    // ------------------------------------------------------------------
    const sandboxRequested = (request.headers.get(SANDBOX_HEADER) ?? '').toLowerCase() === 'true';
    if (sandboxRequested && !isIntakeSandboxEnabled()) {
      return contractError(
        403,
        'sandbox_disabled',
        'Sandbox submissions are not enabled in this environment.',
      );
    }
    const sandbox = sandboxRequested && isIntakeSandboxEnabled();

    const { parsed, source } = normalizeVoice(body);
    const authNumber = await generateAuthorizationNumber();

    // Voice auto-create gate (contract §8): create the case when we have a
    // patient name + at least one procedure code; anything less pends
    // cleanly for human follow-up instead of creating a junk case.
    const canAutoCreate = !!parsed.patient_name && parsed.procedure_codes.length > 0;

    await logIntakeEvent({
      channel: 'phone',
      source_identifier: body.from_number,
      authorization_number: authNumber,
      case_id: null,
      patient_name_hash: parsed.patient_name ? hashPatientName(parsed.patient_name) : null,
      status: 'processing',
      rejection_reason: null,
      metadata: {
        submission_id: body.submission_id,
        contract_version: body.contract_version,
        gr_chat_id: body.chat_id ?? null,
        extraction_source: source,
        confidence: parsed.confidence_score,
        sandbox,
      },
      processed_at: null,
      processed_by: null,
    });

    await logAuditEvent(null, 'voice_intake_received', 'system', {
      submission_id: body.submission_id,
      gr_chat_id: body.chat_id ?? null,
      from_number: body.from_number,
      extraction_source: source,
      authorization_number: authNumber,
      needs_manual_review: !canAutoCreate,
      sandbox,
    });

    if (isDemoMode()) {
      // Local/dev demo only (production demo mode is refused upstream by the
      // platform guards). No idempotency ledger in demo — nothing persists.
      return NextResponse.json(
        {
          contract_version: INTAKE_CONTRACT_VERSION,
          received_at: receivedAt,
          demo: true,
          submission_id: body.submission_id,
          authorization_number: authNumber,
          case_id: canAutoCreate ? `voice-${Date.now()}` : null,
          status: canAutoCreate ? 'case_created' : 'pended_for_review',
          extraction_source: source,
          needs_manual_review: !canAutoCreate,
          manual_review_reasons: parsed.manual_review_reasons,
        },
        { status: 202 },
      );
    }

    const supabase = getServiceClient();

    // ------------------------------------------------------------------
    // 4. Idempotency claim (contract §6). Insert-first: the PK on
    //    intake_submissions is the guarantee that two requests with the
    //    same submission_id can never both create a case.
    // ------------------------------------------------------------------
    const { error: claimError } = await supabase
      .from('intake_submissions')
      .insert({
        submission_id: body.submission_id,
        channel: 'phone',
        contract_version: body.contract_version,
        status: 'processing',
        sandbox,
      })
      .select('submission_id')
      .single();

    if (claimError) {
      const isUniqueViolation =
        (claimError as { code?: string }).code === '23505' ||
        /duplicate key|unique constraint/i.test(claimError.message ?? '');
      if (!isUniqueViolation) {
        return apiError(claimError, {
          operation: 'voice_intake_idempotency_claim',
          actor: 'system',
          requestContext: getRequestContext(request),
          clientMessage: 'Failed to record submission',
        });
      }

      const { data: existing } = await supabase
        .from('intake_submissions')
        .select('submission_id, case_id, status, first_seen_at')
        .eq('submission_id', body.submission_id)
        .maybeSingle();

      await logAuditEvent(existing?.case_id ?? null, 'voice_intake_duplicate_submission', 'system', {
        submission_id: body.submission_id,
        original_status: existing?.status ?? 'unknown',
      });

      return NextResponse.json(
        {
          error: {
            code: 'duplicate' satisfies IntakeErrorCode,
            message: 'This submission_id has already been received. Original outcome attached.',
            duplicate_kind: 'submission_id',
          },
          contract_version: INTAKE_CONTRACT_VERSION,
          received_at: existing?.first_seen_at ?? receivedAt,
          submission_id: body.submission_id,
          case_id: existing?.case_id ?? null,
          status: existing?.status ?? 'processing',
        },
        { status: 409 },
      );
    }

    const resolveSubmission = async (status: string, caseId: string | null) => {
      await supabase
        .from('intake_submissions')
        .update({ status, case_id: caseId, resolved_at: new Date().toISOString() })
        .eq('submission_id', body.submission_id);
    };

    // ------------------------------------------------------------------
    // 5. Pend-cleanly path (contract §8): schema-valid but content-
    //    deficient. Recorded in the intake log + audit trail + idempotency
    //    ledger; never silently dropped, never a case, never brief_ready.
    // ------------------------------------------------------------------
    if (!canAutoCreate) {
      await resolveSubmission('pended_for_review', null);
      return NextResponse.json(
        {
          contract_version: INTAKE_CONTRACT_VERSION,
          received_at: receivedAt,
          submission_id: body.submission_id,
          authorization_number: authNumber,
          case_id: null,
          status: 'pended_for_review',
          needs_manual_review: true,
          manual_review_reasons: parsed.manual_review_reasons,
        },
        { status: 202 },
      );
    }

    // Cross-channel content dedup (secondary to submission_id idempotency):
    // same patient + codes + caller within the 24h window, from ANY channel.
    const fingerprint = computeSubmissionFingerprint({
      patient_name: parsed.patient_name,
      patient_dob: parsed.patient_dob,
      patient_member_id: parsed.member_id ?? null,
      procedure_codes: parsed.procedure_codes,
      from_number: body.from_number,
    });

    if (fingerprint) {
      const duplicate = await findDuplicateCase(fingerprint);
      if (duplicate) {
        await resolveSubmission('duplicate', duplicate.case_id);
        await logAuditEvent(duplicate.case_id, 'voice_intake_duplicate_detected', 'system', {
          submission_id: body.submission_id,
          gr_chat_id: body.chat_id ?? null,
          existing_case_number: duplicate.case_number,
          existing_age_hours: Math.round(duplicate.age_hours * 10) / 10,
        }, getRequestContext(request));
        return NextResponse.json(
          {
            error: {
              code: 'duplicate' satisfies IntakeErrorCode,
              message: 'A case matching this submission already exists (content fingerprint).',
              duplicate_kind: 'content_fingerprint',
            },
            contract_version: INTAKE_CONTRACT_VERSION,
            received_at: receivedAt,
            submission_id: body.submission_id,
            case_id: duplicate.case_id,
            case_number: duplicate.case_number,
            authorization_number: duplicate.authorization_number,
            status: 'duplicate',
          },
          { status: 409 },
        );
      }
    }

    const caseNumber = `${sandbox ? SANDBOX_CASE_PREFIX + '-' : ''}VUM-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`;

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
        intake_received_at: receivedAt,
        submitted_documents: [],
        vertical: 'medical',
        submission_fingerprint: fingerprint,
      })
      .select('id, case_number')
      .single();

    if (caseError || !newCase) {
      // Release the idempotency claim so the sender's retry (same
      // submission_id, per contract §7 retry rules) can succeed.
      await supabase
        .from('intake_submissions')
        .delete()
        .eq('submission_id', body.submission_id);
      return apiError(caseError, {
        operation: 'voice_intake_case_insert',
        actor: 'system',
        requestContext: getRequestContext(request),
        clientMessage: 'Failed to create case from voice intake',
      });
    }

    const caseId = newCase.id as string;
    await resolveSubmission('case_created', caseId);

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
      source_identifier: body.from_number,
      authorization_number: authNumber,
      case_id: caseId,
      // canAutoCreate (checked above) guarantees a non-null patient_name here.
      patient_name_hash: hashPatientName(parsed.patient_name as string),
      status: 'case_created',
      rejection_reason: null,
      metadata: {
        submission_id: body.submission_id,
        gr_chat_id: body.chat_id ?? null,
        extraction_source: source,
        sandbox,
      },
      processed_at: new Date().toISOString(),
      processed_by: 'system',
    });

    await logAuditEvent(caseId, 'case_created_from_voice', 'system', {
      submission_id: body.submission_id,
      gr_chat_id: body.chat_id ?? null,
      authorization_number: authNumber,
      extraction_source: source,
      sandbox,
    });

    // Channel-agnostic intake: run the shared downstream chassis so a voice
    // case lands the same as a portal case. Gated; off = current behavior.
    if (isChannelAgnosticIntakeEnabled()) {
      await finalizeIntakeCase(caseId, { channel: 'phone' });
    }

    return NextResponse.json(
      {
        contract_version: INTAKE_CONTRACT_VERSION,
        received_at: receivedAt,
        submission_id: body.submission_id,
        authorization_number: authNumber,
        case_id: caseId,
        case_number: newCase.case_number,
        status: 'case_created',
        extraction_source: source,
        sandbox,
      },
      { status: 202 },
    );
  } catch (err) {
    return apiError(err, {
      operation: 'voice_intake',
      actor: 'system',
      requestContext: getRequestContext(request),
    });
  }
}
