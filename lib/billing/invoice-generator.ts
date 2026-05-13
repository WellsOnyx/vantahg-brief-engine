import type { SupabaseClient } from '@supabase/supabase-js';
import {
  createCustomer,
  createInvoice as meowCreateInvoice,
  meowStatusToLocal,
  type MeowInvoice,
} from './meow-client';
import { getMeowConfig, isRealMeowEnabled } from '@/lib/env';

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
  /**
   * Meow push outcome. The local invoice row always exists when ok=true;
   * Meow integration is best-effort because we don't want a Meow outage
   * to block our admin's ability to record what they billed.
   *
   * - meowed=true with meow_invoice_id: invoice was pushed to Meow successfully
   * - meowed=true with skipped='disabled': we ran in demo or ENABLE_REAL_MEOW=false
   * - meowed=false with meow_error: real-mode Meow call failed; admin can retry
   */
  meow:
    | { meowed: true; skipped: 'disabled'; meow_invoice_id: null }
    | { meowed: true; skipped: null; meow_invoice_id: string; meow_payment_url: string | null }
    | { meowed: false; skipped: null; meow_error: string };
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

  // ── Push to Meow ────────────────────────────────────────────────────────
  // We have a local row; now we send it to Meow so the customer gets a
  // bill they can pay. Failure here is logged + surfaced but does NOT
  // roll back the local row — the admin can retry the Meow push later
  // without losing the invoice number sequence.
  const meow = await pushInvoiceToMeow(supabase, {
    clientId: params.clientId,
    clientName: client.name,
    localInvoiceId: created.id,
    localInvoiceNumber: created.invoice_number,
    pepmDollars: pepm / 100,
    memberCount: members,
    periodStart: params.periodStart,
    periodEnd: params.periodEnd,
  });

  return {
    ok: true,
    invoiceId: created.id,
    invoiceNumber: created.invoice_number,
    totalCents,
    meow,
  };
}

/**
 * Push the local invoice to Meow. Handles customer creation lazily
 * (first invoice for a client creates the customer; subsequent invoices
 * reuse the stored meow_customer_id).
 *
 * Mutates the local invoice row to record meow_invoice_id, meow_status,
 * meow_payment_url. On disabled-mode or failure the local row stays as
 * draft and admin can retry via /api/admin/invoices/[id]/push-to-meow
 * (V2 - not built yet; for now they'd regenerate).
 *
 * Exported so the upcoming retry endpoint can call it standalone.
 */
export async function pushInvoiceToMeow(
  supabase: SupabaseClient,
  args: {
    clientId: string;
    clientName: string;
    localInvoiceId: string;
    localInvoiceNumber: string;
    pepmDollars: number;
    memberCount: number;
    periodStart: Date;
    periodEnd: Date;
  },
): Promise<GenerateInvoiceResult['meow']> {
  if (!isRealMeowEnabled()) {
    return { meowed: true, skipped: 'disabled', meow_invoice_id: null };
  }

  const config = getMeowConfig();
  if (!config.vantaumProductId) {
    return {
      meowed: false,
      skipped: null,
      meow_error: 'MEOW_VANTAUM_PRODUCT_ID is not set. Run scripts/bootstrap-meow-product.ts once to create the Meow Product and store its UUID.',
    };
  }

  // 1. Ensure a Meow customer exists for this client.
  const { data: clientRow } = await supabase
    .from('clients')
    .select('id, name, contact_email, meow_customer_id')
    .eq('id', args.clientId)
    .single();

  let meowCustomerId = (clientRow as { meow_customer_id?: string } | null)?.meow_customer_id ?? null;
  if (!meowCustomerId) {
    const contactEmail = (clientRow as { contact_email?: string } | null)?.contact_email;
    if (!contactEmail) {
      return {
        meowed: false,
        skipped: null,
        meow_error: 'Client has no contact_email; Meow customer requires an email.',
      };
    }
    const created = await createCustomer({
      nickname: args.clientName,
      email: contactEmail,
    });
    if (!created.ok) {
      return {
        meowed: false,
        skipped: null,
        meow_error: `Meow customer create failed: ${created.code} ${created.message}`,
      };
    }
    meowCustomerId = created.data.id;
    await supabase
      .from('clients')
      .update({ meow_customer_id: meowCustomerId })
      .eq('id', args.clientId);
  }

  // 2. Create the invoice line item against the existing VantaUM product.
  //    Meow expects price in dollars (decimal), quantity = member count.
  //    Default due date: 30 days from period end.
  const invoiceDate = toDateOnly(new Date());
  const dueDate = toDateOnly(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000));

  const invoice = await meowCreateInvoice({
    customer_id: meowCustomerId,
    collection_account_id: config.collectionAccountId,
    invoice_date: invoiceDate,
    due_date: dueDate,
    // BANK_TRANSFER only. ACH_DIRECT_DEBIT is not enabled on the
    // Vanta HG LLC Meow account - verified via GET /v1/billing/payment-method-types
    // on 2026-05-13, which returned allowed_types: ["BANK_TRANSFER",
    // "INTERNATIONAL_WIRE"]. Sending ACH_DIRECT_DEBIT would 4xx the
    // invoice create call. When Meow enables ACH for this entity,
    // add it back here.
    payment_method_types: ['BANK_TRANSFER'],
    send_email_on_creation: true,
    name: args.localInvoiceNumber.slice(0, 32),
    note: `VantaUM PEPM ${toDateOnly(args.periodStart)} – ${toDateOnly(args.periodEnd)}`,
    line_items: [
      {
        product_id: config.vantaumProductId,
        quantity: args.memberCount,
        price: args.pepmDollars,
        description: `PEPM @ $${args.pepmDollars.toFixed(2)} × ${args.memberCount.toLocaleString()} members`,
      },
    ],
  });

  if (!invoice.ok) {
    return {
      meowed: false,
      skipped: null,
      meow_error: `Meow invoice create failed: ${invoice.code} ${invoice.message}`,
    };
  }

  // 3. Persist Meow IDs onto the local invoice row.
  const meowInv: MeowInvoice = invoice.data;
  await supabase
    .from('invoices')
    .update({
      status: meowStatusToLocal(meowInv.status),
      meow_invoice_id: meowInv.id,
      meow_status: meowInv.status,
      meow_invoice_number: meowInv.invoice_number ?? null,
      meow_payment_url: meowInv.hosted_invoice_url ?? null,
      meow_last_synced_at: new Date().toISOString(),
      sent_at: meowInv.status === 'OPEN' ? new Date().toISOString() : null,
    })
    .eq('id', args.localInvoiceId);

  return {
    meowed: true,
    skipped: null,
    meow_invoice_id: meowInv.id,
    meow_payment_url: meowInv.hosted_invoice_url ?? null,
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
