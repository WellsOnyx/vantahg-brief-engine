import {
  ATTESTATION_SOURCES,
  CREDENTIAL_ITEM_KINDS,
  CREDENTIAL_ITEM_STATUSES,
  type AttestationSource,
  type CredentialItemInput,
  type CredentialItemKind,
  type CredentialItemStatus,
} from './types';

const ITEM_FIELDS = [
  'reviewer_id',
  'display_token',
  'item_id',
  'kind',
  'label',
  'state_code',
  'specialty_code',
  'status',
  'expires_at',
  'source',
  'vendor_ref',
] as const;

const REFUSED_KEYS = new Set([
  'patient_name',
  'patient',
  'dob',
  'date_of_birth',
  'member_id',
  'ssn',
  'npi',
  'license_number',
  'legal_name',
  'email',
  'phone',
  'address',
  'case_id',
  'case_body',
  'line',
  'line_of_business',
  'phi',
]);

const SYNTHETIC_ID = /^syn-[a-z0-9-]{1,64}$/;
const SYNTHETIC_LABEL = /^SYN-[A-Z0-9-]{1,40}$/;
const ISO_STAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const STATE_CODE = /^[A-Z]{2}$/;

export function isIsoStamp(value: string): boolean {
  return ISO_STAMP.test(value);
}

function isItemKind(value: unknown): value is CredentialItemKind {
  return typeof value === 'string' && (CREDENTIAL_ITEM_KINDS as readonly string[]).includes(value);
}

function isItemStatus(value: unknown): value is CredentialItemStatus {
  return typeof value === 'string' && (CREDENTIAL_ITEM_STATUSES as readonly string[]).includes(value);
}

function isSource(value: unknown): value is AttestationSource {
  return typeof value === 'string' && (ATTESTATION_SOURCES as readonly string[]).includes(value);
}

function asRecord(input: CredentialItemInput): Record<string, unknown> {
  return input as unknown as Record<string, unknown>;
}

/**
 * Refuse case payloads, direct identifiers, and a per-line copy of the record.
 * A passing check still does not select vendor versus delegated credentialing.
 */
export function itemInputRefusal(input: CredentialItemInput): string | null {
  const record = asRecord(input);
  const keys = Object.keys(record);
  if (keys.some((key) => REFUSED_KEYS.has(key))) return 'phi_or_case_refused';
  if (keys.some((key) => !(ITEM_FIELDS as readonly string[]).includes(key))) return 'field_refused';

  if (!SYNTHETIC_ID.test(input.reviewer_id) || !SYNTHETIC_ID.test(input.item_id)) return 'not_synthetic';
  if (!SYNTHETIC_LABEL.test(input.display_token) || !SYNTHETIC_LABEL.test(input.label)) return 'not_synthetic';
  if (!isItemKind(input.kind) || !isItemStatus(input.status)) return 'item_unrecognized';
  if (!isSource(input.source)) return 'source_unrecognized';
  if (input.expires_at !== null && (typeof input.expires_at !== 'string' || !isIsoStamp(input.expires_at))) {
    return 'not_synthetic';
  }

  if (input.kind === 'license') {
    if (typeof input.state_code !== 'string' || !STATE_CODE.test(input.state_code)) return 'state_code_required';
  } else if (input.state_code !== null && (typeof input.state_code !== 'string' || !STATE_CODE.test(input.state_code))) {
    return 'not_synthetic';
  }

  if (input.kind === 'board_certification') {
    if (typeof input.specialty_code !== 'string' || !SYNTHETIC_LABEL.test(input.specialty_code)) {
      return 'specialty_code_required';
    }
  } else if (
    input.specialty_code !== null &&
    (typeof input.specialty_code !== 'string' || !SYNTHETIC_LABEL.test(input.specialty_code))
  ) {
    return 'not_synthetic';
  }

  if (input.source === 'vanta_verified') {
    if (input.vendor_ref !== null) return 'vendor_ref_not_allowed';
  } else if (typeof input.vendor_ref !== 'string' || !SYNTHETIC_LABEL.test(input.vendor_ref)) {
    return 'vendor_ref_required';
  }

  return null;
}
