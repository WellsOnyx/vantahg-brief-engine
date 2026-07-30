/**
 * HIPAA Safe Harbor de-identification for the review training dataset.
 *
 * 45 CFR §164.514(b)(2) — the "Safe Harbor" method — requires removing 18
 * categories of identifiers. This module implements a best-effort scrub geared
 * at the specific data we hold on a `cases` row plus the free-text reviewer
 * reasoning that carries the training signal we actually care about.
 *
 * TWO-PASS STRATEGY
 *   1. Targeted redaction. Because we hold the exact identifiers for each case
 *      (patient name, member id, NPIs, provider/facility names, phone/fax,
 *      DOB, address, email, case/auth numbers), we replace those literal
 *      strings wherever they appear in free text. This is far stronger than
 *      generic NER — we know precisely what to remove.
 *   2. Regex safety net. A second pass catches the same identifier *shapes*
 *      (dates, phones, emails, SSNs, URLs, IPs, long numeric ids, ages > 89)
 *      that the targeted pass may have missed because they were entered
 *      differently than the structured field.
 *
 * WHAT IS DELIBERATELY KEPT
 *   - Clinical codes (CPT/HCPCS are 5 digits, ICD-10 are alphanumeric) — these
 *     are the signal, not PHI. The numeric safety net only fires on runs of
 *     >= 7 digits, so 5-digit CPT codes survive.
 *   - Sex/gender and ages <= 89 — permitted demographics under Safe Harbor.
 *   - Year (Safe Harbor permits year; only finer-grained dates must go).
 *
 * LIMITATIONS (read before the dataset leaves the environment)
 *   Free-text scrubbing is heuristic. It should be treated as a strong first
 *   line, not a substitute for a compliance sign-off on the exported artifact.
 *   Set REVIEW_DATASET_INCLUDE_FREETEXT=false to emit a structured/coded-only
 *   dataset with no scrubbed narrative if maximum conservatism is required.
 */

export const DEIDENT_METHOD = 'safe_harbor_v1';
export const DATASET_SCHEMA_VERSION = 1;

/** The categorized literal identifiers pulled off a single case. */
export interface CaseIdentifiers {
  patientNames: string[];
  providerNames: string[];
  memberIds: string[];
  numericIds: string[]; // NPI, DEA, case_number, authorization_number, tax id
  phones: string[];
  emails: string[];
  addresses: string[];
}

function s(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t.length ? t : null;
}

function push(arr: string[], v: unknown) {
  const val = s(v);
  if (val) arr.push(val);
}

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Collect the literal PHI values present on a case so we can redact them out
 * of any free text. `caseData` is intentionally loosely typed — this runs over
 * the raw DB row which carries fields (address, fax) not on the Case type.
 */
export function collectIdentifiers(caseData: Record<string, unknown>): CaseIdentifiers {
  const ids: CaseIdentifiers = {
    patientNames: [],
    providerNames: [],
    memberIds: [],
    numericIds: [],
    phones: [],
    emails: [],
    addresses: [],
  };

  push(ids.patientNames, caseData.patient_name);
  push(ids.patientNames, caseData.patient_first_name);
  push(ids.patientNames, caseData.patient_last_name);

  push(ids.providerNames, caseData.requesting_provider);
  push(ids.providerNames, caseData.servicing_provider);
  push(ids.providerNames, caseData.facility_name);

  push(ids.memberIds, caseData.patient_member_id);
  push(ids.memberIds, caseData.member_id);
  push(ids.memberIds, caseData.authorization_number);

  push(ids.numericIds, caseData.requesting_provider_npi);
  push(ids.numericIds, caseData.servicing_provider_npi);
  push(ids.numericIds, caseData.npi);
  push(ids.numericIds, caseData.dea_number);
  push(ids.numericIds, caseData.case_number);
  push(ids.numericIds, caseData.tax_id);

  push(ids.phones, caseData.patient_phone);
  push(ids.phones, caseData.phone);
  push(ids.phones, caseData.fax);
  push(ids.phones, caseData.from_number);
  push(ids.phones, caseData.to_number);

  push(ids.emails, caseData.patient_email);
  push(ids.emails, caseData.contact_email);
  push(ids.emails, caseData.email);

  push(ids.addresses, caseData.patient_address);
  push(ids.addresses, caseData.address_street);
  push(ids.addresses, caseData.address_city);
  push(ids.addresses, caseData.address_zip);

  return ids;
}

/** Redact a full name and each of its long, alphabetic parts. */
function redactName(text: string, name: string, placeholder: string): string {
  let out = replaceLiteral(text, name, placeholder);
  for (const part of name.split(/\s+/)) {
    // Only redact parts that are >= 3 chars and alphabetic — avoids nuking
    // initials/titles ("Dr", "MD") but over-redaction here is acceptable and
    // safe. This can remove a common word that happens to match a name part;
    // that trade favors privacy.
    if (part.length >= 3 && /^[A-Za-z][A-Za-z'-]*$/.test(part)) {
      out = out.replace(new RegExp(`\\b${escapeRegExp(part)}\\b`, 'gi'), placeholder);
    }
  }
  return out;
}

function replaceLiteral(text: string, literal: string, placeholder: string): string {
  if (!literal) return text;
  return text.replace(new RegExp(escapeRegExp(literal), 'gi'), placeholder);
}

/** Redact a numeric identifier both verbatim and digits-only (formatting-agnostic). */
function redactNumericId(text: string, id: string, placeholder: string): string {
  let out = replaceLiteral(text, id, placeholder);
  const digits = id.replace(/\D/g, '');
  if (digits.length >= 4) {
    out = replaceLiteral(out, digits, placeholder);
  }
  return out;
}

/**
 * De-identify a free-text string against a case's known identifiers, then run
 * the regex safety net. Returns null/'' unchanged for empty input.
 */
export function deidentifyText(
  text: string | null | undefined,
  ids: CaseIdentifiers,
): string | null {
  if (text == null) return null;
  if (typeof text !== 'string' || text.length === 0) return typeof text === 'string' ? text : null;

  let out = text;

  // ── Pass 1: targeted literal redaction (specific → generic order) ──
  for (const n of ids.patientNames) out = redactName(out, n, '[PATIENT]');
  for (const n of ids.providerNames) out = redactName(out, n, '[PROVIDER]');
  for (const id of ids.memberIds) out = redactNumericId(out, id, '[MEMBER_ID]');
  for (const id of ids.numericIds) out = redactNumericId(out, id, '[ID]');
  for (const e of ids.emails) out = replaceLiteral(out, e, '[EMAIL]');
  for (const p of ids.phones) out = redactNumericId(out, p, '[PHONE]');
  for (const a of ids.addresses) out = replaceLiteral(out, a, '[ADDRESS]');

  // ── Pass 2: regex safety net for identifier SHAPES ──
  // Email
  out = out.replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[EMAIL]');
  // URLs
  out = out.replace(/\bhttps?:\/\/[^\s)]+/gi, '[URL]');
  out = out.replace(/\bwww\.[^\s)]+/gi, '[URL]');
  // IPv4
  out = out.replace(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g, '[IP]');
  // SSN
  out = out.replace(/\b\d{3}-\d{2}-\d{4}\b/g, '[SSN]');
  // Phone numbers (US-ish, several common formats)
  out = out.replace(/(\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}\b/g, '[PHONE]');
  // Dates — ISO, numeric M/D/Y, and month-name forms. Year alone is kept.
  out = out.replace(/\b\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2})?)?\b/g, '[DATE]');
  out = out.replace(/\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b/g, '[DATE]');
  out = out.replace(
    /\b(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\.?\s+\d{1,2}(?:st|nd|rd|th)?,?\s+\d{4}\b/gi,
    '[DATE]',
  );
  // Ages over 89 must be aggregated (Safe Harbor). Ages <= 89 are kept.
  out = out.replace(/\b(\d{2,3})(\s*[-\s]?\s*)(year[-\s]?old|years?[\s-]?old|yo\b|y\/o)/gi, (m, ageStr: string, sep: string, unit: string) =>
    Number(ageStr) > 89 ? `90+ ${unit.replace(/^[-\s]+/, '')}` : m,
  );
  out = out.replace(/\bage[d]?\s+(\d{2,3})\b/gi, (m, ageStr: string) =>
    Number(ageStr) > 89 ? 'age 90+' : m,
  );
  // Long numeric runs (MRNs, member/account numbers). 7+ digits so 5-digit
  // CPT codes and most measurements survive.
  out = out.replace(/\b\d{7,}\b/g, '[ID]');

  // Tidy whitespace introduced by redactions.
  out = out.replace(/[ \t]{2,}/g, ' ');
  return out;
}

/** Parse a YYYY-MM-DD (or ISO) DOB into an integer age as of `asOf`. */
export function ageFromDob(
  dob: string | null | undefined,
  asOf?: Date,
): number | null {
  const val = s(dob);
  if (!val) return null;
  const born = new Date(val);
  if (Number.isNaN(born.getTime())) return null;
  const ref = asOf ?? new Date();
  let age = ref.getFullYear() - born.getFullYear();
  const m = ref.getMonth() - born.getMonth();
  if (m < 0 || (m === 0 && ref.getDate() < born.getDate())) age--;
  if (age < 0 || age > 130) return null;
  return age;
}

/**
 * Safe Harbor age: integer for 0–89, the string '90+' for anyone older
 * (all ages over 89 must be aggregated into a single category).
 */
export function safeHarborAge(
  dob: string | null | undefined,
  asOf?: Date,
): number | '90+' | null {
  const age = ageFromDob(dob, asOf);
  if (age == null) return null;
  return age > 89 ? '90+' : age;
}

/** Extract just the 4-digit year from an ISO timestamp (Safe Harbor permits year). */
export function yearOf(iso: string | null | undefined): number | null {
  const val = s(iso);
  if (!val) return null;
  const d = new Date(val);
  if (Number.isNaN(d.getTime())) return null;
  return d.getFullYear();
}

/**
 * Deep-scrub every string in a JSON-ish structure (used for the AI brief and
 * fact-check blobs). Arrays and nested objects are walked recursively; numbers,
 * booleans and null pass through untouched.
 */
export function deidentifyDeep(value: unknown, ids: CaseIdentifiers): unknown {
  if (value == null) return value;
  if (typeof value === 'string') return deidentifyText(value, ids);
  if (Array.isArray(value)) return value.map((v) => deidentifyDeep(v, ids));
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = deidentifyDeep(v, ids);
    }
    return out;
  }
  return value;
}
