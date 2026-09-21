/**
 * Fail-closed gate: Muse payloads may carry relationship metadata only.
 *
 * Allowlist is the rule. A known PHI key is reported as `phi_field`.
 * Any other key is `unknown_field` and is also refused — clinical case
 * content must not land here under a new name.
 *
 * The result never echoes the rejected value.
 */

import {
  MUSE_CONTACT_ROLES,
  MUSE_SCHEDULING_INTENTS,
  type MuseContactRole,
  type MuseRelationshipRecord,
  type MuseSchedulingFlags,
  type MuseSchedulingIntent,
} from './types';

export const MUSE_ALLOWED_FIELDS = [
  'account_id',
  'contact_role',
  'scheduling_intent',
  'external_touchpoint_id',
] as const;

/**
 * Clinical and identifier keys. Presence anywhere in the payload
 * (including nested) is a hard reject. Not exhaustive of HIPAA —
 * the allowlist above is what actually gets stored.
 */
export const MUSE_PHI_FIELDS = [
  'patient_name',
  'patient_first_name',
  'patient_last_name',
  'patient_dob',
  'dob',
  'date_of_birth',
  'patient_member_id',
  'member_id',
  'member_ref',
  'mrn',
  'ssn',
  'diagnosis',
  'diagnoses',
  'clinical',
  'clinicals',
  'clinical_note',
  'clinical_notes',
  'rationale',
  'determination',
  'procedure',
  'procedure_codes',
  'service_or_rx',
  'icd',
  'cpt',
  'brief',
  'packet',
  'medical_record',
  'email',
  'phone',
  'contact_email',
  'contact_phone',
  'contact_name',
  'address',
  'patient_address',
  'patient_phone',
  'patient_gender',
  'npi',
  'dea_number',
  'fax_number',
  'from_number',
  'to_number',
] as const;

const PHI_KEYS = new Set<string>(MUSE_PHI_FIELDS.map((k) => k.toLowerCase()));
const ALLOWED_TOP = new Set<string>(MUSE_ALLOWED_FIELDS);
const ROLE_SET = new Set<string>(MUSE_CONTACT_ROLES);
const INTENT_SET = new Set<string>(MUSE_SCHEDULING_INTENTS);

const OPAQUE_ID = /^[A-Za-z0-9_.:-]{1,64}$/;
const EMAILISH = /@/;
const SSNISH = /\d{3}-\d{2}-\d{4}/;
const DATEISH = /\d{4}-\d{2}-\d{2}/;
const PHONEISH = /\d{3}[-.\s]\d{3}[-.\s]\d{4}/;

export type MusePhiGateResult =
  | { ok: true; record: MuseRelationshipRecord }
  | { ok: false; code: 'phi_field'; field: string }
  | { ok: false; code: 'unknown_field'; field: string }
  | { ok: false; code: 'invalid_shape'; field: string };

function phiKey(key: string): boolean {
  return PHI_KEYS.has(key.toLowerCase());
}

function looksLikeIdentifier(value: string): boolean {
  return EMAILISH.test(value) || SSNISH.test(value) || DATEISH.test(value) || PHONEISH.test(value);
}

/** Walk every key. PHI wins over unknown so the gate name stays honest. */
function findPhiKey(value: unknown, path: string): string | null {
  if (!value || typeof value !== 'object') return null;
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      const hit = findPhiKey(value[i], `${path}[${i}]`);
      if (hit) return hit;
    }
    return null;
  }
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (phiKey(key)) return path ? `${path}.${key}` : key;
    const hit = findPhiKey(child, path ? `${path}.${key}` : key);
    if (hit) return hit;
  }
  return null;
}

function findUnknownKey(value: unknown): string | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (!ALLOWED_TOP.has(key)) return key;
  }
  const intent = record.scheduling_intent;
  if (intent && typeof intent === 'object' && !Array.isArray(intent)) {
    for (const key of Object.keys(intent as Record<string, unknown>)) {
      if (!INTENT_SET.has(key)) return `scheduling_intent.${key}`;
    }
  }
  return null;
}

function emptyFlags(): MuseSchedulingFlags {
  return {
    kickoff: false,
    follow_up: false,
    hypercare_standup: false,
    renewal: false,
  };
}

/**
 * Screen an untrusted object. On success the return value is the only
 * shape the store accepts.
 */
export function screenMusePayload(input: unknown): MusePhiGateResult {
  const phi = findPhiKey(input, '');
  if (phi) return { ok: false, code: 'phi_field', field: phi };

  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { ok: false, code: 'invalid_shape', field: 'body' };
  }

  const unknown = findUnknownKey(input);
  if (unknown) return { ok: false, code: 'unknown_field', field: unknown };

  const body = input as Record<string, unknown>;

  if (typeof body.account_id !== 'string') {
    return { ok: false, code: 'invalid_shape', field: 'account_id' };
  }
  if (looksLikeIdentifier(body.account_id)) {
    return { ok: false, code: 'phi_field', field: 'account_id' };
  }
  if (!OPAQUE_ID.test(body.account_id)) {
    return { ok: false, code: 'invalid_shape', field: 'account_id' };
  }

  if (typeof body.contact_role !== 'string' || !ROLE_SET.has(body.contact_role)) {
    return { ok: false, code: 'invalid_shape', field: 'contact_role' };
  }

  const flags = emptyFlags();
  if (body.scheduling_intent !== undefined) {
    if (!body.scheduling_intent || typeof body.scheduling_intent !== 'object' || Array.isArray(body.scheduling_intent)) {
      return { ok: false, code: 'invalid_shape', field: 'scheduling_intent' };
    }
    for (const [key, value] of Object.entries(body.scheduling_intent as Record<string, unknown>)) {
      if (typeof value !== 'boolean') {
        if (typeof value === 'string' && (looksLikeIdentifier(value) || value.length > 32)) {
          return { ok: false, code: 'phi_field', field: `scheduling_intent.${key}` };
        }
        return { ok: false, code: 'invalid_shape', field: `scheduling_intent.${key}` };
      }
      flags[key as MuseSchedulingIntent] = value;
    }
  }

  let external: string | undefined;
  if (body.external_touchpoint_id !== undefined) {
    if (typeof body.external_touchpoint_id !== 'string') {
      return { ok: false, code: 'invalid_shape', field: 'external_touchpoint_id' };
    }
    if (looksLikeIdentifier(body.external_touchpoint_id)) {
      return { ok: false, code: 'phi_field', field: 'external_touchpoint_id' };
    }
    if (!OPAQUE_ID.test(body.external_touchpoint_id)) {
      return { ok: false, code: 'invalid_shape', field: 'external_touchpoint_id' };
    }
    external = body.external_touchpoint_id;
  }

  const record: MuseRelationshipRecord = {
    account_id: body.account_id,
    contact_role: body.contact_role as MuseContactRole,
    scheduling_intent: flags,
    ...(external ? { external_touchpoint_id: external } : {}),
  };
  return { ok: true, record };
}
