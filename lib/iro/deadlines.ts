import { IRO_SOP_TIMERS } from './config/sop-timers';
import type { UracIroBaseline } from './config/urac-baseline';
import type {
  ClockStart,
  DeadlineResult,
  DeadlineSpec,
  DeadlineWinner,
  Receipts,
  StateSettingsVersion,
} from './types';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

export interface ContractDeadline {
  id: string;
  standard: DeadlineSpec | null;
  expedited: DeadlineSpec | null;
}

export type DeadlineCalculation =
  | { ok: true; deadline: DeadlineResult }
  | { ok: false; code: 'state_not_configured' | 'pathway_not_configured' | 'clock_timestamp_missing'; message: string };

function isWeekend(date: Date): boolean {
  const day = date.getUTCDay();
  return day === 0 || day === 6;
}

function ymd(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addDuration(startIso: string, spec: DeadlineSpec, holidays: readonly string[]): string {
  const start = new Date(startIso);
  if (Number.isNaN(start.getTime())) {
    throw new Error('deadline clock timestamp is not a valid date');
  }
  if (spec.unit === 'hours') {
    return new Date(start.getTime() + spec.duration * HOUR_MS).toISOString();
  }
  if (spec.unit === 'calendar_days') {
    return new Date(start.getTime() + spec.duration * DAY_MS).toISOString();
  }
  const holidaySet = new Set(holidays);
  const cursor = new Date(start.getTime());
  let left = spec.duration;
  while (left > 0) {
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    if (isWeekend(cursor) || holidaySet.has(ymd(cursor))) continue;
    left -= 1;
  }
  return cursor.toISOString();
}

export function subtractBusinessDays(startIso: string, days: number, holidays: readonly string[]): string {
  const holidaySet = new Set(holidays);
  const cursor = new Date(startIso);
  let left = days;
  while (left > 0) {
    cursor.setUTCDate(cursor.getUTCDate() - 1);
    if (isWeekend(cursor) || holidaySet.has(ymd(cursor))) continue;
    left -= 1;
  }
  return cursor.toISOString();
}

function clockInstant(receipts: Receipts, clock: ClockStart): string | null {
  if (clock === 'carrier_receipt') return receipts.carrier_receipt_at;
  if (clock === 'state_receipt') return receipts.state_receipt_at;
  return receipts.vanta_receipt_at;
}

function earlier(candidates: { source: 'state' | 'urac' | 'contract'; due_at: string; spec: DeadlineSpec }[]): {
  due_at: string;
  winner: DeadlineWinner;
  applied: DeadlineSpec;
  applied_source: 'state' | 'urac' | 'contract';
} {
  const sorted = [...candidates].sort((a, b) => (a.due_at < b.due_at ? -1 : a.due_at > b.due_at ? 1 : 0));
  const due = sorted[0].due_at;
  const tied = sorted.filter((row) => row.due_at === due);
  if (tied.length > 1) {
    const preferred = tied.find((row) => row.source === 'state') ?? tied[0];
    return { due_at: due, winner: 'tie', applied: preferred.spec, applied_source: preferred.source };
  }
  return { due_at: due, winner: tied[0].source, applied: tied[0].spec, applied_source: tied[0].source };
}

/**
 * Shorter of URAC, the pinned state rule, and an optional contract wins.
 * Missing records are not an input. There is no pause or restart.
 */
export function calculateDeadline(input: {
  receipts: Receipts;
  settings: StateSettingsVersion;
  urac: UracIroBaseline;
  contract?: ContractDeadline | null;
  expedited: boolean;
}): DeadlineCalculation {
  if (!input.settings.go_live) {
    return {
      ok: false,
      code: 'state_not_configured',
      message: `${input.settings.state} is not through the go-live gate.`,
    };
  }
  const stateSpec = input.expedited ? input.settings.expedited : input.settings.standard;
  if (!stateSpec || !input.settings.clock_start) {
    return {
      ok: false,
      code: 'pathway_not_configured',
      message: `${input.settings.state} has no confirmed clock or pathway duration.`,
    };
  }
  const clockStart = input.settings.clock_start;
  const clockAt = clockInstant(input.receipts, clockStart);
  if (!clockAt) {
    return {
      ok: false,
      code: 'clock_timestamp_missing',
      message: `Missing ${clockStart} timestamp.`,
    };
  }

  const holidays = input.settings.holidays;
  const uracSpec = input.expedited ? input.urac.expedited : input.urac.standard;
  const contractSpec = input.contract
    ? input.expedited
      ? input.contract.expedited
      : input.contract.standard
    : null;

  const candidates: { source: 'state' | 'urac' | 'contract'; due_at: string; spec: DeadlineSpec }[] = [
    { source: 'state', due_at: addDuration(clockAt, stateSpec, holidays), spec: stateSpec },
    { source: 'urac', due_at: addDuration(clockAt, uracSpec, holidays), spec: uracSpec },
  ];
  if (contractSpec) {
    candidates.push({
      source: 'contract',
      due_at: addDuration(clockAt, contractSpec, holidays),
      spec: contractSpec,
    });
  }
  const won = earlier(candidates);
  const stateDue = candidates.find((row) => row.source === 'state')?.due_at ?? null;
  const uracDue = candidates.find((row) => row.source === 'urac')!.due_at;
  const contractDue = candidates.find((row) => row.source === 'contract')?.due_at ?? null;

  const reviewer = reviewerDue({
    expedited: input.expedited,
    decisionDue: won.due_at,
    vantaReceipt: input.receipts.vanta_receipt_at,
    holidays,
  });

  return {
    ok: true,
    deadline: {
      due_at: won.due_at,
      clock_start: clockStart,
      clock_start_at: clockAt,
      state_due_at: stateDue,
      urac_due_at: uracDue,
      contract_due_at: contractDue,
      winner: won.winner,
      pinned_settings_id: input.settings.id,
      urac_baseline_id: input.urac.id,
      applied: { ...won.applied },
      applied_source: won.applied_source,
      missing_records_effect: 'none',
      reviewer_due_at: reviewer.reviewer_due_at,
      team_lead_alert: reviewer.team_lead_alert,
    },
  };
}

function reviewerDue(input: {
  expedited: boolean;
  decisionDue: string;
  vantaReceipt: string | null;
  holidays: readonly string[];
}): { reviewer_due_at: string; team_lead_alert: 'pathway_too_short' | null } {
  if (input.expedited) {
    const basis = input.vantaReceipt ?? input.decisionDue;
    const withinWindow = addDuration(
      basis,
      { duration: IRO_SOP_TIMERS.reviewer_expedited_hours_from_receipt, unit: 'hours' },
      input.holidays,
    );
    if (withinWindow > input.decisionDue) {
      return { reviewer_due_at: input.decisionDue, team_lead_alert: 'pathway_too_short' };
    }
    return { reviewer_due_at: withinWindow, team_lead_alert: null };
  }
  const reviewer = subtractBusinessDays(
    input.decisionDue,
    IRO_SOP_TIMERS.reviewer_standard_business_days_before_deadline,
    input.holidays,
  );
  const alert =
    input.vantaReceipt && reviewer < input.vantaReceipt ? 'pathway_too_short' : null;
  return { reviewer_due_at: reviewer, team_lead_alert: alert };
}

/** Missing records never pause or restart a deadline. */
export function deadlineAfterRecordsGap(deadline: DeadlineResult): DeadlineResult {
  return {
    ...deadline,
    missing_records_effect: 'none',
    due_at: deadline.due_at,
    applied: { ...deadline.applied },
  };
}

export function settingsEffectiveAt(
  versions: readonly StateSettingsVersion[],
  state: StateSettingsVersion['state'],
  asOfIso: string,
): StateSettingsVersion | null {
  const matches = versions.filter(
    (row) =>
      row.state === state &&
      row.effective_from <= asOfIso &&
      (row.effective_to === null || row.effective_to > asOfIso),
  );
  matches.sort((a, b) => b.version - a.version);
  return matches[0] ?? null;
}

export function resolvePinnedSettings(
  versions: readonly StateSettingsVersion[],
  pinnedId: string,
): StateSettingsVersion | null {
  return versions.find((row) => row.id === pinnedId) ?? null;
}
