/**
 * RDS billable-event ledger (migrations 030 + 032).
 *
 * Used when ENABLE_AWS_DB=true. Demo and tests stay on the memory ledger.
 * Prices are not stored as a second rate card — rows are whatever the
 * two-line helpers already computed.
 */

import { getServiceClient } from '@/lib/supabase';
import {
  type BillableEvent,
  type BillableEventLedger,
  type BillableStatus,
  type LedgerSku,
} from './events';

type Row = Record<string, unknown>;

function num(value: unknown, fallback: number | null = 0): number | null {
  if (value == null || value === '') return fallback;
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return n;
}

function toIso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  return String(value ?? '');
}

export function billableEventToRow(event: BillableEvent): Row {
  return {
    billable_event_id: event.billable_event_id,
    case_id: event.case_id,
    client_id: event.client_id,
    sku: event.sku,
    quantity: event.quantity,
    unit_price: event.unit_price,
    currency: event.currency,
    occurred_at: event.occurred_at,
    invoice_id: event.invoice_id,
    statement_id: event.statement_id,
    status: event.status,
    void_reason: event.void_reason,
    voided_by: event.voided_by,
    line_kind: event.line_kind ?? 'legacy_sku',
    bill_tier: event.bill_tier ?? null,
    cost_amount: event.cost_amount ?? null,
    touch_stack: event.touch_stack ?? [],
  };
}

export function rowToBillableEvent(row: Row): BillableEvent {
  const touch = row.touch_stack;
  return {
    billable_event_id: String(row.billable_event_id),
    case_id: String(row.case_id),
    client_id: String(row.client_id),
    sku: String(row.sku) as LedgerSku,
    quantity: num(row.quantity, 1) ?? 1,
    unit_price: num(row.unit_price, 0) ?? 0,
    currency: 'USD',
    occurred_at: toIso(row.occurred_at),
    invoice_id: row.invoice_id == null ? null : String(row.invoice_id),
    statement_id: row.statement_id == null ? null : String(row.statement_id),
    status: String(row.status) as BillableStatus,
    void_reason: row.void_reason == null ? null : String(row.void_reason),
    voided_by: row.voided_by == null ? null : String(row.voided_by),
    line_kind: (row.line_kind as BillableEvent['line_kind']) ?? 'legacy_sku',
    bill_tier: row.bill_tier == null ? null : String(row.bill_tier),
    cost_amount: row.cost_amount == null ? null : num(row.cost_amount, null),
    touch_stack: Array.isArray(touch) ? touch.map((item) => String(item)) : [],
  };
}

function throwIfError(error: { message: string } | null): void {
  if (error) throw new Error(error.message);
}

export class PgBillableEventLedger implements BillableEventLedger {
  async insert(event: BillableEvent): Promise<BillableEvent> {
    const client = getServiceClient();
    const { data, error } = await client
      .from('billable_events')
      .insert(billableEventToRow(event))
      .select()
      .single();
    throwIfError(error);
    return rowToBillableEvent(data as Row);
  }

  async get(id: string): Promise<BillableEvent | null> {
    const client = getServiceClient();
    const { data, error } = await client
      .from('billable_events')
      .select('*')
      .eq('billable_event_id', id)
      .maybeSingle();
    throwIfError(error);
    return data ? rowToBillableEvent(data as Row) : null;
  }

  async getByCase(caseId: string): Promise<BillableEvent[]> {
    const client = getServiceClient();
    const { data, error } = await client
      .from('billable_events')
      .select('*')
      .eq('case_id', caseId)
      .order('occurred_at', { ascending: true });
    throwIfError(error);
    return ((data ?? []) as Row[]).map(rowToBillableEvent);
  }

  async list(filters: { client_id?: string; status?: BillableStatus } = {}): Promise<BillableEvent[]> {
    const client = getServiceClient();
    let query = client.from('billable_events').select('*');
    if (filters.client_id) query = query.eq('client_id', filters.client_id);
    if (filters.status) query = query.eq('status', filters.status);
    const { data, error } = await query.order('occurred_at', { ascending: true });
    throwIfError(error);
    return ((data ?? []) as Row[]).map(rowToBillableEvent);
  }

  async update(event: BillableEvent): Promise<BillableEvent> {
    const client = getServiceClient();
    const row = billableEventToRow(event);
    const { billable_event_id: id, ...patch } = row;
    const { data, error } = await client
      .from('billable_events')
      .update(patch)
      .eq('billable_event_id', id)
      .select()
      .single();
    throwIfError(error);
    return rowToBillableEvent(data as Row);
  }
}

let pgSingleton: PgBillableEventLedger | null = null;

export function getPgBillableEventLedger(): PgBillableEventLedger {
  if (!pgSingleton) pgSingleton = new PgBillableEventLedger();
  return pgSingleton;
}
