import { describe, it, expect } from 'vitest';
import { monthRange, previousMonthRange, formatCents } from '@/lib/billing/invoice-generator';

describe('monthRange', () => {
  it('returns Jan 1-31 for a date in January', () => {
    const { start, end } = monthRange(new Date(Date.UTC(2026, 0, 15)));
    expect(start.toISOString().slice(0, 10)).toBe('2026-01-01');
    expect(end.toISOString().slice(0, 10)).toBe('2026-01-31');
  });

  it('returns Feb 1-28 for non-leap-year February', () => {
    const { start, end } = monthRange(new Date(Date.UTC(2026, 1, 10)));
    expect(start.toISOString().slice(0, 10)).toBe('2026-02-01');
    expect(end.toISOString().slice(0, 10)).toBe('2026-02-28');
  });

  it('returns Feb 1-29 for leap-year February', () => {
    const { start, end } = monthRange(new Date(Date.UTC(2028, 1, 10)));
    expect(start.toISOString().slice(0, 10)).toBe('2028-02-01');
    expect(end.toISOString().slice(0, 10)).toBe('2028-02-29');
  });
});

describe('previousMonthRange', () => {
  it('returns previous month relative to mid-month', () => {
    const { start, end } = previousMonthRange(new Date(Date.UTC(2026, 4, 15)));
    expect(start.toISOString().slice(0, 10)).toBe('2026-04-01');
    expect(end.toISOString().slice(0, 10)).toBe('2026-04-30');
  });

  it('wraps year boundary in January', () => {
    const { start, end } = previousMonthRange(new Date(Date.UTC(2026, 0, 5)));
    expect(start.toISOString().slice(0, 10)).toBe('2025-12-01');
    expect(end.toISOString().slice(0, 10)).toBe('2025-12-31');
  });
});

describe('formatCents', () => {
  it('formats whole-dollar amounts', () => {
    expect(formatCents(150_000)).toBe('$1,500.00');
  });

  it('formats fractional dollars', () => {
    expect(formatCents(240)).toBe('$2.40');
  });

  it('formats large amounts with thousands separators', () => {
    expect(formatCents(3_600_000)).toBe('$36,000.00');
  });

  it('formats zero', () => {
    expect(formatCents(0)).toBe('$0.00');
  });
});
