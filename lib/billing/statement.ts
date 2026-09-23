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
import { getClientConfigService } from '@/lib/client-config';
import {
  eventAmount,
  formatUsd,
  type BillableEvent,
  type BillableEventLedger,
} from './events';
import { getBillableEventLedger } from './ledger';
import { selectCommercialLedgerRows } from './um-invoice';
import { periodKeyFromDate, resolvePlatformCensus, upsertMonthlyPlatformLine } from './um-platform';

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
  /** Present when the period has a commercial um_review or um_platform row. */
  two_line: StatementTwoLine | null;
  html: string;
}

export interface StatementClinicalLine {
  tier: string;
  label: string;
  case_id: string;
  amount: number;
  zero_priced: boolean;
}

export interface StatementTwoLine {
  platform: {
    present: boolean;
    lives_in_month: number | null;
    pmpm: number | null;
    amount: number;
    waived: boolean;
    label: string;
  };
  clinical: StatementClinicalLine[];
  review_amount: number;
  denominator_label: string;
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
    events: row.events.map((e) => ({ ...e, touch_stack: e.touch_stack ? [...e.touch_stack] : e.touch_stack })),
    two_line: row.two_line
      ? {
          ...row.two_line,
          platform: { ...row.two_line.platform },
          clinical: row.two_line.clinical.map((line) => ({ ...line })),
        }
      : null,
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

const CLINICAL_TIER_ORDER = ['auto', 'nurse', 'md', 'external'] as const;

export function statementDenominatorLabel(
  livesInMonth: number | null,
  employeesInMonth: number | null,
): string {
  const pepm =
    employeesInMonth != null && employeesInMonth > 0
      ? `PEPM uses ${employeesInMonth.toLocaleString('en-US')} employees-in-month`
      : 'PEPM omitted (no employee count)';
  const pmpm =
    livesInMonth != null
      ? `PMPM uses ${livesInMonth.toLocaleString('en-US')} lives-in-month`
      : 'PMPM lives-in-month not supplied';
  return `${pepm}. ${pmpm}. Planning lock (333k EE / 500k lives) is not this statement.`;
}

function clinicalLabel(event: BillableEvent): { tier: string; label: string; zero: boolean } {
  const tier = event.bill_tier || 'unspecified';
  const zero = event.unit_price === 0;
  if (tier === 'auto' || (zero && tier === 'unspecified')) {
    return { tier: 'auto', label: 'auto / gold-card', zero: true };
  }
  return { tier, label: tier, zero };
}

export function buildStatementTwoLine(
  events: readonly BillableEvent[],
  census: { livesInMonth?: number | null; employeesInMonth?: number | null; pmpm?: number | null; waived?: boolean } = {},
): StatementTwoLine | null {
  const commercial = events.some((event) => event.sku === 'um_review' || event.sku === 'um_platform');
  if (!commercial) return null;
  const platformEvent = events.find((event) => event.sku === 'um_platform');
  const lives = census.livesInMonth ?? null;
  const waived = census.waived === true;
  const pmpm = waived ? 0 : (census.pmpm ?? null);
  const platformAmount = platformEvent ? eventAmount(platformEvent) : 0;
  const platformLabel = waived
    ? 'Platform PMPM waived (explicit fat-TPA waiver)'
    : lives != null && pmpm != null
      ? `Platform $${pmpm.toFixed(2)} PMPM × ${lives.toLocaleString('en-US')} lives`
      : 'Platform PMPM';
  const clinical = events
    .filter((event) => event.sku === 'um_review')
    .map((event) => {
      const labeled = clinicalLabel(event);
      return {
        tier: labeled.tier,
        label: labeled.label,
        case_id: event.case_id,
        amount: eventAmount(event),
        zero_priced: labeled.zero,
      };
    });
  return {
    platform: {
      present: Boolean(platformEvent),
      lives_in_month: lives,
      pmpm,
      amount: platformAmount,
      waived,
      label: platformLabel,
    },
    clinical,
    review_amount: clinical.reduce((sum, line) => sum + line.amount, 0),
    denominator_label: statementDenominatorLabel(lives, census.employeesInMonth ?? null),
  };
}

function renderLegacyRows(events: readonly BillableEvent[]): string {
  return events
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
}

function renderTwoLineBody(statement: Omit<BillingStatement, 'html'>): string {
  const view = statement.two_line;
  if (!view) return '';
  const groups = new Map<string, StatementClinicalLine[]>();
  for (const line of view.clinical) {
    const bucket = groups.get(line.label) ?? [];
    bucket.push(line);
    groups.set(line.label, bucket);
  }
  const orderedLabels = [
    ...CLINICAL_TIER_ORDER.map((tier) => (tier === 'auto' ? 'auto / gold-card' : tier)),
    ...[...groups.keys()].filter(
      (label) => !CLINICAL_TIER_ORDER.includes(label as (typeof CLINICAL_TIER_ORDER)[number]) && label !== 'auto / gold-card',
    ),
  ];
  const clinicalHtml = orderedLabels
    .filter((label) => groups.has(label))
    .map((label) => {
      const lines = groups.get(label) ?? [];
      const rows = lines
        .map(
          (line) => `<tr>
<td>um_review</td>
<td>${escapeHtml(line.label)}</td>
<td class="mono">${escapeHtml(line.case_id)}</td>
<td>1</td>
<td>${formatUsd(line.amount)}</td>
<td>${formatUsd(line.amount)}</td>
</tr>`,
        )
        .join('');
      return `<h3>${escapeHtml(label)}</h3>
<table>
<thead><tr><th>SKU</th><th>Tier</th><th>Case</th><th>Qty</th><th>Unit</th><th>Amount</th></tr></thead>
<tbody>${rows}</tbody>
</table>`;
    })
    .join('');
  const legacy = statement.events.filter((event) => event.sku !== 'um_review' && event.sku !== 'um_platform');
  const legacyHtml = legacy.length
    ? `<h2>Synthetic schedule</h2>
<p class="muted">Legacy SKUs for cases with no um_review row. Dropped when um_review exists for that case.</p>
<table>
<thead><tr><th>SKU</th><th>Case</th><th>Qty</th><th>Unit</th><th>Amount</th></tr></thead>
<tbody>${renderLegacyRows(legacy)}</tbody>
</table>`
    : '';
  const platformRow = view.platform.present
    ? `<tr>
<td>um_platform</td>
<td>${escapeHtml(view.platform.label)}</td>
<td>${view.platform.lives_in_month ?? '—'}</td>
<td>${view.platform.pmpm == null ? '—' : formatUsd(view.platform.pmpm)}</td>
<td>${formatUsd(view.platform.amount)}</td>
</tr>`
    : '<tr><td colspan="5">Platform line not posted. Supply lives-in-month. Platform is not $0 without an explicit waiver.</td></tr>';
  return `<h2>Platform</h2>
<table>
<thead><tr><th>SKU</th><th>Line</th><th>Lives</th><th>PMPM</th><th>Amount</th></tr></thead>
<tbody>${platformRow}</tbody>
</table>
<p class="muted">${escapeHtml(view.denominator_label)}</p>
<h2>Clinical review</h2>
<p class="muted">One tier per case. Rules/auto and gold-card rows post at $0.</p>
${clinicalHtml || '<p>No review lines.</p>'}
${legacyHtml}`;
}

export function renderStatementHtml(statement: Omit<BillingStatement, 'html'>): string {
  const body = statement.two_line
    ? renderTwoLineBody(statement)
    : `<table>
<thead><tr><th>SKU</th><th>Case</th><th>Qty</th><th>Unit</th><th>Amount</th></tr></thead>
<tbody>${renderLegacyRows(statement.events) || '<tr><td colspan="5">No open events</td></tr>'}</tbody>
</table>`;
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Statement ${escapeHtml(statement.statement_id)}</title>
<style>
body{font-family:DM Sans,system-ui,sans-serif;color:#0c2340;margin:32px}
h1,h2{font-family:Georgia,serif}
h3{font-size:15px;margin-bottom:0}
table{border-collapse:collapse;width:100%;margin-top:8px;margin-bottom:16px}
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
${body}
<p><strong>Subtotal ${formatUsd(statement.subtotal)}</strong></p>
</body></html>`;
}

export interface MonthlyStatementInput {
  client_id: string;
  client_name?: string;
  as_of?: Date;
  period_start?: string;
  period_end?: string;
  lives_in_month?: number | null;
  employees_in_month?: number | null;
  platform_pmpm?: number | null;
  platform_waived?: boolean;
}

export async function generateMonthlyStatement(
  ledger: BillableEventLedger,
  store: StatementStore,
  input: MonthlyStatementInput,
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

  const twoLine = buildStatementTwoLine(linked, {
    livesInMonth: input.lives_in_month,
    employeesInMonth: input.employees_in_month,
    pmpm: input.platform_pmpm,
    waived: input.platform_waived,
  });

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
    two_line: twoLine,
  };

  const statement: BillingStatement = { ...draft, html: renderStatementHtml(draft) };
  return store.insert(statement);
}

export interface SyntheticMonthlyJobInput {
  as_of?: Date;
  client_id?: string;
  lives_in_month?: number | null;
  employees_in_month?: number | null;
  platform_waived?: boolean | null;
  platform_pmpm?: number;
}

export interface SyntheticMonthlyJobResult {
  statement: BillingStatement;
  platform_posted: boolean;
  lives_in_month: number | null;
  employees_in_month: number | null;
  platform_waived: boolean;
  platform_pmpm: number | null;
}

/**
 * Monthly job for the one synthetic test client (07 invoicing MVP step 1).
 * Refuses any other client_id so this stub cannot wander onto another tenant.
 * Posts um_platform only when lives-in-month is on the request or client_config.
 */
export async function runSyntheticMonthlyStatementJob(
  input: SyntheticMonthlyJobInput = {},
): Promise<SyntheticMonthlyJobResult> {
  const clientId = input.client_id ?? SYNTHETIC_CLIENT_ID;
  if (clientId !== SYNTHETIC_CLIENT_ID) {
    throw new Error('statement_stub_synthetic_only');
  }
  const asOf = input.as_of ?? new Date();
  const latest = await getClientConfigService().getLatest(SYNTHETIC_CLIENT_ID);
  const census = resolvePlatformCensus({
    livesInMonth: input.lives_in_month,
    employeesInMonth: input.employees_in_month,
    waived: input.platform_waived,
    pmpm: input.platform_pmpm,
    config: latest?.config,
  });
  const ledger = getBillableEventLedger();
  const platform = await upsertMonthlyPlatformLine(ledger, {
    clientId: SYNTHETIC_CLIENT_ID,
    periodKey: periodKeyFromDate(asOf),
    livesInMonth: census.livesInMonth,
    pmpm: census.pmpm,
    waived: census.waived,
    occurredAt: asOf.toISOString(),
  });
  const statement = await generateMonthlyStatement(ledger, getMemoryStatementStore(), {
    client_id: SYNTHETIC_CLIENT_ID,
    client_name: latest?.config.legal_name ?? 'Synthetic Staging TPA',
    as_of: asOf,
    lives_in_month: census.livesInMonth,
    employees_in_month: census.employeesInMonth,
    platform_pmpm: platform ? census.pmpm : null,
    platform_waived: census.waived,
  });
  return {
    statement,
    platform_posted: Boolean(platform),
    lives_in_month: census.livesInMonth,
    employees_in_month: census.employeesInMonth,
    platform_waived: census.waived,
    platform_pmpm: platform ? census.pmpm : null,
  };
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
  const writeLine = (left: string, right: string, bold = false) => {
    if (y > 270) {
      doc.addPage();
      y = 20;
    }
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    doc.text(left, 20, y);
    doc.text(right, 160, y);
    y += 7;
  };
  if (statement.two_line) {
    writeLine('Platform', '', true);
    const platform = statement.two_line.platform;
    writeLine(platform.label, formatUsd(platform.amount));
    doc.setFontSize(8);
    doc.setTextColor('#6b7280');
    writeLine(statement.two_line.denominator_label, '');
    doc.setFontSize(10);
    doc.setTextColor('#0c2340');
    writeLine('Clinical review', '', true);
    if (statement.two_line.clinical.length === 0) writeLine('No review lines', '');
    for (const line of statement.two_line.clinical) {
      const tag = line.zero_priced ? `${line.label} ($0)` : line.label;
      writeLine(`${tag}  ${line.case_id}`, formatUsd(line.amount));
    }
  } else {
    writeLine('SKU', 'Amount', true);
    for (const event of statement.events) {
      writeLine(`${event.sku} × ${event.quantity}`, formatUsd(eventAmount(event)));
    }
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
