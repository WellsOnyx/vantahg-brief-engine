import { describe, it, expect } from 'vitest';
import {
  getCriteriaSet,
  findCriteriaSetForCodes,
  assessFromBrief,
  CRITERIA_LIBRARY_VERSION,
  CRITERIA_PROVENANCE,
} from '@/lib/criteria/library';
import { medicalCriteria } from '@/lib/medical-criteria';

/**
 * Locked decision (2026-06-12): VantaUM builds its own criteria engine —
 * no InterQual / MCG licensing. These tests pin the provenance contract
 * so a future refactor can't quietly reintroduce commercial criteria as
 * the basis of a review.
 */

describe('VantaUM criteria sets', () => {
  it('wraps a known code with citable identity and provenance', () => {
    const set = getCriteriaSet('72148');
    expect(set).not.toBeNull();
    expect(set!.set_id).toBe(`VC-72148-v${CRITERIA_LIBRARY_VERSION}`);
    expect(set!.provenance).toBe(CRITERIA_PROVENANCE);
    expect(set!.criteria.length).toBeGreaterThan(0);
    expect(set!.citations.length).toBeGreaterThan(0);
  });

  it('normalizes code case and whitespace', () => {
    expect(getCriteriaSet(' e0601 ')?.set_id).toBe(`VC-E0601-v${CRITERIA_LIBRARY_VERSION}`);
  });

  it('returns null for an ungoverned code', () => {
    expect(getCriteriaSet('99999')).toBeNull();
  });

  it('finds the first governed code in a case code list', () => {
    expect(findCriteriaSetForCodes(['99999', 'J1745'])?.code).toBe('J1745');
    expect(findCriteriaSetForCodes(['99998', '99999'])).toBeNull();
  });

  it('no set cites a commercial criteria product — the library is ours', () => {
    for (const [code, entry] of Object.entries(medicalCriteria)) {
      for (const ref of entry.guideline_references) {
        expect(ref, `code ${code} cites "${ref}"`).not.toMatch(/interqual|mcg|milliman/i);
      }
    }
  });

  it('every demo procedure code is governed by a VantaUM set', () => {
    // The seven demo cases — keep the demo story consistent with the library.
    for (const code of ['72148', '27447', 'J1745', 'E0601', '90837', '64483', '27130']) {
      expect(getCriteriaSet(code), `missing set for ${code}`).not.toBeNull();
    }
  });
});

describe('assessFromBrief', () => {
  const briefWith = (met: number, notMet: number, unable: number) => ({
    criteria_match: {
      guideline_source: 'VantaUM Criteria VC-72148-v1 / ACR',
      applicable_guideline: 'VantaUM Criteria VC-72148-v1 (MRI Lumbar Spine)',
      criteria_met: Array.from({ length: met }, (_, i) => `met-${i}`),
      criteria_not_met: Array.from({ length: notMet }, (_, i) => `notmet-${i}`),
      criteria_unable_to_assess: Array.from({ length: unable }, (_, i) => `unable-${i}`),
      conservative_alternatives: [],
    },
  });

  it('returns null without a brief', () => {
    expect(assessFromBrief(['72148'], null)).toBeNull();
  });

  it('verdict met — all criteria satisfied', () => {
    const a = assessFromBrief(['72148'], briefWith(5, 0, 0))!;
    expect(a.verdict).toBe('met');
    expect(a.set_id).toBe(`VC-72148-v${CRITERIA_LIBRARY_VERSION}`);
    expect(a.guideline_label).toContain('VC-72148');
    expect(a.source).toBe('brief_engine');
  });

  it('verdict not_met dominates when any criterion fails', () => {
    expect(assessFromBrief(['72148'], briefWith(4, 1, 2))!.verdict).toBe('not_met');
  });

  it('verdict partial when items are unassessable but none failed', () => {
    expect(assessFromBrief(['72148'], briefWith(3, 0, 2))!.verdict).toBe('partial');
  });

  it('verdict insufficient when the brief assessed nothing', () => {
    expect(assessFromBrief(['72148'], briefWith(0, 0, 0))!.verdict).toBe('insufficient');
  });

  it('falls back to a generic label for ungoverned codes', () => {
    const a = assessFromBrief(['99999'], briefWith(2, 0, 0))!;
    expect(a.set_id).toBeNull();
    expect(a.guideline_label).toBe('VantaUM Criteria Library');
    expect(a.verdict).toBe('met');
  });
});
