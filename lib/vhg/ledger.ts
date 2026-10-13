import { DEMO_STATES, FACILITIES, SERVICE_LINES } from './catalog';
import { FEATURED } from './portfolio';
import { intBetween, mulberry32, pick } from './rng';
import { scoreVhgCase } from './score';
import { addDays, LEDGER_END, LEDGER_START } from './time-range';
import type { MedReviewDemoCase, VhgBand } from './types';

export const LIVE_EPOCH_MS = Date.UTC(2026, 9, 13, 16, 20, 0);
export const LIVE_INTERVAL_MS = 20_000;
/** Twelve hours of 20s ticks so a same-day demo keeps moving after the epoch. */
export const LIVE_CAP = 2_160;
export const STOP_SIGN_SCORE = 85;

const FEATURED_DATES: Record<string, string> = {
  'vhg-mr-0101': '2026-08-14',
  'vhg-mr-0102': '2026-07-09',
  'vhg-mr-0103': '2026-06-18',
  'vhg-mr-0104': '2026-09-03',
};

export interface LedgerCase extends MedReviewDemoCase {
  service_date: string;
}

export interface ScoredLedgerCase {
  row: LedgerCase;
  score: number;
  band: VhgBand;
  exposure: number;
  top_driver: string;
  stop_sign: boolean;
}

function toInput(row: LedgerCase) {
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

function scoreRow(row: LedgerCase): ScoredLedgerCase {
  const scored = scoreVhgCase(toInput(row));
  const exposure = scored.band === 'high' ? Math.max(0, row.billed_amount - row.qpa_amount) : 0;
  return {
    row,
    score: scored.score,
    band: scored.band,
    exposure,
    top_driver: scored.drivers[0]?.label ?? 'Baseline',
    stop_sign: scored.score >= STOP_SIGN_SCORE,
  };
}

function buildDayCase(date: string, seq: number, rng: () => number): LedgerCase {
  const line = pick(rng, SERVICE_LINES);
  const encounter = rng() < 0.38 ? 'emergency' : 'scheduled';
  const network = rng() < 0.64 ? 'out_of_network' : 'in_network';
  const qpa = intBetween(rng, 350, 9000);
  const ratio = network === 'out_of_network' ? 1.2 + rng() * 6.5 : 0.85 + rng() * 1.2;
  const facility = encounter === 'emergency' && rng() < 0.4 ? 'freestanding_er' : pick(rng, FACILITIES);
  const stamp = date.replaceAll('-', '');
  const n = String(seq).padStart(4, '0');
  return {
    case_token: `vhg-day-${stamp}-${seq}`,
    case_number: `MR-D${stamp.slice(2)}-${seq}`,
    client_id: FEATURED[0].client_id,
    service_month: date.slice(0, 7),
    service_date: date,
    member_token: `TOK-D-${n}`,
    summary: `Synthetic adult member. ${encounter === 'emergency' ? 'Unscheduled' : 'Scheduled'} ${line.service_line.toLowerCase()} encounter on ${date}. Direct identifiers are not in this demo packet.`,
    service_line: line.service_line,
    specialty: line.specialty,
    cpt: pick(rng, line.cpts),
    state: pick(rng, DEMO_STATES),
    facility_type: facility,
    encounter,
    network_status: network,
    billed_amount: Math.round(qpa * ratio),
    qpa_amount: qpa,
  };
}

function buildBase(): LedgerCase[] {
  const rng = mulberry32(20261013);
  const rows: LedgerCase[] = FEATURED.map((row) => ({
    ...row,
    service_date: FEATURED_DATES[row.case_token] ?? `${row.service_month}-15`,
  }));
  for (let date = LEDGER_START; date <= LEDGER_END; date = addDays(date, 1)) {
    const count = intBetween(rng, 1, 3);
    for (let i = 1; i <= count; i += 1) {
      rows.push(buildDayCase(date, i, rng));
    }
  }
  return rows;
}

function liveCase(seq: number): LedgerCase {
  const rng = mulberry32(800_000 + seq);
  const row = buildDayCase(LEDGER_END, seq, rng);
  return {
    ...row,
    case_token: `vhg-live-${seq}`,
    case_number: `MR-LIVE-${String(seq).padStart(3, '0')}`,
    member_token: `TOK-LIVE-${seq}`,
    summary: `Synthetic adult member. Live demo arrival ${seq} on ${LEDGER_END}. Direct identifiers are not in this demo packet.`,
  };
}

let baseCache: LedgerCase[] | null = null;
let scoredBase: ScoredLedgerCase[] | null = null;
const byToken = new Map<string, LedgerCase>();
const liveCache = new Map<number, ScoredLedgerCase[]>();

export function liveCaseCount(now = Date.now()): number {
  if (now < LIVE_EPOCH_MS) return 0;
  return Math.min(LIVE_CAP, Math.floor((now - LIVE_EPOCH_MS) / LIVE_INTERVAL_MS));
}

export function getLedgerCases(): LedgerCase[] {
  if (!baseCache) {
    baseCache = buildBase();
    for (const row of baseCache) byToken.set(row.case_token, row);
  }
  return baseCache;
}

export function getScoredLedger(): ScoredLedgerCase[] {
  if (!scoredBase) scoredBase = getLedgerCases().map(scoreRow);
  return scoredBase;
}

export function getLiveScored(now = Date.now()): ScoredLedgerCase[] {
  const count = liveCaseCount(now);
  const cached = liveCache.get(count);
  if (cached) return cached;
  const previous = count > 0 ? liveCache.get(count - 1) : undefined;
  const rows = previous
    ? [...previous, scoreRow(liveCase(count))]
    : Array.from({ length: count }, (_, index) => scoreRow(liveCase(index + 1)));
  liveCache.set(count, rows);
  return rows;
}

export function getLedgerCase(caseToken: string): LedgerCase | null {
  getLedgerCases();
  const found = byToken.get(caseToken);
  if (found) return found;
  const live = /^vhg-live-(\d+)$/.exec(caseToken);
  if (!live) return null;
  const seq = Number(live[1]);
  if (!Number.isInteger(seq) || seq < 1 || seq > LIVE_CAP) return null;
  return liveCase(seq);
}
