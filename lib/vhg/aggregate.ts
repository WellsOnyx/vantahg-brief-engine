import { evaluateUmBriefEngineAccess } from '@/lib/entitlements/um-brief-engine';
import { ENTITLED_CLIENT_ID } from './catalog';
import { VHG_DEMO_CLIENTS, type VhgDemoClient } from './dashboard';
import { getLiveScored, getScoredLedger, liveCaseCount, type ScoredLedgerCase } from './ledger';
import {
  bucketBounds,
  bucketKey,
  bucketLabel,
  clampRange,
  GRAINS,
  LEDGER_END,
  LEDGER_START,
  type Grain,
} from './time-range';
import { VHG_BANNER } from './types';

export interface AggregateBucket {
  key: string;
  label: string;
  from: string;
  to: string;
  cases: number;
  high_risk: number;
  avg_score: number;
  projected_exposure_usd: number;
  stop_sign_flags: number;
}

export interface AggregateStopRow {
  case_token: string;
  case_number: string;
  service_date: string;
  service_month: string;
  service_line: string;
  state: string;
  score: number;
  band: ScoredLedgerCase['band'];
  top_driver: string;
  projected_exposure_usd: number;
  stop_sign: boolean;
}

export interface AggregateSlice {
  key: string;
  cases: number;
  high_risk: number;
  projected_exposure_usd: number;
}

export interface StoplossAggregateOk {
  ok: true;
  synthetic: true;
  demo_label: 'Demo, synthetic data';
  live: true;
  banner: typeof VHG_BANNER;
  updated_at: string;
  live_count: number;
  client: VhgDemoClient;
  grain: Grain;
  from: string;
  to: string;
  ledger_start: typeof LEDGER_START;
  ledger_end: typeof LEDGER_END;
  totals: {
    cases_reviewed: number;
    high_vhg_risk_count: number;
    avg_likely_idr_contested_score: number;
    projected_idr_exposure_usd: number;
    stop_sign_flags: number;
  };
  buckets: AggregateBucket[];
  by_service_line: AggregateSlice[];
  by_state: AggregateSlice[];
  stop_sign: AggregateStopRow[];
  stop_sign_total: number;
  exposure_note: string;
}

export interface StoplossAggregateDenied {
  ok: false;
  code: 'not_entitled' | 'unknown_client';
  reason: string;
  banner: typeof VHG_BANNER;
  demo_label: 'Demo, synthetic data';
  client: VhgDemoClient | null;
}

export type StoplossAggregateResult = StoplossAggregateOk | StoplossAggregateDenied;

function inRange(row: ScoredLedgerCase, from: string, to: string): boolean {
  return row.row.service_date >= from && row.row.service_date <= to;
}

function average(rows: ScoredLedgerCase[]): number {
  if (rows.length === 0) return 0;
  const sum = rows.reduce((total, row) => total + row.score, 0);
  return Math.round(sum / rows.length);
}

function sliceBy(rows: ScoredLedgerCase[], keyOf: (row: ScoredLedgerCase) => string): AggregateSlice[] {
  const map = new Map<string, AggregateSlice>();
  for (const row of rows) {
    const key = keyOf(row);
    const current = map.get(key) ?? { key, cases: 0, high_risk: 0, projected_exposure_usd: 0 };
    current.cases += 1;
    if (row.band === 'high') current.high_risk += 1;
    current.projected_exposure_usd += row.exposure;
    map.set(key, current);
  }
  return [...map.values()].sort((a, b) => b.projected_exposure_usd - a.projected_exposure_usd || b.cases - a.cases);
}

export function isGrain(value: string | null): value is Grain {
  return GRAINS.includes(value as Grain);
}

export function aggregateStoploss(options: {
  clientId?: string;
  grain: Grain;
  from: string;
  to: string;
  now?: number;
}): StoplossAggregateResult {
  const clientId = options.clientId || ENTITLED_CLIENT_ID;
  const client = VHG_DEMO_CLIENTS.find((row) => row.client_id === clientId) ?? null;
  if (!client) {
    return {
      ok: false,
      code: 'unknown_client',
      reason: 'Unknown synthetic client. Stop-loss demo data is limited to the seeded clients.',
      banner: VHG_BANNER,
      demo_label: 'Demo, synthetic data',
      client: null,
    };
  }
  const access = evaluateUmBriefEngineAccess(client);
  if (!access.allowed) {
    return {
      ok: false,
      code: 'not_entitled',
      reason: access.reason,
      banner: VHG_BANNER,
      demo_label: 'Demo, synthetic data',
      client,
    };
  }

  const range = clampRange(options.from, options.to);
  const now = options.now ?? Date.now();
  const rows = [...getScoredLedger(), ...getLiveScored(now)].filter(
    (row) => row.row.client_id === client.client_id && inRange(row, range.from, range.to),
  );

  const buckets = new Map<string, ScoredLedgerCase[]>();
  for (const row of rows) {
    const key = bucketKey(row.row.service_date, options.grain);
    const list = buckets.get(key);
    if (list) list.push(row);
    else buckets.set(key, [row]);
  }

  const bucketList: AggregateBucket[] = [...buckets.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, group]) => {
      const bounds = bucketBounds(key, options.grain);
      return {
        key,
        label: bucketLabel(key, options.grain),
        from: bounds.from < range.from ? range.from : bounds.from,
        to: bounds.to > range.to ? range.to : bounds.to,
        cases: group.length,
        high_risk: group.filter((row) => row.band === 'high').length,
        avg_score: average(group),
        projected_exposure_usd: group.reduce((sum, row) => sum + row.exposure, 0),
        stop_sign_flags: group.filter((row) => row.stop_sign).length,
      };
    });

  const flags = rows.filter((row) => row.stop_sign).sort((a, b) => b.score - a.score);

  return {
    ok: true,
    synthetic: true,
    demo_label: 'Demo, synthetic data',
    live: true,
    banner: VHG_BANNER,
    updated_at: new Date(now).toISOString(),
    live_count: liveCaseCount(now),
    client,
    grain: options.grain,
    from: range.from,
    to: range.to,
    ledger_start: LEDGER_START,
    ledger_end: LEDGER_END,
    totals: {
      cases_reviewed: rows.length,
      high_vhg_risk_count: rows.filter((row) => row.band === 'high').length,
      avg_likely_idr_contested_score: average(rows),
      projected_idr_exposure_usd: rows.reduce((sum, row) => sum + row.exposure, 0),
      stop_sign_flags: flags.length,
    },
    buckets: bucketList,
    by_service_line: sliceBy(rows, (row) => row.row.service_line),
    by_state: sliceBy(rows, (row) => row.row.state),
    stop_sign: flags.slice(0, 12).map((row) => ({
      case_token: row.row.case_token,
      case_number: row.row.case_number,
      service_date: row.row.service_date,
      service_month: row.row.service_month,
      service_line: row.row.service_line,
      state: row.row.state,
      score: row.score,
      band: row.band,
      top_driver: row.top_driver,
      projected_exposure_usd: row.exposure,
      stop_sign: row.stop_sign,
    })),
    stop_sign_total: flags.length,
    exposure_note: 'Sum of synthetic (billed − QPA) on high-band cases only. Not an actuarial reserve.',
  };
}
