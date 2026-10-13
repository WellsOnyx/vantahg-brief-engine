import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { VHG_PATTERN_COUNT } from '@/lib/vhg/catalog';
import { getRedactedIdrPatterns } from '@/lib/vhg/patterns';
import { redactIdrRecord, residualIdentifierHits, toYearMonth } from '@/lib/vhg/redact';
import { getSyntheticIdrRecords } from '@/lib/vhg/synthetic-idr';

describe('VHG redaction', () => {
  const raw = getSyntheticIdrRecords();
  const redacted = raw.map((row, index) => redactIdrRecord(row, index));

  it('builds about 200 synthetic IDR rows', () => {
    expect(raw).toHaveLength(VHG_PATTERN_COUNT);
    expect(redacted).toHaveLength(VHG_PATTERN_COUNT);
  });

  it('drops direct identifiers and keeps month/year only', () => {
    const canary = raw[0];
    const pattern = redacted[0];
    expect(canary.patient_name).toBe('Zebediah Quillstone');
    expect(residualIdentifierHits(canary, pattern)).toEqual([]);
    expect(pattern.service_month).toBe(toYearMonth(canary.service_date));
    expect(pattern.service_month).toBe('2026-01');
    expect(pattern.dispute_month).toBe('2026-02');
    expect(pattern.pattern_id).toBe('pat-0000');
    expect(pattern.specialty).toBe(canary.specialty);
    expect(pattern.billed_to_qpa_ratio).toBeGreaterThan(1);
    expect(JSON.stringify(pattern)).not.toContain('Quillstone');
    expect(JSON.stringify(pattern)).not.toContain(canary.provider_npi);
    expect(JSON.stringify(pattern)).not.toContain(canary.member_id);
    expect(JSON.stringify(pattern)).not.toContain(canary.claim_number);
  });

  it('redacts every seeded row', () => {
    raw.forEach((row, index) => {
      expect(residualIdentifierHits(row, redacted[index])).toEqual([]);
    });
  });

  it('matches the committed redacted pattern file', () => {
    const file = path.join(process.cwd(), 'fixtures/vhg/idr-patterns.redacted.json');
    const onDisk = JSON.parse(readFileSync(file, 'utf8'));
    expect(onDisk).toEqual(getRedactedIdrPatterns());
  });
});
