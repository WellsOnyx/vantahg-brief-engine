/**
 * One Door — the normalized intake contract (Make-it-real Block 1).
 *
 * Every channel (fax, email, phone, manual/portal, Gravity Rails, BPO)
 * funnels into the SAME case engine. This module is the shared shape every
 * channel maps its raw payload onto, plus the validation + the case-insert
 * row builder, so "one door" is one code path instead of six near-copies.
 *
 * Pure + side-effect-free: it validates and shapes, it does not touch the
 * DB. The route does the insert + dedup using buildCaseInsert().
 */

export type IntakeChannel =
  | 'portal'
  | 'efax'
  | 'email'
  | 'phone'
  | 'api'
  | 'gravity_rails'
  | 'batch_upload';

export interface NormalizedIntake {
  channel: IntakeChannel;
  /** Free-form source id for audit (fax number, GR chat id, api key prefix). */
  source_identifier: string | null;
  patient_name: string;
  patient_dob: string | null;
  patient_member_id: string | null;
  patient_gender: string | null;
  procedure_codes: string[];
  diagnosis_codes: string[];
  procedure_description: string | null;
  clinical_question: string | null;
  requesting_provider: string | null;
  requesting_provider_npi: string | null;
  requesting_provider_specialty: string | null;
  facility_name: string | null;
  facility_type: string | null;
  payer_name: string | null;
  plan_type: string | null;
  priority: string;
  service_category: string;
  review_type: string;
  client_id: string | null;
  contact_email: string | null;
  document_urls: string[];
}

export interface IntakeValidationResult {
  ok: boolean;
  errors: string[];
  intake: NormalizedIntake | null;
}

const VALID_PRIORITIES = new Set(['standard', 'urgent', 'expedited']);
const VALID_REVIEW_TYPES = new Set([
  'prior_auth', 'medical_necessity', 'concurrent', 'retrospective',
  'peer_to_peer', 'appeal', 'second_level_review',
]);

function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}
function arr(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.trim().length > 0) : [];
}

/**
 * Validate + normalize a raw intake payload from any channel. The minimum
 * a case needs to enter the engine is a patient name + at least one
 * procedure code — everything else is enrichable downstream.
 */
export function normalizeIntake(
  channel: IntakeChannel,
  raw: Record<string, unknown>,
  sourceIdentifier: string | null = null,
): IntakeValidationResult {
  const errors: string[] = [];

  const patient_name = str(raw.patient_name);
  if (!patient_name) errors.push('patient_name is required');

  const procedure_codes = arr(raw.procedure_codes);
  if (procedure_codes.length === 0) errors.push('procedure_codes must be a non-empty array of strings');

  const priority = str(raw.priority) ?? 'standard';
  if (!VALID_PRIORITIES.has(priority)) errors.push(`priority must be one of: ${[...VALID_PRIORITIES].join(', ')}`);

  const review_type = str(raw.review_type) ?? 'prior_auth';
  if (!VALID_REVIEW_TYPES.has(review_type)) errors.push(`review_type must be one of: ${[...VALID_REVIEW_TYPES].join(', ')}`);

  if (errors.length > 0) {
    return { ok: false, errors, intake: null };
  }

  return {
    ok: true,
    errors: [],
    intake: {
      channel,
      source_identifier: sourceIdentifier,
      patient_name: patient_name!,
      patient_dob: str(raw.patient_dob),
      patient_member_id: str(raw.patient_member_id),
      patient_gender: str(raw.patient_gender),
      procedure_codes,
      diagnosis_codes: arr(raw.diagnosis_codes),
      procedure_description: str(raw.procedure_description),
      clinical_question: str(raw.clinical_question),
      requesting_provider: str(raw.requesting_provider),
      requesting_provider_npi: str(raw.requesting_provider_npi),
      requesting_provider_specialty: str(raw.requesting_provider_specialty),
      facility_name: str(raw.facility_name),
      facility_type: str(raw.facility_type),
      payer_name: str(raw.payer_name),
      plan_type: str(raw.plan_type),
      priority,
      service_category: str(raw.service_category) ?? 'other',
      review_type,
      client_id: str(raw.client_id),
      contact_email: str(raw.contact_email),
      document_urls: arr(raw.document_urls),
    },
  };
}

/**
 * Fingerprint inputs for cross-channel dedup — same fields every channel
 * dedups on (matches computeSubmissionFingerprint's expectations).
 */
export function fingerprintInputs(intake: NormalizedIntake) {
  return {
    patient_name: intake.patient_name,
    patient_dob: intake.patient_dob,
    patient_member_id: intake.patient_member_id,
    procedure_codes: intake.procedure_codes,
    from_number: intake.source_identifier,
  };
}

/**
 * Build the `cases` insert row from a normalized intake. Channel-agnostic —
 * every door produces an identical row shape, varying only by intake_channel.
 */
export function buildCaseInsert(
  intake: NormalizedIntake,
  opts: { caseNumber: string; authorizationNumber: string; fingerprint: string | null },
) {
  return {
    case_number: opts.caseNumber,
    status: 'intake',
    priority: intake.priority,
    service_category: intake.service_category,
    review_type: intake.review_type,
    patient_name: intake.patient_name,
    patient_dob: intake.patient_dob,
    patient_member_id: intake.patient_member_id,
    patient_gender: intake.patient_gender,
    requesting_provider: intake.requesting_provider,
    requesting_provider_npi: intake.requesting_provider_npi,
    requesting_provider_specialty: intake.requesting_provider_specialty,
    procedure_codes: intake.procedure_codes,
    diagnosis_codes: intake.diagnosis_codes,
    procedure_description: intake.procedure_description,
    clinical_question: intake.clinical_question,
    facility_name: intake.facility_name,
    facility_type: intake.facility_type,
    payer_name: intake.payer_name,
    plan_type: intake.plan_type,
    client_id: intake.client_id,
    intake_channel: intake.channel,
    authorization_number: opts.authorizationNumber,
    intake_confirmation_sent: false,
    intake_received_at: new Date().toISOString(),
    submitted_documents: intake.document_urls,
    vertical: 'medical',
    submission_fingerprint: opts.fingerprint,
  };
}
