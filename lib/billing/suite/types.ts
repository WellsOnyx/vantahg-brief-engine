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

/** Preliminary. Not a locked payout card. The pricer reads this object. */
export interface PayoutSchedule {
  id: string;
  preliminary: true;
  effective_from: string;
  effective_to: string | null;
  reviewer_flat_cents: number;
  md_flat_cents: number;
  peer_to_peer_hourly_cents: number;
  spending_limit_cents: number;
  change_note: string;
}

/** Synthetic IDR case fee. Not a CMS or IDRE fee schedule. */
export interface IdrFeeSchedule {
  id: string;
  preliminary: true;
  case_fee_cents: number;
  change_note: string;
}

/**
 * Medical Review contract terms for this ledger.
 * This is not `lib/billing/um-price-card.ts`. Posting still requires the
 * existing Med Review entitlement.
 */
export interface MedReviewContractTerms {
  id: string;
  preliminary: true;
  platform_cents: number;
  per_review_cents: number;
  change_note: string;
}

export type InvoiceDirection = 'AR' | 'AP';
export type InvoiceStatus = 'pending_approval' | 'open' | 'paid' | 'void';

export interface FinanceInvoice {
  id: string;
  company: 'VANTA_HG';
  line_of_business: LineOfBusiness;
  book: FinanceBook;
  direction: InvoiceDirection;
  case_id: string;
  party_ref: string;
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
  amount_cents: number;
  at: string;
  /** Internal ledger only. No processor or bank was settled. */
  external_settlement: 'not_configured';
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

export interface EscrowEntry {
  id: string;
  case_id: string;
  line_of_business: 'IDR';
  book: 'idr_escrow';
  direction: 'deposit' | 'release';
  amount_cents: number;
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
  escrow: EscrowEntry[];
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
