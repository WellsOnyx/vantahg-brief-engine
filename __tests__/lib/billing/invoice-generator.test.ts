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

describe('pushInvoiceToMeow payment method types', () => {
  // Guards against the production-blocking bug we discovered:
  // ACH_DIRECT_DEBIT is NOT enabled on the Vanta HG LLC Meow account.
  // Verified via GET /v1/billing/payment-method-types on 2026-05-13.
  // If anyone re-adds ACH here, the first real invoice will 4xx from
  // Meow's invoice create endpoint. This test reads the source to
  // assert the array contains only BANK_TRANSFER. It's a static check
  // (no module mock dance) so it stays fast and unambiguous.
  it('only sends BANK_TRANSFER (ACH_DIRECT_DEBIT must NOT be in the array)', async () => {
    const fs = await import('node:fs/promises');
    const path = await import('node:path');
    const src = await fs.readFile(
      path.join(process.cwd(), 'lib/billing/invoice-generator.ts'),
      'utf8',
    );
    // Find the line that sets payment_method_types and assert its contents.
    const match = src.match(/payment_method_types:\s*(\[[^\]]+\])/);
    expect(match).not.toBeNull();
    const arr = match![1];
    expect(arr).toContain('BANK_TRANSFER');
    expect(arr).not.toContain('ACH_DIRECT_DEBIT');
    expect(arr).not.toContain('INTERNATIONAL_WIRE');
    expect(arr).not.toContain('CARD');
  });
});
