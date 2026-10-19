import type { DeadlineSpec } from '../types';

/**
 * URAC IRO v6.0 baseline. Data, not a branch in the calculator.
 * A stricter state or contract deadline wins.
 */
export interface UracIroBaseline {
  id: string;
  citation: string;
  standard: DeadlineSpec;
  expedited: DeadlineSpec;
}

export const URAC_IRO_BASELINE: UracIroBaseline = {
  id: 'urac-iro-v6.0',
  citation: 'URAC IRO v6.0',
  standard: { duration: 45, unit: 'calendar_days' },
  expedited: { duration: 72, unit: 'hours' },
};
