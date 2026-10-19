import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { IRO_FEE_SCHEDULE_V1 } from '@/lib/iro/config/fee-schedule';
import { OHIO_SETTINGS_V1, STATE_SETTINGS_REGISTRY } from '@/lib/iro/config/state-settings';
import { quoteFee, quoteIsConfirmable, resolveFeeSchedule } from '@/lib/iro/fees';
import type { FeeSchedule } from '@/lib/iro/types';

const base = {
  schedule: IRO_FEE_SCHEDULE_V1,
  settings: OHIO_SETTINGS_V1,
  category: 'medical_necessity' as const,
  expedited: false,
  specialist_count: 0,
  early_closure: false,
  payer: 'client' as const,
};

describe('IRO fee schedule', () => {
  it('displays the standard total plus the specialist add-on before confirmation', () => {
    const quote = quoteFee({ ...base, specialist_count: 1 });
    expect(quote.preliminary).toBe(true);
    expect(quote.display_total_cents).toBe(170_000);
    expect(quote.display_total).toBe('$1,700.00');
    expect(quote.billable_total_cents).toBe(170_000);
    expect(quoteIsConfirmable(quote)).toBe(true);
    expect(quote.lines.map((line) => line.amount_cents)).toEqual([100_000, 70_000]);
  });

  it('prices expedited, E&I, and expedited E&I from the schedule', () => {
    expect(quoteFee({ ...base, expedited: true }).display_total_cents).toBe(130_000);
    expect(
      quoteFee({ ...base, category: 'experimental_investigational' }).display_total_cents,
    ).toBe(125_000);
    expect(
      quoteFee({ ...base, category: 'experimental_investigational', expedited: true }).display_total_cents,
    ).toBe(175_000);
  });

  it('flags early closure and a non-permitted specialist instead of billing them', () => {
    const early = quoteFee({ ...base, early_closure: true });
    expect(early.display_total_cents).toBe(115_000);
    expect(early.billable).toBe(false);
    expect(early.flags).toContain('early_closure:may_not_be_permitted');
    expect(quoteIsConfirmable(early)).toBe(false);

    const held = quoteFee({
      ...base,
      specialist_count: 1,
      settings: { ...OHIO_SETTINGS_V1, additional_specialist_permitted: false },
    });
    expect(held.display_total_cents).toBe(170_000);
    expect(held.display_total).toBe('$1,700.00');
    expect(held.billable).toBe(false);
    expect(held.flags).toContain('additional_specialist:may_not_be_permitted');
  });

  it('blocks patient billing where the state row prohibits it', () => {
    for (const state of ['IL', 'NC'] as const) {
      const settings = STATE_SETTINGS_REGISTRY.versions.find((row) => row.state === state)!;
      const quote = quoteFee({ ...base, settings, payer: 'patient' });
      expect(quote.patient_billing_blocked).toBe(true);
      expect(quote.billable).toBe(false);
      expect(quote.billable_total_cents).toBe(0);
      expect(quoteIsConfirmable(quote)).toBe(false);
    }
  });

  it('reads amounts from the schedule argument and honors a state cap', () => {
    const alternate: FeeSchedule = {
      ...IRO_FEE_SCHEDULE_V1,
      id: 'alt',
      charges: {
        ...IRO_FEE_SCHEDULE_V1.charges,
        standard: { code: 'ALT_STD', amount_cents: 5 },
        additional_specialist: { code: 'ALT_SPEC', amount_cents: 7 },
      },
    };
    const quote = quoteFee({ ...base, schedule: alternate, specialist_count: 1 });
    expect(quote.display_total_cents).toBe(12);
    expect(quote.schedule_id).toBe('alt');

    const capped = quoteFee({
      ...base,
      settings: { ...OHIO_SETTINGS_V1, fee_cap_cents: 50_000 },
    });
    expect(capped.exceeds_cap).toBe(true);
    expect(capped.billable_total_cents).toBe(0);
    expect(capped.display_total_cents).toBe(100_000);

    const overridden = quoteFee({
      ...base,
      settings: { ...OHIO_SETTINGS_V1, fee_overrides: { standard: 4_200 } },
    });
    expect(overridden.lines[0].amount_cents).toBe(4_200);
  });

  it('pins an open case to the schedule it started under', () => {
    const next: FeeSchedule = {
      ...IRO_FEE_SCHEDULE_V1,
      id: 'iro-fee-later',
      effective_from: '2026-12-01T00:00:00.000Z',
      charges: {
        ...IRO_FEE_SCHEDULE_V1.charges,
        standard: { code: 'IRO_STD_NEXT', amount_cents: 1 },
      },
    };
    const schedules = [IRO_FEE_SCHEDULE_V1, next];
    expect(resolveFeeSchedule(schedules, '2026-10-19T00:00:00.000Z')?.id).toBe(IRO_FEE_SCHEDULE_V1.id);
    expect(resolveFeeSchedule(schedules, '2026-12-02T00:00:00.000Z')?.id).toBe('iro-fee-later');
    expect(resolveFeeSchedule(schedules, '2026-12-02T00:00:00.000Z', IRO_FEE_SCHEDULE_V1.id)?.id).toBe(
      IRO_FEE_SCHEDULE_V1.id,
    );
  });

  it('does not embed the preliminary amounts in the calculator', () => {
    const source = readFileSync('lib/iro/fees.ts', 'utf8');
    expect(source).not.toMatch(/100_000|130_000|125_000|175_000|15_000|70_000/);
  });
});
