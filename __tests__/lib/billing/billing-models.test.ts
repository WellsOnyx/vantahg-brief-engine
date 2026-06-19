import { describe, it, expect } from 'vitest';
import {
  computeInvoiceLine,
  computeLaborCogs,
  computeMargin,
  BillingConfigError,
  type ClientRates,
} from '@/lib/billing/billing-models';

/**
 * Block 4 billing-as-a-product math. Pins the three models, the per-auth
 * rule (denied bills same as approved; appeals billed separately), and the
 * COGS-by-per-staff-labor rollup. All money is integer cents.
 */

const baseRates: ClientRates = {
  billing_model: 'pepm',
  pepm_rate_cents: null,
  pmpm_rate_cents: null,
  per_auth_rate_cents: null,
  per_appeal_rate_cents: null,
};

describe('computeInvoiceLine — PEPM', () => {
  it('charges rate × employees', () => {
    const line = computeInvoiceLine(
      { ...baseRates, billing_model: 'pepm', pepm_rate_cents: 240 },
      { employee_count: 10_000 },
    );
    expect(line.total_cents).toBe(2_400_000);
    expect(line.billable_quantity).toBe(10_000);
    expect(line.unit_rate_cents).toBe(240);
    expect(line.description).toContain('PEPM');
  });
});

describe('computeInvoiceLine — PMPM', () => {
  it('charges rate × members', () => {
    const line = computeInvoiceLine(
      { ...baseRates, billing_model: 'pmpm', pmpm_rate_cents: 95 },
      { member_count: 50_000 },
    );
    expect(line.total_cents).toBe(4_750_000);
    expect(line.description).toContain('PMPM');
    expect(line.description).toContain('members');
  });
});

describe('computeInvoiceLine — per-auth', () => {
  it('charges per billable auth — denied bills the same as approved', () => {
    // billable_auth_count is every auth that reached a determination,
    // regardless of approve/deny outcome (Jonah's rule).
    const line = computeInvoiceLine(
      { ...baseRates, billing_model: 'per_auth', per_auth_rate_cents: 4_500 },
      { billable_auth_count: 1_400 },
    );
    expect(line.total_cents).toBe(6_300_000);
    expect(line.appeal_cents).toBe(0);
  });

  it('bills appeals separately at the appeal rate', () => {
    const line = computeInvoiceLine(
      { ...baseRates, billing_model: 'per_auth', per_auth_rate_cents: 4_500, per_appeal_rate_cents: 9_000 },
      { billable_auth_count: 1_000, appeal_count: 50 },
    );
    expect(line.base_cents).toBe(4_500_000);
    expect(line.appeal_count).toBe(50);
    expect(line.appeal_cents).toBe(450_000);
    expect(line.total_cents).toBe(4_950_000);
    expect(line.description).toContain('appeals');
  });

  it('does not charge appeals when no appeal rate is configured', () => {
    const line = computeInvoiceLine(
      { ...baseRates, billing_model: 'per_auth', per_auth_rate_cents: 4_500 },
      { billable_auth_count: 1_000, appeal_count: 50 },
    );
    // appeal_count is recorded but appeal_rate is 0 → no charge
    expect(line.appeal_cents).toBe(0);
    expect(line.total_cents).toBe(4_500_000);
  });
});

describe('computeInvoiceLine — config guardrails (loud failure, not silent zero)', () => {
  it('throws when the model rate is missing', () => {
    expect(() =>
      computeInvoiceLine({ ...baseRates, billing_model: 'per_auth' }, { billable_auth_count: 10 }),
    ).toThrow(BillingConfigError);
  });

  it('throws when the period volume for the model is missing', () => {
    expect(() =>
      computeInvoiceLine({ ...baseRates, billing_model: 'pmpm', pmpm_rate_cents: 95 }, {}),
    ).toThrow(BillingConfigError);
  });

  it('throws on a zero/negative rate', () => {
    expect(() =>
      computeInvoiceLine({ ...baseRates, billing_model: 'pepm', pepm_rate_cents: 0 }, { employee_count: 100 }),
    ).toThrow(BillingConfigError);
  });
});

describe('computeLaborCogs — per-staff rates', () => {
  it('values each entry at its own loaded rate (rates vary per hire)', () => {
    const cogs = computeLaborCogs([
      { minutes: 30, loaded_cost_per_hour_cents: 6_000 },   // 0.5h × $60 = $30 = 3000c
      { minutes: 12, loaded_cost_per_hour_cents: 12_000 },  // 0.2h × $120 = $24 = 2400c
    ]);
    expect(cogs.labor_cents).toBe(3_000 + 2_400);
    expect(cogs.total_minutes).toBe(42);
    expect(cogs.unpriced_entries).toBe(0);
  });

  it('counts unpriced entries instead of silently dropping cost', () => {
    const cogs = computeLaborCogs([
      { minutes: 30, loaded_cost_per_hour_cents: 6_000 },
      { minutes: 15, loaded_cost_per_hour_cents: null },
    ]);
    expect(cogs.labor_cents).toBe(3_000);
    expect(cogs.total_minutes).toBe(45);
    expect(cogs.unpriced_entries).toBe(1);
  });

  it('handles an empty entry set', () => {
    expect(computeLaborCogs([])).toEqual({ labor_cents: 0, total_minutes: 0, unpriced_entries: 0 });
  });
});

describe('computeMargin', () => {
  it('computes margin cents + pct', () => {
    const m = computeMargin(100_000, 35_000);
    expect(m.margin_cents).toBe(65_000);
    expect(m.margin_pct).toBe(65);
  });

  it('reports a negative margin honestly', () => {
    const m = computeMargin(40_000, 52_000);
    expect(m.margin_cents).toBe(-12_000);
    expect(m.margin_pct).toBe(-30);
  });

  it('null pct when there is no revenue', () => {
    expect(computeMargin(0, 5_000).margin_pct).toBeNull();
  });
});
