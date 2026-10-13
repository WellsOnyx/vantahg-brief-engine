import type { RedactedIdrPattern, SyntheticIdrRecord } from './types';

const IDENTIFIER_KEYS = [
  'patient_name',
  'date_of_birth',
  'member_id',
  'street',
  'city',
  'postal_code',
  'provider_person_name',
  'provider_npi',
  'claim_number',
  'source_record_id',
  'service_date',
  'dispute_opened_date',
  'billed_amount',
  'qpa_amount',
] as const;

const FULL_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Coarsen an ISO date to month/year. Day is dropped. */
export function toYearMonth(isoDate: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!match) {
    throw new Error(`Expected YYYY-MM-DD, received ${isoDate}`);
  }
  return `${match[1]}-${match[2]}`;
}

export function billedToQpaRatio(billed: number, qpa: number): number {
  if (!Number.isFinite(billed) || !Number.isFinite(qpa) || qpa <= 0) return 0;
  return Math.round((billed / qpa) * 100) / 100;
}

/**
 * Strip direct identifiers from one synthetic IDR row.
 * Safe Harbor-style for this demo: names, DOB, member IDs, street/city/ZIP,
 * provider person name, NPI, and claim number are removed. Dates keep month
 * and year only. Dollar amounts collapse to a billed-to-QPA ratio.
 */
export function redactIdrRecord(raw: SyntheticIdrRecord, index: number): RedactedIdrPattern {
  const pattern: RedactedIdrPattern = {
    pattern_id: `pat-${String(index).padStart(4, '0')}`,
    service_month: toYearMonth(raw.service_date),
    dispute_month: toYearMonth(raw.dispute_opened_date),
    network_status: raw.network_status,
    specialty: raw.specialty,
    cpt: raw.cpt,
    service_line: raw.service_line,
    billed_to_qpa_ratio: billedToQpaRatio(raw.billed_amount, raw.qpa_amount),
    state: raw.state,
    facility_type: raw.facility_type,
    encounter: raw.encounter,
    idr_outcome: raw.idr_outcome,
    initiating_party: raw.initiating_party,
  };
  return pattern;
}

function sensitiveStrings(raw: SyntheticIdrRecord): string[] {
  return [
    raw.patient_name,
    raw.date_of_birth,
    raw.member_id,
    raw.street,
    raw.city,
    raw.postal_code,
    raw.provider_person_name,
    raw.provider_npi,
    raw.claim_number,
    raw.source_record_id,
    raw.service_date,
    raw.dispute_opened_date,
  ];
}

/** Tokens that must not appear in a redacted pattern. Empty list means clean. */
export function residualIdentifierHits(raw: SyntheticIdrRecord, redacted: RedactedIdrPattern): string[] {
  const hits: string[] = [];
  const blob = JSON.stringify(redacted);
  for (const token of sensitiveStrings(raw)) {
    if (token && blob.includes(token)) hits.push(token);
  }
  for (const key of Object.keys(redacted)) {
    if ((IDENTIFIER_KEYS as readonly string[]).includes(key)) hits.push(`key:${key}`);
  }
  const months = [redacted.service_month, redacted.dispute_month];
  for (const month of months) {
    if (FULL_DATE.test(month)) hits.push(`full-date:${month}`);
    if (!/^\d{4}-\d{2}$/.test(month)) hits.push(`bad-month:${month}`);
  }
  if (/\b\d{4}-\d{2}-\d{2}\b/.test(blob)) hits.push('full-date-in-blob');
  if (blob.includes(raw.provider_npi)) hits.push('npi');
  return hits;
}

export function assertRedacted(raw: SyntheticIdrRecord, redacted: RedactedIdrPattern): void {
  const hits = residualIdentifierHits(raw, redacted);
  if (hits.length > 0) {
    throw new Error(`Redaction left identifiers: ${hits.join(', ')}`);
  }
}
