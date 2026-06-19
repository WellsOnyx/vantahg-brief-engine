import { describe, it, expect } from 'vitest';
import { normalizeIntake, fingerprintInputs, buildCaseInsert } from '@/lib/intake/normalize';

/**
 * One Door — the shared intake contract every channel maps onto.
 * Pins the minimum-to-enter rule (patient + ≥1 procedure code), enum
 * validation, and that buildCaseInsert produces an identical row shape
 * varying only by intake_channel.
 */

describe('normalizeIntake', () => {
  const valid = {
    patient_name: 'Pat Doe',
    procedure_codes: ['72148'],
    patient_dob: '1980-01-01',
    diagnosis_codes: ['M54.5'],
  };

  it('accepts a minimal valid payload (name + one code)', () => {
    const r = normalizeIntake('gravity_rails', { patient_name: 'A', procedure_codes: ['X'] });
    expect(r.ok).toBe(true);
    expect(r.intake?.channel).toBe('gravity_rails');
    expect(r.intake?.priority).toBe('standard');
    expect(r.intake?.review_type).toBe('prior_auth');
  });

  it('rejects a missing patient name', () => {
    const r = normalizeIntake('gravity_rails', { procedure_codes: ['X'] });
    expect(r.ok).toBe(false);
    expect(r.errors).toContain('patient_name is required');
    expect(r.intake).toBeNull();
  });

  it('rejects empty / non-array procedure codes', () => {
    expect(normalizeIntake('gravity_rails', { patient_name: 'A', procedure_codes: [] }).ok).toBe(false);
    expect(normalizeIntake('gravity_rails', { patient_name: 'A' }).ok).toBe(false);
  });

  it('rejects invalid enums', () => {
    expect(normalizeIntake('gravity_rails', { ...valid, priority: 'whenever' }).ok).toBe(false);
    expect(normalizeIntake('gravity_rails', { ...valid, review_type: 'vibes' }).ok).toBe(false);
  });

  it('filters non-string entries out of code arrays', () => {
    const r = normalizeIntake('gravity_rails', { patient_name: 'A', procedure_codes: ['X', 1, null, 'Y'] });
    expect(r.intake?.procedure_codes).toEqual(['X', 'Y']);
  });

  it('carries the source identifier through', () => {
    const r = normalizeIntake('gravity_rails', valid, 'chat:abc123');
    expect(r.intake?.source_identifier).toBe('chat:abc123');
  });
});

describe('fingerprintInputs', () => {
  it('exposes the shared cross-channel dedup fields', () => {
    const r = normalizeIntake('gravity_rails', {
      patient_name: 'Pat Doe', procedure_codes: ['72148'], patient_member_id: 'M1',
    }, 'chat:1');
    const fp = fingerprintInputs(r.intake!);
    expect(fp).toEqual({
      patient_name: 'Pat Doe',
      patient_dob: null,
      patient_member_id: 'M1',
      procedure_codes: ['72148'],
      from_number: 'chat:1',
    });
  });
});

describe('buildCaseInsert', () => {
  it('produces a case row stamped with the channel + required fields', () => {
    const r = normalizeIntake('gravity_rails', {
      patient_name: 'Pat Doe', procedure_codes: ['72148'], priority: 'urgent',
    });
    const row = buildCaseInsert(r.intake!, {
      caseNumber: 'VUM-2026-000001',
      authorizationNumber: 'AUTH-1',
      fingerprint: 'fp-abc',
    });
    expect(row.intake_channel).toBe('gravity_rails');
    expect(row.status).toBe('intake');
    expect(row.case_number).toBe('VUM-2026-000001');
    expect(row.priority).toBe('urgent');
    expect(row.procedure_codes).toEqual(['72148']);
    expect(row.submission_fingerprint).toBe('fp-abc');
    expect(row.vertical).toBe('medical');
  });
});
