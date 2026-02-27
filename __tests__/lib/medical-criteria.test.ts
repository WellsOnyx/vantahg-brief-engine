import { describe, it, expect } from 'vitest';
import { getCriteriaForCodes, medicalCriteria, commonMedicalCodes } from '@/lib/medical-criteria';

describe('getCriteriaForCodes', () => {
  it('returns matching criteria for known CPT codes', () => {
    const result = getCriteriaForCodes(['72148', '27447']);
    expect(result['72148']).toBeDefined();
    expect(result['72148'].name).toBe('MRI Lumbar Spine without Contrast');
    expect(result['27447']).toBeDefined();
    expect(result['27447'].name).toBe('Total Knee Arthroplasty (TKA)');
  });

  it('returns empty object for unknown codes', () => {
    const result = getCriteriaForCodes(['99999']);
    expect(Object.keys(result)).toHaveLength(0);
  });

  it('handles case-insensitive HCPCS codes', () => {
    const result = getCriteriaForCodes(['e0601']);
    expect(result['E0601']).toBeDefined();
  });

  it('trims whitespace from codes', () => {
    const result = getCriteriaForCodes(['  72148  ']);
    expect(result['72148']).toBeDefined();
  });

  it('returns criteria with expected fields', () => {
    const criteria = medicalCriteria['72148'];
    expect(criteria).toHaveProperty('name');
    expect(criteria).toHaveProperty('category');
    expect(criteria).toHaveProperty('typical_criteria');
    expect(criteria).toHaveProperty('common_denial_reasons');
    expect(criteria).toHaveProperty('guideline_references');
    expect(Array.isArray(criteria.typical_criteria)).toBe(true);
  });
});

describe('commonMedicalCodes', () => {
  it('contains at least 14 codes', () => {
    expect(commonMedicalCodes.length).toBeGreaterThanOrEqual(14);
  });

  it('each code has code, description, and category', () => {
    for (const item of commonMedicalCodes) {
      expect(item.code).toBeTruthy();
      expect(item.description).toBeTruthy();
      expect(item.category).toBeTruthy();
    }
  });
});
