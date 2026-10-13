import { evaluateUmBriefEngineAccess } from '@/lib/entitlements/um-brief-engine';
import { ENTITLED_CLIENT_ID, UNENTITLED_CLIENT_ID } from './catalog';
import { getMedReviewPortfolio, projectedExposureUsd } from './portfolio';
import { scoreVhgCase } from './score';
import type { MedReviewDemoCase, VhgBand, VhgScoreInput } from './types';
import { VHG_BANNER } from './types';

export interface VhgDemoClient {
  client_id: string;
  display_name: string;
  vanta_med_review_contract: boolean;
  med_review_provider: 'vanta' | 'third_party' | 'none';
}

export const VHG_DEMO_CLIENTS: readonly VhgDemoClient[] = [
  {
    client_id: ENTITLED_CLIENT_ID,
    display_name: 'Northwind Synthetic Benefits',
    vanta_med_review_contract: true,
    med_review_provider: 'vanta',
  },
  {
    client_id: UNENTITLED_CLIENT_ID,
    display_name: 'Harbor Synthetic Benefits',
    vanta_med_review_contract: false,
    med_review_provider: 'third_party',
  },
];

export const STOPLOSS_DASHBOARD_ROLES = ['stoploss_partner', 'admin', 'ceo'] as const;

export function canViewStoplossDashboard(role: string | null | undefined): boolean {
  return (STOPLOSS_DASHBOARD_ROLES as readonly string[]).includes(role ?? '');
}

export interface StopSignRow {
  case_token: string;
  case_number: string;
  service_month: string;
  service_line: string;
  state: string;
  facility_type: string;
  encounter: string;
  network_status: string;
  cpt: string;
  score: number;
  band: VhgBand;
  top_driver: string;
  projected_exposure_usd: number;
}

export interface ExposureSlice {
  key: string;
  cases: number;
  high_risk: number;
  projected_exposure_usd: number;
}

export interface TrendPoint {
  month: string;
  cases_reviewed: number;
  high_risk: number;
  projected_exposure_usd: number;
}

export interface StoplossDashboardOk {
  ok: true;
  banner: typeof VHG_BANNER;
  role: 'stoploss_partner';
  client: VhgDemoClient;
  totals: {
    cases_reviewed: number;
    high_vhg_risk_count: number;
    projected_idr_exposure_usd: number;
  };
  by_service_line: ExposureSlice[];
  by_state: ExposureSlice[];
  trend: TrendPoint[];
  stop_sign: StopSignRow[];
  stop_sign_total: number;
  exposure_note: string;
  data_note: string;
}

export interface StoplossDashboardDenied {
  ok: false;
  code: 'not_entitled' | 'unknown_client';
  reason: string;
  banner: typeof VHG_BANNER;
  client: VhgDemoClient | null;
}

export type StoplossDashboardResult = StoplossDashboardOk | StoplossDashboardDenied;

function toInput(row: MedReviewDemoCase): VhgScoreInput {
  return {
    network_status: row.network_status,
    specialty: row.specialty,
    cpt: row.cpt,
    service_line: row.service_line,
    billed_amount: row.billed_amount,
    qpa_amount: row.qpa_amount,
    state: row.state,
    facility_type: row.facility_type,
    encounter: row.encounter,
  };
}

function sliceBy(rows: { key: string; high: boolean; exposure: number }[]): ExposureSlice[] {
  const map = new Map<string, ExposureSlice>();
  for (const row of rows) {
    const current = map.get(row.key) ?? { key: row.key, cases: 0, high_risk: 0, projected_exposure_usd: 0 };
    current.cases += 1;
    if (row.high) current.high_risk += 1;
    current.projected_exposure_usd += row.exposure;
    map.set(row.key, current);
  }
  return [...map.values()].sort((a, b) => b.projected_exposure_usd - a.projected_exposure_usd || b.cases - a.cases);
}

export function getStoplossDashboard(clientId: string = ENTITLED_CLIENT_ID): StoplossDashboardResult {
  const client = VHG_DEMO_CLIENTS.find((row) => row.client_id === clientId) ?? null;
  if (!client) {
    return {
      ok: false,
      code: 'unknown_client',
      reason: 'Unknown synthetic client. Stop-loss demo data is limited to the seeded clients.',
      banner: VHG_BANNER,
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
      client,
    };
  }

  const portfolio = getMedReviewPortfolio().filter((row) => row.client_id === client.client_id);
  const scored = portfolio.map((row) => {
    const score = scoreVhgCase(toInput(row));
    const exposure = projectedExposureUsd(row);
    return { row, score, exposure };
  });

  const high = scored.filter((item) => item.score.band === 'high');
  const stopSign = [...high]
    .sort((a, b) => b.score.score - a.score.score)
    .slice(0, 12)
    .map((item) => ({
      case_token: item.row.case_token,
      case_number: item.row.case_number,
      service_month: item.row.service_month,
      service_line: item.row.service_line,
      state: item.row.state,
      facility_type: item.row.facility_type,
      encounter: item.row.encounter,
      network_status: item.row.network_status,
      cpt: item.row.cpt,
      score: item.score.score,
      band: item.score.band,
      top_driver: item.score.drivers[0]?.label ?? 'Baseline',
      projected_exposure_usd: item.exposure,
    }));

  const trendMap = new Map<string, TrendPoint>();
  for (const item of scored) {
    const current = trendMap.get(item.row.service_month) ?? {
      month: item.row.service_month,
      cases_reviewed: 0,
      high_risk: 0,
      projected_exposure_usd: 0,
    };
    current.cases_reviewed += 1;
    if (item.score.band === 'high') current.high_risk += 1;
    current.projected_exposure_usd += item.exposure;
    trendMap.set(item.row.service_month, current);
  }

  return {
    ok: true,
    banner: VHG_BANNER,
    role: 'stoploss_partner',
    client,
    totals: {
      cases_reviewed: scored.length,
      high_vhg_risk_count: high.length,
      projected_idr_exposure_usd: scored.reduce((sum, item) => sum + item.exposure, 0),
    },
    by_service_line: sliceBy(scored.map((item) => ({
      key: item.row.service_line,
      high: item.score.band === 'high',
      exposure: item.exposure,
    }))),
    by_state: sliceBy(scored.map((item) => ({
      key: item.row.state,
      high: item.score.band === 'high',
      exposure: item.exposure,
    }))),
    trend: [...trendMap.values()].sort((a, b) => a.month.localeCompare(b.month)),
    stop_sign: stopSign,
    stop_sign_total: high.length,
    exposure_note: 'Sum of synthetic (billed − QPA) on high-band cases only. Not an actuarial reserve.',
    data_note: 'Aggregated synthetic cases where Vanta performed the med review. De-identified. Demo model, not validated.',
  };
}
