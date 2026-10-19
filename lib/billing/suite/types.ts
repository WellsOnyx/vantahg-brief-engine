import type { LineOfBusiness } from '@/lib/lines';

/**
 * Books are the financial firewall.
 * IRO operating money, IDR fees, IDR escrow, and Medical Review contract
 * billing never settle each other. Escrow is a liability, not revenue.
 */
export const FINANCE_BOOKS = ['iro_operating', 'idr_fees', 'idr_escrow', 'med_review'] as const;
export type FinanceBook = (typeof FINANCE_BOOKS)[number];

export type FinanceRole = 'line_billing' | 'cfo';

export interface FinanceActor {
  id: string;
  finance_role: FinanceRole;
  /** Compared to the configurable approver list. Null if this person cannot approve. */
  approval_role: string | null;
  companies: readonly string[];
  lines: readonly LineOfBusiness[];
  case_restricted: boolean;
  assigned_case_ids: readonly string[];
  line_wide: boolean;
}

export interface FinancePolicy {
  id: string;
  cfo_roles: readonly FinanceRole[];
  payout_approver_roles: readonly string[];
}

/**
 * Payout shape only. The shipped schedule is unconfigured: every amount is null.
 * A caller may supply amounts later. Test fixtures are marked `test_only`.
 */
export interface PayoutSchedule {
  id: string;
  preliminary: true;
  configured: boolean;
  test_only: boolean;
  effective_from: string | null;
  effective_to: string | null;
  reviewer_flat_cents: number | null;
  md_flat_cents: number | null;
  peer_to_peer_hourly_cents: number | null;
  spending_limit_cents: number | null;
  change_note: string;
}

/** IDRE fees and administrative fees are separate citations. Neither is invented here. */
export type IdrFeeType = 'idre' | 'administrative';

/**
 * IDR fee shape. Amounts stay null until `source_ref` cites a source.
 * Uncited, unconfigured, or expired config is a STOP. Not a CMS schedule.
 */
export interface IdrFeeSchedule {
  id: string;
  preliminary: true;
  configured: boolean;
  test_only: boolean;
  fee_type: IdrFeeType;
  effective_from: string | null;
  effective_to: string | null;
  amount_cents: number | null;
  source_ref: string | null;
  change_note: string;
}

/**
 * Medical Review contract shape for this ledger.
 * This is not `lib/billing/um-price-card.ts`. The shipped contract is unconfigured.
 * Posting still requires the existing Med Review entitlement.
 */
export interface MedReviewContractTerms {
  id: string;
  preliminary: true;
  configured: boolean;
  test_only: boolean;
  effective_from: string | null;
  effective_to: string | null;
  platform_cents: number | null;
  per_review_cents: number | null;
  change_note: string;
}

export type InvoiceDirection = 'AR' | 'AP';
export type InvoiceStatus = 'pending_approval' | 'open' | 'paid' | 'void';

/** Issued lines sum to the invoice amount. Draft lines are held and are not in that sum. */
export interface FinanceInvoiceLine {
  line_no: number;
  charge_key: string;
  description: string;
  amount_cents: number;
  status: 'issued' | 'draft';
}

export interface FinanceInvoice {
  id: string;
  /** Line-scoped sequence, e.g. IRO-AR-000001. Not reused across lines or directions. */
  invoice_number: string;
  company: 'VANTA_HG';
  line_of_business: LineOfBusiness;
  book: FinanceBook;
  direction: InvoiceDirection;
  case_id: string;
  party_ref: string;
  lines: readonly FinanceInvoiceLine[];
  /** IDR only. Keeps an IDRE fee distinct from an administrative fee. */
  fee_type: IdrFeeType | null;
  amount_cents: number;
  status: InvoiceStatus;
  issued_at: string;
  due_at: string;
  /** Billing does not wait on closure and closure does not create this row. */
  case_closed_at_billing: boolean;
  flags: readonly string[];
  schedule_id: string | null;
}

export interface FinancePayment {
  id: string;
  invoice_id: string;
  line_of_business: LineOfBusiness;
  book: FinanceBook;
  /** Cents applied to this invoice. */
  amount_cents: number;
  /** Remainder held as a credit on this same line and book. Never auto-applied. */
  credit_cents: number;
  at: string;
  /** Internal ledger only. No processor or bank was settled. */
  external_settlement: 'not_configured';
}

/** Line-scoped credit. Applying it to another line or book is refused. */
export interface FinanceCredit {
  id: string;
  line_of_business: LineOfBusiness;
  book: FinanceBook;
  party_ref: string;
  amount_cents: number;
  source_payment_id: string;
  source_invoice_id: string;
}

export interface FinanceAdjustment {
  id: string;
  invoice_id: string;
  line_of_business: LineOfBusiness;
  book: FinanceBook;
  amount_cents: number;
  reason: string;
  status: 'pending' | 'approved' | 'denied';
  requested_by: string;
  approved_by: string | null;
  at: string;
}

export type EscrowReleaseType = 'party_payment' | 'refund' | 'earned_fee';

export interface EscrowEntry {
  id: string;
  case_id: string;
  line_of_business: 'IDR';
  book: 'idr_escrow';
  direction: 'deposit' | 'release';
  release_type: EscrowReleaseType | null;
  source_ref: string | null;
  approved_by: string | null;
  amount_cents: number;
  at: string;
}

/** Refund of escrow. Linked to the release. It does not fund IRO or IDR fees. */
export interface FinanceRefund {
  id: string;
  escrow_entry_id: string;
  case_id: string;
  line_of_business: 'IDR';
  book: 'idr_escrow';
  amount_cents: number;
  source_ref: string;
  approved_by: string;
  at: string;
}

export interface CaseClosureNote {
  case_id: string;
  line_of_business: LineOfBusiness;
  closed_at: string;
  /** Always false: noting closure does not post money. */
  posted_invoice: false;
}

export interface FinanceAuditEvent {
  at: string;
  actor_id: string;
  action: string;
  code: string;
  line_of_business: LineOfBusiness | 'ALL';
  book: FinanceBook | null;
  amount_cents: number | null;
  record_id: string | null;
}

export interface FinanceState {
  invoices: FinanceInvoice[];
  payments: FinancePayment[];
  adjustments: FinanceAdjustment[];
  credits: FinanceCredit[];
  escrow: EscrowEntry[];
  refunds: FinanceRefund[];
  closures: CaseClosureNote[];
  audit: FinanceAuditEvent[];
}

export interface FinanceOk<T> {
  ok: true;
  state: FinanceState;
  value: T;
}

export interface FinanceNo {
  ok: false;
  state: FinanceState;
  code: string;
  message: string;
}

export type FinanceResult<T> = FinanceOk<T> | FinanceNo;

export type AgingBucket = 'current' | '1_30' | '31_60' | '61_90' | 'over_90';
