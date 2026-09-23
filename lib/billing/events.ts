/**
 * Billable event ledger (docs/customer-ready/07-billing-and-tracking.md).
 *
 * Created on MD sign (R13). Memory-backed in demo/test. Schema 030 is the
 * RDS catalog. Never delete a row — void with reason.
 */

import { randomUUID } from 'crypto';
import type { AuthWorkflowType, CaseSpinePriority } from '@/lib/case-spine/types';

/**
 * Usage-tracking SKUs on the case ledger — not a standalone UM storefront.
 * VantaUM sells Med Review; these lines record work under UM’s med-review
 * contract. Do not treat them as a free-standing UM offer. Do not invent prices.
 */
export const BILLABLE_SKUS = ['prior_auth', 'first_level_appeal', 'rush_addon'] as const;
export type BillableSku = (typeof BILLABLE_SKUS)[number];

/** Commercial two-line ledger SKUs. Legacy SKUs stay on the synthetic schedule. */
export const UM_LEDGER_SKUS = ['um_review', 'um_platform'] as const;
export type UmLedgerSku = (typeof UM_LEDGER_SKUS)[number];
export type LedgerSku = BillableSku | UmLedgerSku;

export const BILLABLE_STATUSES = ['open', 'invoiced', 'void'] as const;
export type BillableStatus = (typeof BILLABLE_STATUSES)[number];

/** Synthetic staging fee schedule — dollars. */
export const SYNTHETIC_FEE_SCHEDULE: Record<BillableSku, number> = {
  prior_auth: 45,
  first_level_appeal: 75,
  rush_addon: 25,
};

export interface BillableEvent {
  billable_event_id: string;
  case_id: string;
  client_id: string;
  sku: LedgerSku;
  quantity: number;
  unit_price: number;
  currency: 'USD';
  occurred_at: string;
  invoice_id: string | null;
  statement_id: string | null;
  status: BillableStatus;
  void_reason: string | null;
  voided_by: string | null;
  /** legacy_sku = Phase 4 synthetic schedule. um_* = two-line commercial card. */
  line_kind?: 'legacy_sku' | 'um_review' | 'um_platform';
  bill_tier?: string | null;
  cost_amount?: number | null;
  touch_stack?: string[];
}

export interface RecordBillableEventInput {
  billable_event_id?: string;
  case_id: string;
  client_id: string;
  sku: BillableSku;
  quantity?: number;
  unit_price?: number;
  occurred_at: string;
}

export interface BillableEventLedger {
  insert(event: BillableEvent): Promise<BillableEvent>;
  get(id: string): Promise<BillableEvent | null>;
  getByCase(caseId: string): Promise<BillableEvent[]>;
  list(filters?: { client_id?: string; status?: BillableStatus }): Promise<BillableEvent[]>;
  update(event: BillableEvent): Promise<BillableEvent>;
}

function cloneEvent(e: BillableEvent): BillableEvent {
  return { ...e };
}

export class MemoryBillableEventLedger implements BillableEventLedger {
  private events = new Map<string, BillableEvent>();

  async insert(event: BillableEvent): Promise<BillableEvent> {
    const copy = cloneEvent(event);
    this.events.set(copy.billable_event_id, copy);
    return cloneEvent(copy);
  }

  async get(id: string): Promise<BillableEvent | null> {
    const found = this.events.get(id);
    return found ? cloneEvent(found) : null;
  }

  async getByCase(caseId: string): Promise<BillableEvent[]> {
    return [...this.events.values()]
      .filter((e) => e.case_id === caseId)
      .sort((a, b) => a.occurred_at.localeCompare(b.occurred_at))
      .map(cloneEvent);
  }

  async list(filters: { client_id?: string; status?: BillableStatus } = {}): Promise<BillableEvent[]> {
    return [...this.events.values()]
      .filter((e) => !filters.client_id || e.client_id === filters.client_id)
      .filter((e) => !filters.status || e.status === filters.status)
      .sort((a, b) => a.occurred_at.localeCompare(b.occurred_at))
      .map(cloneEvent);
  }

  async update(event: BillableEvent): Promise<BillableEvent> {
    const copy = cloneEvent(event);
    this.events.set(copy.billable_event_id, copy);
    return cloneEvent(copy);
  }

  reset(): void {
    this.events.clear();
  }
}

let memorySingleton: MemoryBillableEventLedger | null = null;

export function getMemoryBillableEventLedger(): MemoryBillableEventLedger {
  if (!memorySingleton) memorySingleton = new MemoryBillableEventLedger();
  return memorySingleton;
}

export function resetMemoryBillableEventLedger(): MemoryBillableEventLedger {
  memorySingleton = new MemoryBillableEventLedger();
  return memorySingleton;
}

export function isLegacyLedgerSku(sku: string): sku is BillableSku {
  return (BILLABLE_SKUS as readonly string[]).includes(sku);
}

export function skuForWorkflow(type: AuthWorkflowType): BillableSku {
  return type === 'first_level_appeal' ? 'first_level_appeal' : 'prior_auth';
}

export function isRushPriority(priority: CaseSpinePriority): boolean {
  return priority === 'urgent' || priority === 'expedited';
}

export function mintBillableEvent(input: RecordBillableEventInput): BillableEvent {
  return {
    billable_event_id: input.billable_event_id ?? randomUUID(),
    case_id: input.case_id,
    client_id: input.client_id,
    sku: input.sku,
    quantity: input.quantity ?? 1,
    unit_price: input.unit_price ?? SYNTHETIC_FEE_SCHEDULE[input.sku],
    currency: 'USD',
    occurred_at: input.occurred_at,
    invoice_id: null,
    statement_id: null,
    status: 'open',
    void_reason: null,
    voided_by: null,
    line_kind: 'legacy_sku',
    bill_tier: null,
    cost_amount: null,
    touch_stack: [],
  };
}

/**
 * Idempotent: if the case already has a primary SKU row, reuse it.
 * Rush add-on is a second row when priority warrants it.
 */
export async function recordBillableEventsForSign(
  ledger: BillableEventLedger,
  input: {
    billable_event_id: string;
    case_id: string;
    client_id: string;
    type: AuthWorkflowType;
    priority: CaseSpinePriority;
    occurred_at: string;
  },
): Promise<BillableEvent[]> {
  const existing = await ledger.getByCase(input.case_id);
  const legacy = existing.filter((event) => isLegacyLedgerSku(event.sku) && event.status !== 'void');
  const primarySku = skuForWorkflow(input.type);
  // A commercial um_review row is not the synthetic schedule. Only a
  // primary legacy SKU short-circuits this mint.
  if (legacy.some((event) => event.sku === primarySku)) return legacy;

  const primary = mintBillableEvent({
    billable_event_id: input.billable_event_id,
    case_id: input.case_id,
    client_id: input.client_id,
    sku: skuForWorkflow(input.type),
    occurred_at: input.occurred_at,
  });
  const written = [await ledger.insert(primary)];

  if (isRushPriority(input.priority)) {
    written.push(
      await ledger.insert(
        mintBillableEvent({
          case_id: input.case_id,
          client_id: input.client_id,
          sku: 'rush_addon',
          occurred_at: input.occurred_at,
        }),
      ),
    );
  }
  return written;
}

export function eventAmount(event: BillableEvent): number {
  return event.unit_price * event.quantity;
}

export function formatUsd(amount: number): string {
  return amount.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
