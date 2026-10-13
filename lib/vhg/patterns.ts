import { redactIdrRecord } from './redact';
import { getSyntheticIdrRecords } from './synthetic-idr';
import type { RedactedIdrPattern } from './types';

let cached: RedactedIdrPattern[] | null = null;

/** Aggregated, redacted IDR pattern set built from the synthetic filings. */
export function getRedactedIdrPatterns(): RedactedIdrPattern[] {
  if (cached) return cached;
  cached = getSyntheticIdrRecords().map((row, index) => redactIdrRecord(row, index));
  return cached;
}
