import { describe, expect, it } from 'vitest';
import { evaluatePartA } from '@/lib/iro/attestation';
import { PART_A_QUESTIONS } from '@/lib/iro/types';
import { runSyntheticOhioWalkthrough } from '@/lib/iro/synthetic-ohio';

const NO = {
  financial_conflict: 'no' as const,
  familial_conflict: 'no' as const,
  treating_relationship: 'no' as const,
  credential_concern: 'no' as const,
};

describe('Part A attestation gate', () => {
  it('stops on any yes, any blank, or a missing signature', () => {
    expect(evaluatePartA({ signed: true, answers: { ...NO, familial_conflict: 'yes' } }).code).toBe(
      'attestation_yes',
    );
    expect(evaluatePartA({ signed: true, answers: { ...NO, credential_concern: '' } }).code).toBe(
      'attestation_blank',
    );
    const missing = { ...NO };
    delete (missing as Partial<typeof missing>).treating_relationship;
    expect(evaluatePartA({ signed: true, answers: missing }).code).toBe('attestation_blank');
    expect(evaluatePartA({ signed: false, answers: NO }).code).toBe('attestation_unsigned');
    expect(PART_A_QUESTIONS).toHaveLength(4);
  });

  it('passes only when every answer is no and the form is signed', () => {
    const passed = evaluatePartA({ signed: true, answers: NO });
    expect(passed.passed).toBe(true);
    expect(passed.code).toBe('attestation_passed');
  });

  it('does not release records while the gate is stopped', () => {
    const run = runSyntheticOhioWalkthrough();
    expect(run.stops).toContain('attestation_yes');
    expect(run.stops).toContain('attestation_required');
    const releaseAttempts = run.transcript.filter((row) => row.action === 'release_records');
    expect(releaseAttempts[0].ok).toBe(false);
    expect(releaseAttempts[1].ok).toBe(false);
    expect(releaseAttempts.at(-1)?.ok).toBe(true);
    expect(run.case.records.released_on_version).toBe(1);
    expect(run.case.attestation?.passed).toBe(true);
  });
});
