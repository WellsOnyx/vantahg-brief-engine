/**
 * Billing as a product — PEPM | PMPM | per-auth, per client.
 *
 * Decisions (Jonah, 2026-06-16):
 *   - Each client is billed on ONE model at its own rate (migration 028:
 *     clients.billing_model + the matching *_rate_cents column).
 *   - Per-auth: a DENIED auth bills the same as an APPROVED auth; an APPEAL
 *     is a separate billable event at its own rate.
 *   - COGS is human labor: per-staff loaded cost × minutes worked per auth.
 *
 * This module is the PURE math — no DB, no clock. It computes an invoice
 * line from a model + inputs, and a COGS rollup from labor entries. The
 * generator (lib/billing/invoice-generator.ts) supplies the data and
 * persists; this decides the numbers so they're testable in isolation.
 *
 * All money is integer cents.
 */

export type BillingModel = 'pepm' | 'pmpm' | 'per_auth';

export interface ClientRates {
  billing_model: BillingModel;
  pepm_rate_cents: number | null;
  pmpm_rate_cents: number | null;
  per_auth_rate_cents: number | null;
  /** Appeals bill separately under per_auth. */
  per_appeal_rate_cents: number | null;
}

export interface PeriodVolume {
  /** Employees on the plan (pepm). */
  employee_count?: number;
  /** Members on the plan (pmpm). */
  member_count?: number;
  /**
   * Billable authorizations closed in the period (per_auth). Per Jonah,
   * denied auths bill the same as approved — so this is every auth that
   * reached a determination, regardless of outcome.
   */
  billable_auth_count?: number;
  /** Appeals worked in the period (per_auth, billed separately). */
  appeal_count?: number;
}

export interface InvoiceLine {
  billing_model: BillingModel;
  /** Model-agnostic line quantity (employees / members / auths). */
  billable_quantity: number;
  unit_rate_cents: number;
  /** quantity * unit_rate_cents. */
  base_cents: number;
  /** Per-auth only: appeals counted + charged separately. */
  appeal_count: number;
  appeal_rate_cents: number;
  appeal_cents: number;
  /** base_cents + appeal_cents — the authoritative billed amount. */
  total_cents: number;
  /** Human-readable explanation for the invoice + audit. */
  description: string;
}

export class BillingConfigError extends Error {}

/**
 * Compute the invoice line for a client's model + the period's volume.
 * Throws BillingConfigError when the model's rate isn't configured — a
 * loud failure beats silently billing zero.
 */
export function computeInvoiceLine(rates: ClientRates, volume: PeriodVolume): InvoiceLine {
  switch (rates.billing_model) {
    case 'pepm': {
      const rate = requireRate(rates.pepm_rate_cents, 'pepm_rate_cents');
      const qty = requireQty(volume.employee_count, 'employee_count');
      const base = rate * qty;
      return line('pepm', qty, rate, base, 0, 0,
        `PEPM @ ${dollars(rate)} × ${qty.toLocaleString()} employees`);
    }
    case 'pmpm': {
      const rate = requireRate(rates.pmpm_rate_cents, 'pmpm_rate_cents');
      const qty = requireQty(volume.member_count, 'member_count');
      const base = rate * qty;
      return line('pmpm', qty, rate, base, 0, 0,
        `PMPM @ ${dollars(rate)} × ${qty.toLocaleString()} members`);
    }
    case 'per_auth': {
      const rate = requireRate(rates.per_auth_rate_cents, 'per_auth_rate_cents');
      const qty = requireQty(volume.billable_auth_count, 'billable_auth_count');
      const base = rate * qty;
      // Appeals are optional; only charged if both a count and a rate exist.
      const appealCount = volume.appeal_count ?? 0;
      const appealRate = rates.per_appeal_rate_cents ?? 0;
      const desc =
        `${qty.toLocaleString()} auths @ ${dollars(rate)}` +
        (appealCount > 0 ? ` + ${appealCount.toLocaleString()} appeals @ ${dollars(appealRate)}` : '');
      return line('per_auth', qty, rate, base, appealCount, appealRate, desc);
    }
    default: {
      // Exhaustiveness guard.
      const _never: never = rates.billing_model;
      throw new BillingConfigError(`Unknown billing_model: ${_never}`);
    }
  }
}

function line(
  model: BillingModel,
  qty: number,
  unit: number,
  base: number,
  appealCount: number,
  appealRate: number,
  description: string,
): InvoiceLine {
  const appealCents = appealCount * appealRate;
  return {
    billing_model: model,
    billable_quantity: qty,
    unit_rate_cents: unit,
    base_cents: base,
    appeal_count: appealCount,
    appeal_rate_cents: appealRate,
    appeal_cents: appealCents,
    total_cents: base + appealCents,
    description,
  };
}

function requireRate(rate: number | null | undefined, field: string): number {
  if (rate == null || rate <= 0) {
    throw new BillingConfigError(`Missing or invalid ${field} for this client's billing model`);
  }
  return rate;
}

function requireQty(qty: number | undefined, field: string): number {
  if (qty == null || qty < 0) {
    throw new BillingConfigError(`Missing or invalid ${field} for the billing period`);
  }
  return qty;
}

function dollars(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

// ── COGS: human labor ──────────────────────────────────────────────────────

export interface LaborEntry {
  minutes: number;
  /** Per-staff loaded cost snapshot (cents/hour). null entries are skipped. */
  loaded_cost_per_hour_cents: number | null;
}

export interface CogsResult {
  labor_cents: number;
  total_minutes: number;
  /** Entries with no rate — surfaced, not silently dropped. */
  unpriced_entries: number;
}

/**
 * Roll up labor entries into COGS. Each entry's minutes are valued at its
 * own snapshot rate (rates vary per hire). Entries missing a rate are
 * counted as unpriced so the gap is visible rather than understating cost.
 */
export function computeLaborCogs(entries: readonly LaborEntry[]): CogsResult {
  let labor_cents = 0;
  let total_minutes = 0;
  let unpriced_entries = 0;
  for (const e of entries) {
    total_minutes += e.minutes;
    if (e.loaded_cost_per_hour_cents == null || e.loaded_cost_per_hour_cents < 0) {
      unpriced_entries += 1;
      continue;
    }
    labor_cents += Math.round((e.minutes / 60) * e.loaded_cost_per_hour_cents);
  }
  return { labor_cents, total_minutes, unpriced_entries };
}

/** Period margin: revenue minus labor COGS. Can be negative — that's the point. */
export function computeMargin(revenue_cents: number, cogs_labor_cents: number): {
  margin_cents: number;
  margin_pct: number | null;
} {
  const margin_cents = revenue_cents - cogs_labor_cents;
  const margin_pct = revenue_cents > 0 ? Math.round((margin_cents / revenue_cents) * 1000) / 10 : null;
  return { margin_cents, margin_pct };
}
