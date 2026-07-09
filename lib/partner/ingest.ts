import { getServiceClient } from '@/lib/supabase';
import { logAuditEvent } from '@/lib/audit';
import {
  generateAuthorizationNumber,
  logIntakeEvent,
  hashPatientName,
} from '@/lib/intake/confirmation';
import { computeSubmissionFingerprint, findDuplicateCase } from '@/lib/intake/efax/storage';
import { dispatchFinalization } from '@/lib/intake/brief-queue';
import type { PartnerPrincipal } from '@/lib/partner/auth';
import type { CanonicalCase } from '@/lib/connectors/types';

/**
 * Shared partner-side ingest: ONE ledger-guarded creation path that every
 * transport rail funnels through (FHIR PAS, X12 278, and future rails).
 *
 * Contract identical to the Partner API v1 submit route:
 *   1. Claim the idempotency key in intake_submissions (PK) BEFORE anything
 *      is created — concurrent duplicates are structurally impossible.
 *   2. Content-fingerprint dedup as the secondary, cross-channel net.
 *   3. Insert the case with tenant binding from the PARTNER KEY, never the
 *      payload.
 *   4. dispatchFinalization — queue mode when ENABLE_BRIEF_QUEUE is on.
 *
 * The v1 REST route keeps its own inline copy of this flow (it predates
 * this module); converging it onto ingestCanonicalCase is a follow-up —
 * behavior is contract-identical either way.
 */

export type IngestOutcome =
  | { kind: 'created'; case_id: string; case_number: string; authorization_number: string }
  | { kind: 'idempotent'; case_id: string | null; status: string; first_seen_at: string | null }
  | { kind: 'duplicate_content'; case_id: string; case_number: string }
  | { kind: 'error'; message: string };

/**
 * Fetch the authorization number of an existing case — used by rails whose
 * response format must always carry a certification reference (X12 HCR02,
 * FHIR preAuthRef) even on an idempotent replay of a prior submission.
 */
export async function getCaseAuthNumber(caseId: string): Promise<string | null> {
  const supabase = getServiceClient();
  const { data } = await supabase
    .from('cases')
    .select('authorization_number')
    .eq('id', caseId)
    .maybeSingle();
  return (data?.authorization_number as string | null) ?? null;
}

export async function ingestCanonicalCase(
  partner: PartnerPrincipal,
  canonical: CanonicalCase,
  opts: { rail: string; contractVersion: string },
): Promise<IngestOutcome> {
  const supabase = getServiceClient();
  const idempotencyKey = canonical.client_reference;
  const ledgerId = `partner:${partner.client_id}:${idempotencyKey}`;

  // 1. Ledger claim first.
  const { error: claimError } = await supabase
    .from('intake_submissions')
    .insert({
      submission_id: ledgerId,
      channel: 'api',
      contract_version: `${opts.rail}:${opts.contractVersion}`,
      status: 'processing',
    })
    .select('submission_id')
    .single();

  if (claimError) {
    const conflict =
      (claimError as { code?: string }).code === '23505' ||
      /duplicate key|unique constraint/i.test(claimError.message ?? '');
    if (!conflict) return { kind: 'error', message: 'ledger_claim_failed' };
    const { data: existing } = await supabase
      .from('intake_submissions')
      .select('case_id, status, first_seen_at')
      .eq('submission_id', ledgerId)
      .maybeSingle();
    return {
      kind: 'idempotent',
      case_id: (existing?.case_id as string | null) ?? null,
      status: (existing?.status as string) ?? 'processing',
      first_seen_at: (existing?.first_seen_at as string | null) ?? null,
    };
  }

  const resolve = (status: string, caseId: string | null) =>
    supabase
      .from('intake_submissions')
      .update({ status, case_id: caseId, resolved_at: new Date().toISOString() })
      .eq('submission_id', ledgerId);
  const releaseClaim = () =>
    supabase.from('intake_submissions').delete().eq('submission_id', ledgerId);

  // 2. Content dedup (secondary net).
  const fingerprint = computeSubmissionFingerprint({
    patient_name: canonical.patient.name,
    patient_dob: canonical.patient.dob ?? null,
    patient_member_id: canonical.patient.member_id ?? null,
    procedure_codes: canonical.procedure_codes,
    from_number: null,
  });
  if (fingerprint) {
    const dup = await findDuplicateCase(fingerprint);
    if (dup) {
      await resolve('duplicate', dup.case_id);
      return { kind: 'duplicate_content', case_id: dup.case_id, case_number: dup.case_number };
    }
  }

  // 3. Create the case — tenant from the KEY.
  const authNumber = await generateAuthorizationNumber();
  const { data: seqVal } = await supabase.rpc('next_case_seq');
  const caseNumber = `VUM-${opts.rail.toUpperCase()}-${String(seqVal ?? Date.now()).padStart(6, '0').slice(-8)}`;

  const { data: newCase, error: caseError } = await supabase
    .from('cases')
    .insert({
      case_number: caseNumber,
      status: 'intake',
      case_type: canonical.case_type,
      review_type: canonical.review_type,
      priority: canonical.priority,
      service_category: canonical.service_category || 'other',
      patient_name: canonical.patient.name,
      patient_dob: canonical.patient.dob ?? null,
      patient_member_id: canonical.patient.member_id ?? null,
      requesting_provider: canonical.requesting_provider?.name ?? null,
      requesting_provider_npi: canonical.requesting_provider?.npi ?? null,
      procedure_codes: canonical.procedure_codes,
      diagnosis_codes: canonical.diagnosis_codes ?? [],
      procedure_description: canonical.procedure_description ?? null,
      clinical_info: canonical.clinical_summary ?? null,
      facility_name: canonical.facility?.name ?? null,
      facility_type: canonical.facility?.type ?? null,
      payer_name: canonical.payer_name ?? null,
      turnaround_deadline: canonical.turnaround_deadline ?? null,
      client_id: partner.client_id,
      external_reference: idempotencyKey,
      intake_channel: 'api',
      authorization_number: authNumber,
      intake_received_at: new Date().toISOString(),
      submitted_documents: canonical.document_urls ?? [],
      vertical: 'medical',
      submission_fingerprint: fingerprint,
    })
    .select('id, case_number')
    .single();

  if (caseError || !newCase) {
    await releaseClaim(); // partner's retry with the same key can succeed
    return { kind: 'error', message: 'case_insert_failed' };
  }

  const caseId = newCase.id as string;
  await resolve('case_created', caseId);

  await logIntakeEvent({
    channel: 'api',
    source_identifier: `${partner.name} (${opts.rail})`,
    authorization_number: authNumber,
    case_id: caseId,
    patient_name_hash: hashPatientName(canonical.patient.name),
    status: 'case_created',
    rejection_reason: null,
    metadata: {
      partner_key_id: partner.key_id,
      rail: opts.rail,
      client_reference: idempotencyKey,
      case_type: canonical.case_type,
      source_system: canonical.source_system ?? null,
    },
    processed_at: new Date().toISOString(),
    processed_by: 'connector-rail',
  });
  await logAuditEvent(caseId, 'partner_case_submitted', partner.name, {
    partner_key_id: partner.key_id,
    rail: opts.rail,
    client_reference: idempotencyKey,
    case_type: canonical.case_type,
    review_type: canonical.review_type,
  });

  await dispatchFinalization(caseId, { channel: 'api', actor: `rail:${opts.rail}` });

  return {
    kind: 'created',
    case_id: caseId,
    case_number: newCase.case_number as string,
    authorization_number: authNumber,
  };
}
