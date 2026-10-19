import type {
  FeeChargeKey,
  FeeLine,
  FeeQuote,
  FeeSchedule,
  ReviewCategory,
  StateSettingsVersion,
} from './types';

export function formatUsdFromCents(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  const dollars = Math.floor(abs / 100);
  const rem = String(abs % 100).padStart(2, '0');
  return `${sign}$${dollars.toLocaleString('en-US')}.${rem}`;
}

export function resolveFeeSchedule(
  schedules: readonly FeeSchedule[],
  asOfIso: string,
  pinnedId?: string | null,
): FeeSchedule | null {
  if (pinnedId) return schedules.find((row) => row.id === pinnedId) ?? null;
  const matches = schedules.filter(
    (row) => row.effective_from <= asOfIso && (row.effective_to === null || row.effective_to > asOfIso),
  );
  matches.sort((a, b) => (a.effective_from < b.effective_from ? 1 : -1));
  return matches[0] ?? null;
}

export interface FeeQuoteInput {
  schedule: FeeSchedule;
  settings: Pick<
    StateSettingsVersion,
    | 'state'
    | 'confirmed'
    | 'patient_billing'
    | 'early_closure_permitted'
    | 'additional_specialist_permitted'
    | 'fee_cap_cents'
    | 'fee_overrides'
  >;
  category: ReviewCategory;
  expedited: boolean;
  specialist_count: number;
  early_closure: boolean;
  payer: 'client' | 'carrier' | 'patient';
}

function chargeKey(input: FeeQuoteInput): 'standard' | 'expedited' | 'standard_ei' | 'expedited_ei' {
  const ei = input.category === 'experimental_investigational';
  if (input.expedited) return ei ? 'expedited_ei' : 'expedited';
  return ei ? 'standard_ei' : 'standard';
}

function amountFor(
  schedule: FeeSchedule,
  key: FeeChargeKey,
  overrides: FeeQuoteInput['settings']['fee_overrides'],
): { code: string; amount_cents: number } {
  const defined = schedule.charges[key];
  const override = overrides[key];
  return {
    code: defined.code,
    amount_cents: typeof override === 'number' ? override : defined.amount_cents,
  };
}

/**
 * Prices a case from the supplied schedule and state row.
 * Display total includes every requested line so the user sees it before confirmation.
 * A line the state does not permit is flagged and omitted from the billable total.
 * Patient billing is blocked where the state row prohibits it. Nothing is posted here.
 */
export function quoteFee(input: FeeQuoteInput): FeeQuote {
  const key = chargeKey(input);
  const base = amountFor(input.schedule, key, input.settings.fee_overrides);
  const lines: FeeLine[] = [
    {
      code: base.code,
      description: key,
      amount_cents: base.amount_cents,
      permitted: true,
      flag: null,
    },
  ];

  if (input.specialist_count > 0) {
    const add = amountFor(input.schedule, 'additional_specialist', input.settings.fee_overrides);
    const permitted = input.settings.additional_specialist_permitted;
    lines.push({
      code: add.code,
      description: 'additional_specialist',
      amount_cents: add.amount_cents * input.specialist_count,
      permitted,
      flag: permitted ? null : 'may_not_be_permitted',
    });
  }

  if (input.early_closure) {
    const early = amountFor(input.schedule, 'early_closure', input.settings.fee_overrides);
    const permitted = input.settings.early_closure_permitted;
    lines.push({
      code: early.code,
      description: 'early_closure',
      amount_cents: early.amount_cents,
      permitted,
      flag: permitted ? null : 'may_not_be_permitted',
    });
  }

  const display = lines.reduce((sum, line) => sum + line.amount_cents, 0);
  const billableSubtotal = lines.filter((line) => line.permitted).reduce((sum, line) => sum + line.amount_cents, 0);
  const exceedsCap =
    input.settings.fee_cap_cents !== null && billableSubtotal > input.settings.fee_cap_cents;
  const patientBlocked = input.payer === 'patient' && input.settings.patient_billing === 'prohibited';
  const flagged = lines.some((line) => line.flag !== null);
  const flags = [
    ...lines.filter((line) => line.flag).map((line) => `${line.description}:${line.flag}`),
    ...(exceedsCap ? ['exceeds_state_cap'] : []),
    ...(patientBlocked ? ['patient_billing_prohibited'] : []),
  ];

  return {
    preliminary: true,
    schedule_id: input.schedule.id,
    state: input.settings.state,
    state_rule_confirmed: input.settings.confirmed,
    lines,
    display_total_cents: display,
    display_total: formatUsdFromCents(display),
    billable_total_cents: exceedsCap || patientBlocked ? 0 : billableSubtotal,
    patient_billing_blocked: patientBlocked,
    exceeds_cap: exceedsCap,
    flags,
    billable: !flagged && !exceedsCap && !patientBlocked,
  };
}

export function quoteIsConfirmable(quote: FeeQuote): boolean {
  return quote.billable && !quote.patient_billing_blocked && quote.lines.every((line) => line.permitted);
}
