import { describe, it, expect } from 'vitest';
import { sanitizeForLogging, checkRateLimit } from '@/lib/security';

describe('sanitizeForLogging', () => {
  it('redacts patient_name keeping first character', () => {
    const result = sanitizeForLogging({ patient_name: 'John Doe' });
    expect(result).toEqual({ patient_name: 'J***' });
  });

  it('redacts patient_dob completely', () => {
    const result = sanitizeForLogging({ patient_dob: '1990-01-01' });
    expect(result).toEqual({ patient_dob: 'REDACTED' });
  });

  it('redacts patient_member_id showing last 4', () => {
    const result = sanitizeForLogging({ patient_member_id: 'MEM123456789' });
    expect(result).toEqual({ patient_member_id: '***6789' });
  });

  it('redacts email keeping domain', () => {
    const result = sanitizeForLogging({ email: 'test@example.com' });
    expect(result).toEqual({ email: '***@example.com' });
  });

  it('handles nested objects', () => {
    const result = sanitizeForLogging({
      case: { patient_name: 'Jane', other_field: 'keep' },
    }) as Record<string, Record<string, unknown>>;
    expect(result.case.patient_name).toBe('J***');
    expect(result.case.other_field).toBe('keep');
  });

  it('handles null and undefined', () => {
    expect(sanitizeForLogging(null)).toBeNull();
    expect(sanitizeForLogging(undefined)).toBeUndefined();
  });

  it('preserves non-PHI fields', () => {
    const result = sanitizeForLogging({ case_number: 'VHG-001', status: 'intake' });
    expect(result).toEqual({ case_number: 'VHG-001', status: 'intake' });
  });
});

describe('checkRateLimit', () => {
  it('allows requests under the limit', () => {
    const key = `test-allow-${Date.now()}`;
    const result = checkRateLimit(key, 10, 60000);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(9);
  });

  it('blocks requests over the limit', () => {
    const key = `test-block-${Date.now()}`;
    for (let i = 0; i < 5; i++) {
      checkRateLimit(key, 5, 60000);
    }
    const result = checkRateLimit(key, 5, 60000);
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it('tracks remaining count correctly', () => {
    const key = `test-remaining-${Date.now()}`;
    const r1 = checkRateLimit(key, 5, 60000);
    expect(r1.remaining).toBe(4);
    const r2 = checkRateLimit(key, 5, 60000);
    expect(r2.remaining).toBe(3);
  });
});
