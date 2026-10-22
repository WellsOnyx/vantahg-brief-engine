import { redactIdrRecord } from './redact';
import { getSyntheticIdrRecords } from './synthetic-idr';
import type { RedactedIdrPattern } from './types';

let cached: RedactedIdrPattern[] | null = null;

/**
 * Redacted synthetic rows for the redaction proof only.
 * The Likely IDR Contested Score does not read this set.
 */
export function getRedactedIdrPatterns(): RedactedIdrPattern[] {
  if (cached) return cached;
  cached = getSyntheticIdrRecords().map((row, index) => redactIdrRecord(row, index));
  return cached;
}
