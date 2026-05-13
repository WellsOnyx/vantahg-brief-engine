import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Monthly PEPM invoice generation.
 *
 * Called once per billing cycle (typically the 1st of each month) per
 * active client. Produces a draft invoice that an admin can review and
 * send.
 *
 * Pricing model: pepm_rate_cents x member_count = total_cents.
 * Both values are snapshot at generation - retroactive adjustments to
 * the signup record don't change a previously-generated invoice.
 *
 * Invoice numbering: VUM-INV-YYYY-NNNNN where NNNNN is a per-year sequence.
 */

export interface GenerateInvoiceParams {
  clientId: string;
  /** First day of the period being billed (inclusive). */
  periodStart: Date;
  /** Last day of the period being billed (inclusive). */
  periodEnd: Date;
  /** Override the snapshot member count. If not provided, pulled from signup_requests.estimated_members. */
  memberCountOverride?: number;
  /** Override the PEPM rate. If not provided, pulled from signup_requests.pepm_rate_cents. */
  pepmRateOverride?: number;
  /** Email of the admin who triggered generation. */
  generatedBy: string;
}

export interface GenerateInvoiceResult {
  ok: true;
  invoiceId: string;
  invoiceNumber: string;
  totalCents: number;
}

export interface GenerateInvoiceError {
  ok: false;
  code: 'client_not_found' | 'no_signup' | 'no_pricing' | 'already_exists' | 'unknown';
  message: string;
}

function toDateOnly(d: Date): string {
  return d.toISOString().slice(0, 10);
}

async function nextInvoiceNumber(supabase: SupabaseClient, year: number): Promise<string> {
  // Quick-and-correct: count existing invoices in this year + 1.
  // Not great for very high concurrency but our volume is small.
  const yearStart = `${year}-01-01`;
  const yearEnd = `${year + 1}-01-01`;
  const { count } = await supabase
    .from('invoices')
    .select('id', { count: 'exact', head: true })
    .gte('created_at', yearStart)
    .lt('created_at', yearEnd);
  const seq = ((count ?? 0) + 1).toString().padStart(5, '0');
  return `VUM-INV-${year}-${seq}`;
}

export async function generateInvoice(
  supabase: SupabaseClient,
  params: GenerateInvoiceParams,
): Promise<GenerateInvoiceResult | GenerateInvoiceError> {
  // Pull client + its signup snapshot for pricing.
  const { data: client, error: clientErr } = await supabase
    .from('clients')
    .select('id, name')
    .eq('id', params.clientId)
    .maybeSingle();

  if (clientErr || !client) {
    return { ok: false, code: 'client_not_found', message: 'Client not found' };
  }

  let pepm = params.pepmRateOverride;
  let members = params.memberCountOverride;

  if (pepm === undefined || members === undefined) {
    const { data: signup } = await supabase
      .from('signup_requests')
      .select('pepm_rate_cents, estimated_members')
      .eq('client_id', params.clientId)
      .maybeSingle();
    if (!signup) {
      return {
        ok: false,
        code: 'no_signup',
        message: 'Client has no linked signup. Pass overrides or attach a signup_request first.',
      };
    }
    if (pepm === undefined) pepm = signup.pepm_rate_cents ?? undefined;
    if (members === undefined) members = signup.estimated_members ?? undefined;
  }

  if (pepm === undefined || pepm <= 0 || members === undefined || members <= 0) {
    return {
      ok: false,
      code: 'no_pricing',
      message: 'PEPM rate and member count are both required (and must be > 0).',
    };
  }

  // Check for duplicate (UNIQUE INDEX would catch this too but cleaner error).
  const periodStartStr = toDateOnly(params.periodStart);
  const { data: existing } = await supabase
    .from('invoices')
    .select('id, invoice_number')
    .eq('client_id', params.clientId)
    .eq('period_start', periodStartStr)
    .maybeSingle();
  if (existing) {
    return {
      ok: false,
      code: 'already_exists',
      message: `An invoice already exists for this period (${existing.invoice_number}).`,
    };
  }

  const totalCents = pepm * members;
  const periodYear = params.periodStart.getFullYear();
  const invoiceNumber = await nextInvoiceNumber(supabase, periodYear);

  const { data: created, error: insertErr } = await supabase
    .from('invoices')
    .insert({
      client_id: params.clientId,
      period_start: periodStartStr,
      period_end: toDateOnly(params.periodEnd),
      pepm_rate_cents: pepm,
      member_count: members,
      total_cents: totalCents,
      status: 'draft',
      invoice_number: invoiceNumber,
      generated_by: params.generatedBy,
    })
    .select('id, invoice_number')
    .single();

  if (insertErr || !created) {
    return { ok: false, code: 'unknown', message: insertErr?.message ?? 'Insert failed' };
  }

  return {
    ok: true,
    invoiceId: created.id,
    invoiceNumber: created.invoice_number,
    totalCents,
  };
}

/**
 * Returns the first and last day of the month containing `date`.
 * Used by the cron generator to compute the previous month's period.
 */
export function monthRange(date: Date): { start: Date; end: Date } {
  const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
  const end = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0));
  return { start, end };
}

export function previousMonthRange(now: Date = new Date()): { start: Date; end: Date } {
  const prev = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 15));
  return monthRange(prev);
}

/**
 * Format cents as "$X,XXX.XX". Used by the admin UI + the PDF renderer.
 */
export function formatCents(cents: number): string {
  const dollars = cents / 100;
  return dollars.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
