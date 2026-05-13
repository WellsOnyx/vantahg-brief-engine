import { getMeowConfig, isRealMeowEnabled, type MeowConfig } from '@/lib/env';

/**
 * Meow API client - the slice we use for PEPM invoicing.
 *
 * Meow doesn't ship a JS SDK. Their REST surface is small enough that
 * a hand-rolled fetch wrapper is the cleanest option. We use 4 endpoints:
 *
 *   POST   /billing/customers           - create invoicing customer
 *   POST   /billing/products            - create product (once, at bootstrap)
 *   POST   /billing/invoices            - create + send invoice
 *   GET    /billing/invoices/{id}       - poll status for paid/void detection
 *
 * Auth: x-api-key header. Multi-entity accounts also send x-entity-id.
 *
 * Demo mode: when isRealMeowEnabled() is false, every method returns a
 * deterministic stub so the rest of the billing flow runs in local dev
 * + tests without hitting the API.
 *
 * Error handling: Meow returns JSON with `code`, `message`, `debug_message`.
 * We surface a discriminated union { ok: true | false } at every call site.
 */

// ── Types matching Meow's OpenAPI spec (the slice we use) ─────────────────

export interface MeowAddress {
  line_1: string;
  line_2?: string;
  city: string;
  state: string;       // 2-char US state code
  postal_code: string;
  country: string;     // ISO 3166-1 alpha-2, e.g. "US"
}

export interface CreateCustomerParams {
  nickname: string;    // display name; will appear on invoices
  email: string;
  address?: MeowAddress;
}

export interface CreateProductParams {
  name: string;
  description?: string;
  /** Default price in dollars, e.g. 2.40. Stored as decimal string by Meow. */
  default_price: number;
}

export type PaymentMethodType =
  | 'BANK_TRANSFER'
  | 'CARD'
  | 'ACH_DIRECT_DEBIT'
  | 'INTERNATIONAL_WIRE';

export interface CreateInvoiceParams {
  customer_id: string;
  collection_account_id: string;
  /** YYYY-MM-DD. Date the invoice is sent. */
  invoice_date: string;
  /** YYYY-MM-DD. */
  due_date: string;
  /** Payment methods to allow. BANK_TRANSFER is always enabled by Meow. */
  payment_method_types: PaymentMethodType[];
  /** When true, Meow sends the invoice email on invoice_date. */
  send_email_on_creation: boolean;
  /** Up to 32 chars, displayed as invoice name. */
  name?: string;
  /** Up to 300 chars, free-text note on the invoice. */
  note?: string;
  line_items: Array<{
    product_id: string;
    /** Number of units. e.g. member_count for PEPM. */
    quantity: number;
    /** Override the product default. Optional. */
    price?: number;
    description?: string;
  }>;
  additional_recipient_emails?: string[];
  show_contact_address?: boolean;
}

export interface MeowCustomer {
  id: string;
  nickname: string;
  email: string;
}

export interface MeowProduct {
  id: string;
  name: string;
  description: string | null;
  default_price: string;  // decimal string per Meow's response shape
}

export type MeowInvoiceStatus = 'DRAFT' | 'OPEN' | 'PAID' | 'UNCOLLECTIBLE' | 'VOID';

export interface MeowInvoice {
  id: string;
  invoice_number?: string | null;
  status: MeowInvoiceStatus;
  customer_id: string;
  invoice_date: string;
  due_date: string;
  total: string;           // decimal string
  hosted_invoice_url?: string | null;
  paid_at?: string | null;
}

// ── Result types ──────────────────────────────────────────────────────────

export type Ok<T> = { ok: true; data: T; demo: boolean };
export type Err = {
  ok: false;
  /** HTTP status, 0 for network failure. */
  status: number;
  /** Stable code from Meow when available, otherwise generic. */
  code: string;
  message: string;
  demo: boolean;
};

// ── HTTP plumbing ─────────────────────────────────────────────────────────

async function meowFetch<T>(
  config: MeowConfig,
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  path: string,
  body?: unknown,
): Promise<Ok<T> | Err> {
  const headers: Record<string, string> = {
    'x-api-key': config.apiKey,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
  if (config.entityId) headers['x-entity-id'] = config.entityId;

  let response: Response;
  try {
    response = await fetch(`${config.baseUrl}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (err) {
    return {
      ok: false,
      status: 0,
      code: 'network',
      message: err instanceof Error ? err.message : 'Network error',
      demo: false,
    };
  }

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    // Some 204s have no body. That's fine.
  }

  if (!response.ok) {
    const err = (payload ?? {}) as { code?: unknown; message?: unknown; debug_message?: unknown };
    return {
      ok: false,
      status: response.status,
      code: typeof err.code === 'string' ? err.code : String(response.status),
      message: typeof err.message === 'string' ? err.message : `Meow API ${response.status}`,
      demo: false,
    };
  }

  return { ok: true, data: (payload ?? {}) as T, demo: false };
}

// ── Public methods ────────────────────────────────────────────────────────

/**
 * Creates an invoicing customer for a TPA. Should be called once per
 * client, then `customers.meow_customer_id` is reused for every
 * subsequent invoice.
 *
 * Demo mode returns a deterministic stub keyed by nickname so tests are
 * stable across runs.
 */
export async function createCustomer(
  params: CreateCustomerParams,
): Promise<Ok<MeowCustomer> | Err> {
  if (!isRealMeowEnabled()) {
    return {
      ok: true,
      demo: true,
      data: {
        id: `demo-customer-${slugify(params.nickname)}`,
        nickname: params.nickname,
        email: params.email,
      },
    };
  }
  const config = getMeowConfig();
  return meowFetch<MeowCustomer>(config, 'POST', '/billing/customers', params);
}

/**
 * Creates a Meow Product representing "VantaUM PEPM". Run once at
 * bootstrap (see scripts/bootstrap-meow-product.ts) — the returned ID
 * goes into MEOW_VANTAUM_PRODUCT_ID env var and every invoice line
 * item references it.
 */
export async function createProduct(
  params: CreateProductParams,
): Promise<Ok<MeowProduct> | Err> {
  if (!isRealMeowEnabled()) {
    return {
      ok: true,
      demo: true,
      data: {
        id: `demo-product-${slugify(params.name)}`,
        name: params.name,
        description: params.description ?? null,
        default_price: params.default_price.toFixed(2),
      },
    };
  }
  const config = getMeowConfig();
  return meowFetch<MeowProduct>(config, 'POST', '/billing/products', params);
}

/**
 * Creates and (if send_email_on_creation=true) sends an invoice.
 * Meow renders + emails the PDF; we just store the returned IDs.
 */
export async function createInvoice(
  params: CreateInvoiceParams,
): Promise<Ok<MeowInvoice> | Err> {
  if (!isRealMeowEnabled()) {
    return {
      ok: true,
      demo: true,
      data: {
        id: `demo-invoice-${Date.now()}`,
        invoice_number: `DEMO-INV-${Date.now()}`,
        status: 'OPEN',
        customer_id: params.customer_id,
        invoice_date: params.invoice_date,
        due_date: params.due_date,
        total: params.line_items
          .reduce((sum, l) => sum + l.quantity * (l.price ?? 0), 0)
          .toFixed(2),
        hosted_invoice_url: 'https://meow.example/demo-invoice',
      },
    };
  }
  const config = getMeowConfig();
  return meowFetch<MeowInvoice>(config, 'POST', '/billing/invoices', params);
}

/**
 * Fetch an invoice by Meow ID. Used by the polling sync worker to
 * detect status transitions (OPEN → PAID, etc.).
 */
export async function getInvoice(invoiceId: string): Promise<Ok<MeowInvoice> | Err> {
  if (!isRealMeowEnabled()) {
    return {
      ok: true,
      demo: true,
      data: {
        id: invoiceId,
        invoice_number: null,
        status: 'OPEN',
        customer_id: 'demo-customer-x',
        invoice_date: new Date().toISOString().slice(0, 10),
        due_date: new Date().toISOString().slice(0, 10),
        total: '0.00',
        hosted_invoice_url: null,
      },
    };
  }
  const config = getMeowConfig();
  return meowFetch<MeowInvoice>(config, 'GET', `/billing/invoices/${invoiceId}`);
}

// ── helpers ───────────────────────────────────────────────────────────────

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

/**
 * Translate Meow's invoice status into our local invoices.status enum.
 * Used by the cron sync to flip our row when Meow's view changes.
 */
export function meowStatusToLocal(s: MeowInvoiceStatus): 'draft' | 'sent' | 'paid' | 'void' {
  switch (s) {
    case 'DRAFT':
      return 'draft';
    case 'OPEN':
      return 'sent';
    case 'PAID':
      return 'paid';
    case 'UNCOLLECTIBLE':
    case 'VOID':
      return 'void';
  }
}
