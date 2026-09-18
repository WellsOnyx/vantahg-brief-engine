/**
 * Client-facing reports (08 / Phase 6.1).
 *
 * Volume.signed must match distinct non-void ledger case_ids in the same
 * window. Synthetic / demo only — no live PHI.
 */

import { isOpenCase, type AuthWorkflowType, type CanonicalCase } from '@/lib/case-spine';
import type { BillableEvent } from '@/lib/billing/events';
import { DETERMINATIONS, type SpineDetermination } from '@/lib/case-spine/types';
import type {
  ClientReport,
  DenyReasonRow,
  DenyReasonsReport,
  OutcomeRow,
  OutcomesReport,
  ReportBundle,
  ReportFilters,
  ReportKind,
  ReportSource,
  SlaReport,
  SlaRow,
  TurnaroundReport,
  TurnaroundRow,
  VolumeGrain,
  VolumeReport,
  VolumeRow,
} from './types';

export function parseReportQuery(searchParams: URLSearchParams, viewerClientId?: string | null): ReportFilters {
  const type = searchParams.get('type');
  const grain = searchParams.get('grain');
  return {
    client_id: viewerClientId || searchParams.get('client_id'),
    from: searchParams.get('from'),
    to: searchParams.get('to'),
    lob: searchParams.get('lob'),
    type: type === 'prior_auth' || type === 'first_level_appeal' ? (type as AuthWorkflowType) : null,
    grain: grain === 'week' ? 'week' : 'day',
  };
}

function inRange(iso: string | null | undefined, from?: string | null, to?: string | null): boolean {
  if (!iso) return false;
  if (from && iso < from) return false;
  if (to && iso > to) return false;
  return true;
}

function matchesLob(c: CanonicalCase, lob?: string | null): boolean {
  if (!lob) return true;
  const needle = lob.toLowerCase();
  if (c.lane && c.lane.toLowerCase() === needle) return true;
  const benefit = c.intake.benefit_type?.toLowerCase();
  if (benefit === needle) return true;
  if (needle === 'pharmacy' && benefit === 'drug') return true;
  return false;
}

export function filterReportCases(cases: CanonicalCase[], filters: ReportFilters = {}): CanonicalCase[] {
  return cases.filter((c) => {
    if (filters.client_id && c.client_id !== filters.client_id) return false;
    if (filters.type && c.type !== filters.type) return false;
    if (!matchesLob(c, filters.lob)) return false;
    if (filters.from || filters.to) {
      const stamp = c.determined_at ?? c.received_at;
      if (!inRange(stamp, filters.from, filters.to) && !inRange(c.received_at, filters.from, filters.to)) {
        return false;
      }
    }
    return true;
  });
}

export function filterLedgerEvents(events: BillableEvent[], filters: ReportFilters = {}): BillableEvent[] {
  return events.filter((e) => {
    if (e.status === 'void') return false;
    if (filters.client_id && e.client_id !== filters.client_id) return false;
    if (!inRange(e.occurred_at, filters.from, filters.to)) return false;
    return true;
  });
}

export function uniqueLedgerCaseIds(events: BillableEvent[]): string[] {
  return [...new Set(events.map((e) => e.case_id))];
}

function periodKey(iso: string, grain: VolumeGrain): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  if (grain === 'day') return d.toISOString().slice(0, 10);
  const utc = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = utc.getUTCDay() || 7;
  utc.setUTCDate(utc.getUTCDate() - day + 1);
  return utc.toISOString().slice(0, 10);
}

function hoursBetween(from: string, to: string): number {
  const ms = new Date(to).getTime() - new Date(from).getTime();
  return Math.round((ms / 3600_000) * 100) / 100;
}

export function percentile(values: number[], p: number): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length === 1) return sorted[0];
  const idx = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return Math.round((sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo)) * 100) / 100;
}

export function buildVolumeReport(source: ReportSource, filters: ReportFilters = {}): VolumeReport {
  const grain: VolumeGrain = filters.grain === 'week' ? 'week' : 'day';
  const cases = filterReportCases(source.cases, filters);
  const ledger = filterLedgerEvents(source.ledger, filters);
  const ledgerCases = new Set(uniqueLedgerCaseIds(ledger));

  const buckets = new Map<string, VolumeRow>();
  const ensure = (period: string): VolumeRow => {
    const existing = buckets.get(period);
    if (existing) return existing;
    const fresh: VolumeRow = { period, grain, received: 0, signed: 0, open: 0, ledger_signed: 0 };
    buckets.set(period, fresh);
    return fresh;
  };

  for (const c of cases) {
    const receivedPeriod = periodKey(c.received_at, grain);
    ensure(receivedPeriod).received += 1;
    if (isOpenCase(c)) ensure(receivedPeriod).open += 1;
    if (c.determined_at && c.determination) {
      const signedPeriod = periodKey(c.determined_at, grain);
      ensure(signedPeriod).signed += 1;
    }
  }

  for (const caseId of ledgerCases) {
    const event = ledger.find((e) => e.case_id === caseId);
    if (!event) continue;
    ensure(periodKey(event.occurred_at, grain)).ledger_signed += 1;
  }

  const rows = [...buckets.values()].sort((a, b) => a.period.localeCompare(b.period));
  const totals = rows.reduce(
    (acc, row) => ({
      received: acc.received + row.received,
      signed: acc.signed + row.signed,
      open: acc.open + row.open,
      ledger_signed: acc.ledger_signed + row.ledger_signed,
    }),
    { received: 0, signed: 0, open: 0, ledger_signed: 0 },
  );

  const signedCases = cases.filter((c) => Boolean(c.determined_at && c.determination)).length;
  return {
    kind: 'volume',
    grain,
    rows,
    totals: { ...totals, signed: signedCases, ledger_signed: ledgerCases.size },
    ledger_match: signedCases === ledgerCases.size,
  };
}

export function buildTurnaroundReport(source: ReportSource, filters: ReportFilters = {}): TurnaroundReport {
  const rows: TurnaroundRow[] = filterReportCases(source.cases, filters)
    .filter((c) => Boolean(c.determined_at))
    .map((c) => ({
      case_id: c.case_id,
      case_number: c.case_number,
      type: c.type,
      received_at: c.received_at,
      determined_at: c.determined_at as string,
      hours: hoursBetween(c.received_at, c.determined_at as string),
    }))
    .sort((a, b) => a.determined_at.localeCompare(b.determined_at));

  const hours = rows.map((r) => r.hours);
  return {
    kind: 'turnaround',
    rows,
    p50_hours: percentile(hours, 50),
    p90_hours: percentile(hours, 90),
  };
}

export function buildOutcomesReport(source: ReportSource, filters: ReportFilters = {}): OutcomesReport {
  const rows: OutcomeRow[] = filterReportCases(source.cases, filters)
    .filter((c): c is CanonicalCase & { determination: SpineDetermination } => Boolean(c.determination))
    .map((c) => ({
      case_id: c.case_id,
      case_number: c.case_number,
      type: c.type,
      determination: c.determination,
    }));

  const counts = Object.fromEntries(DETERMINATIONS.map((d) => [d, 0])) as Record<SpineDetermination, number>;
  for (const row of rows) counts[row.determination] += 1;
  const total = rows.length || 1;
  const rates = Object.fromEntries(
    DETERMINATIONS.map((d) => [d, Math.round((counts[d] / total) * 10000) / 10000]),
  ) as Record<SpineDetermination, number>;

  return { kind: 'outcomes', rows, counts, rates };
}

export function buildDenyReasonsReport(source: ReportSource, filters: ReportFilters = {}): DenyReasonsReport {
  const rows: DenyReasonRow[] = filterReportCases(source.cases, filters)
    .filter((c) => c.determination === 'deny' && c.deny_reason_code)
    .map((c) => ({
      case_id: c.case_id,
      case_number: c.case_number,
      deny_reason_code: c.deny_reason_code!,
    }));

  const counts: Record<string, number> = {};
  for (const row of rows) {
    counts[row.deny_reason_code] = (counts[row.deny_reason_code] ?? 0) + 1;
  }
  return { kind: 'deny_reasons', rows, counts };
}

export function buildSlaReport(source: ReportSource, filters: ReportFilters = {}): SlaReport {
  const rows: SlaRow[] = filterReportCases(source.cases, filters).map((c) => ({
    case_id: c.case_id,
    case_number: c.case_number,
    sla_status: c.sla_status,
  }));
  return {
    kind: 'sla',
    rows,
    counts: {
      hit: rows.filter((r) => r.sla_status === 'ok').length,
      miss: rows.filter((r) => r.sla_status === 'missed').length,
      at_risk: rows.filter((r) => r.sla_status === 'at_risk').length,
    },
  };
}

export function buildClientReport(kind: ReportKind, source: ReportSource, filters: ReportFilters = {}): ClientReport {
  switch (kind) {
    case 'volume':
      return buildVolumeReport(source, filters);
    case 'turnaround':
      return buildTurnaroundReport(source, filters);
    case 'outcomes':
      return buildOutcomesReport(source, filters);
    case 'deny_reasons':
      return buildDenyReasonsReport(source, filters);
    case 'sla':
      return buildSlaReport(source, filters);
  }
}

export function buildReportBundle(source: ReportSource, filters: ReportFilters = {}): ReportBundle {
  const volume = buildVolumeReport(source, filters);
  const cases = filterReportCases(source.cases, filters);
  const ledger = filterLedgerEvents(source.ledger, filters);
  return {
    client_id: filters.client_id ?? null,
    filters,
    volume,
    turnaround: buildTurnaroundReport(source, filters),
    outcomes: buildOutcomesReport(source, filters),
    deny_reasons: buildDenyReasonsReport(source, filters),
    sla: buildSlaReport(source, filters),
    ledger_signed: uniqueLedgerCaseIds(ledger).length,
    signed_cases: cases.filter((c) => Boolean(c.determined_at && c.determination)).length,
  };
}
