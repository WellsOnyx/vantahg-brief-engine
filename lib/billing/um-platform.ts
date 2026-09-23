/**
 * Monthly platform line for the two-line card.
 *
 * Lives-in-month is an operator input (client_config or the call).
 * It is not the 500k planning denominator. Platform is $0 only when
 * the caller sets an explicit fat-TPA waiver. Med Review packaging
 * does not waive it.
 */

import type { BillableEvent, BillableEventLedger } from './events';
import { resolvePlatformPmpm, UM_PRICE_CARD } from './um-price-card';
import { upsertPlatformLine } from './um-invoice';

export interface PlatformCensusInput {
  lives_in_month?: number | null;
  employees_in_month?: number | null;
  platform_fee_waived?: boolean | null;
}

export interface ResolvedPlatformCensus {
  livesInMonth: number | null;
  employeesInMonth: number | null;
  waived: boolean;
  pmpm: number;
}

export function periodKeyFromDate(asOf: Date): string {
  const year = asOf.getUTCFullYear();
  const month = String(asOf.getUTCMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

export function resolvePlatformCensus(input: {
  livesInMonth?: number | null;
  employeesInMonth?: number | null;
  waived?: boolean | null;
  pmpm?: number;
  config?: PlatformCensusInput | null;
}): ResolvedPlatformCensus {
  const fromConfig = input.config ?? {};
  const lives = input.livesInMonth ?? fromConfig.lives_in_month ?? null;
  const employees = input.employeesInMonth ?? fromConfig.employees_in_month ?? null;
  const waived = input.waived != null ? input.waived === true : fromConfig.platform_fee_waived === true;
  const pmpm = resolvePlatformPmpm({
    pmpm: input.pmpm,
    waived,
  });
  if (lives != null && (!Number.isFinite(lives) || lives < 0)) {
    throw new Error('lives-in-month must be a non-negative number');
  }
  if (employees != null && (!Number.isFinite(employees) || employees < 0)) {
    throw new Error('employees-in-month must be a non-negative number');
  }
  return {
    livesInMonth: lives,
    employeesInMonth: employees,
    waived,
    pmpm,
  };
}

/**
 * Upsert one um_platform row for the client period.
 * Skips when lives-in-month was not supplied — does not invent a $0 platform.
 */
export async function upsertMonthlyPlatformLine(
  ledger: BillableEventLedger,
  input: {
    clientId: string;
    periodKey: string;
    livesInMonth: number | null;
    pmpm?: number;
    waived?: boolean;
    occurredAt: string;
  },
): Promise<BillableEvent | null> {
  if (input.livesInMonth == null) return null;
  const pmpm = resolvePlatformPmpm({ pmpm: input.pmpm, waived: input.waived });
  if (!input.waived && pmpm === 0) {
    throw new Error('platform PMPM is not $0 unless an explicit fat-TPA waiver is set');
  }
  return upsertPlatformLine(ledger, {
    clientId: input.clientId,
    periodKey: input.periodKey,
    livesInMonth: input.livesInMonth,
    pmpm,
    occurredAt: input.occurredAt,
  });
}

export function defaultPlatformPmpm(): number {
  return UM_PRICE_CARD.platform.defaultPmpm;
}
