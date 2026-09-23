/**
 * Monthly statement stub (Phase 4.4).
 *
 * Groups open billable events per client. Portal page + HTML/PDF.
 * Does not push to Meow / Stripe / QuickBooks — export is later.
 * Events stay `open` until a future invoicing job marks them invoiced.
 * Synthetic staging only — no live PHI.
 */

import { randomUUID } from 'crypto';
import { jsPDF } from 'jspdf';
import { SYNTHETIC_CLIENT_ID } from '@/lib/intake/constants';
import { monthRange } from './invoice-generator';
import {
  eventAmount,
  formatUsd,
  getMemoryBillableEventLedger,
  type BillableEvent,
  type BillableEventLedger,
} from './events';
import { selectCommercialLedgerRows } from './um-invoice';

export interface BillingStatement {
  statement_id: string;
  client_id: string;
  client_name: string;
  period_start: string;
  period_end: string;
  generated_at: string;
  status: 'draft';
  event_ids: string[];
  events: BillableEvent[];
  subtotal: number;
  currency: 'USD';
  html: string;
}

export interface StatementStore {
  insert(row: BillingStatement): Promise<BillingStatement>;
  get(id: string): Promise<BillingStatement | null>;
  list(clientId?: string): Promise<BillingStatement[]>;
}

function cloneStatement(row: BillingStatement): BillingStatement {
  return {
    ...row,
    event_ids: [...row.event_ids],
    events: row.events.map((e) => ({ ...e })),
  };
}

export class MemoryStatementStore implements StatementStore {
  private rows = new Map<string, BillingStatement>();

  async insert(row: BillingStatement): Promise<BillingStatement> {
    const copy = cloneStatement(row);
    this.rows.set(copy.statement_id, copy);
    return cloneStatement(copy);
  }

  async get(id: string): Promise<BillingStatement | null> {
    const found = this.rows.get(id);
    return found ? cloneStatement(found) : null;
  }

  async list(clientId?: string): Promise<BillingStatement[]> {
    return [...this.rows.values()]
      .filter((r) => !clientId || r.client_id === clientId)
      .sort((a, b) => b.generated_at.localeCompare(a.generated_at))
      .map(cloneStatement);
  }

  reset(): void {
    this.rows.clear();
  }
}

let memorySingleton: MemoryStatementStore | null = null;

export function getMemoryStatementStore(): MemoryStatementStore {
  if (!memorySingleton) memorySingleton = new MemoryStatementStore();
  return memorySingleton;
}

export function resetMemoryStatementStore(): MemoryStatementStore {
  memorySingleton = new MemoryStatementStore();
  return memorySingleton;
}

export function renderStatementHtml(statement: Omit<BillingStatement, 'html'>): string {
  const rows = statement.events
    .map(
      (e) => `<tr>
<td>${escapeHtml(e.sku)}</td>
<td class="mono">${escapeHtml(e.case_id)}</td>
<td>${e.quantity}</td>
<td>${formatUsd(e.unit_price)}</td>
<td>${formatUsd(eventAmount(e))}</td>
</tr>`,
    )
    .join('');
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Statement ${escapeHtml(statement.statement_id)}</title>
<style>
body{font-family:DM Sans,system-ui,sans-serif;color:#0c2340;margin:32px}
h1{font-family:Georgia,serif}
table{border-collapse:collapse;width:100%;margin-top:16px}
th,td{border-bottom:1px solid #e5e7eb;text-align:left;padding:8px;font-size:13px}
.mono{font-family:ui-monospace,monospace;font-size:11px}
.muted{color:#6b7280}
</style></head>
<body>
<h1>VantaUM monthly statement</h1>
<p class="muted">Synthetic staging — no live PHI.</p>
<p>Client: <strong>${escapeHtml(statement.client_name)}</strong> (${escapeHtml(statement.client_id)})</p>
<p>Period: ${escapeHtml(statement.period_start.slice(0, 10))} – ${escapeHtml(statement.period_end.slice(0, 10))}</p>
<p>Generated: ${escapeHtml(statement.generated_at)}</p>
<table>
<thead><tr><th>SKU</th><th>Case</th><th>Qty</th><th>Unit</th><th>Amount</th></tr></thead>
<tbody>${rows || '<tr><td colspan="5">No open events</td></tr>'}</tbody>
</table>
<p><strong>Subtotal ${formatUsd(statement.subtotal)}</strong></p>
</body></html>`;
}

export async function generateMonthlyStatement(
  ledger: BillableEventLedger,
  store: StatementStore,
  input: {
    client_id: string;
    client_name?: string;
    as_of?: Date;
    period_start?: string;
    period_end?: string;
  },
): Promise<BillingStatement> {
  const asOf = input.as_of ?? new Date();
  const range = monthRange(asOf);
  const periodStart = input.period_start ?? range.start.toISOString();
  const periodEnd = input.period_end ?? range.end.toISOString();
  const startMs = new Date(periodStart).getTime();
  const endMs = new Date(periodEnd).getTime();

  const open = selectCommercialLedgerRows(
    (await ledger.list({ client_id: input.client_id, status: 'open' })).filter((e) => {
      const t = new Date(e.occurred_at).getTime();
      return t >= startMs && t <= endMs + 86_400_000 - 1;
    }),
  );

  const statementId = randomUUID();
  const linked = open.map((event) => ({ ...event, statement_id: statementId }));
  for (const event of linked) {
    await ledger.update(event);
  }

  const draft: Omit<BillingStatement, 'html'> = {
    statement_id: statementId,
    client_id: input.client_id,
    client_name: input.client_name ?? 'Synthetic Staging TPA',
    period_start: periodStart,
    period_end: periodEnd,
    generated_at: asOf.toISOString(),
    status: 'draft',
    event_ids: linked.map((e) => e.billable_event_id),
    events: linked,
    subtotal: linked.reduce((sum, e) => sum + eventAmount(e), 0),
    currency: 'USD',
  };

  const statement: BillingStatement = { ...draft, html: renderStatementHtml(draft) };
  return store.insert(statement);
}

/**
 * Monthly job for the one synthetic test client (07 invoicing MVP step 1).
 * Refuses any other client_id so this stub cannot wander onto another tenant.
 */
export async function runSyntheticMonthlyStatementJob(input: { as_of?: Date; client_id?: string } = {}) {
  const clientId = input.client_id ?? SYNTHETIC_CLIENT_ID;
  if (clientId !== SYNTHETIC_CLIENT_ID) {
    throw new Error('statement_stub_synthetic_only');
  }
  return generateMonthlyStatement(getMemoryBillableEventLedger(), getMemoryStatementStore(), {
    client_id: SYNTHETIC_CLIENT_ID,
    client_name: 'Synthetic Staging TPA',
    as_of: input.as_of,
  });
}

export function renderStatementPdf(statement: BillingStatement): Buffer {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor('#0c2340');
  doc.text('VantaUM monthly statement', 20, 22);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor('#6b7280');
  doc.text('Synthetic staging — no live PHI.', 20, 30);
  doc.setTextColor('#0c2340');
  doc.text(`Client: ${statement.client_name}`, 20, 40);
  doc.text(
    `Period: ${statement.period_start.slice(0, 10)} – ${statement.period_end.slice(0, 10)}`,
    20,
    46,
  );
  let y = 58;
  doc.setFont('helvetica', 'bold');
  doc.text('SKU', 20, y);
  doc.text('Amount', 160, y);
  y += 8;
  doc.setFont('helvetica', 'normal');
  for (const event of statement.events) {
    if (y > 270) {
      doc.addPage();
      y = 20;
    }
    doc.text(`${event.sku} × ${event.quantity}`, 20, y);
    doc.text(formatUsd(eventAmount(event)), 160, y);
    y += 7;
  }
  y += 6;
  doc.setFont('helvetica', 'bold');
  doc.text(`Subtotal ${formatUsd(statement.subtotal)}`, 20, y);
  return Buffer.from(doc.output('arraybuffer'));
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
