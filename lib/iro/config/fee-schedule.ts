import type { FeeSchedule } from '../types';

/**
 * PRELIMINARY IRO fee schedule. Not a locked rate card.
 * Amounts live here so a change does not require an application deploy.
 * The calculator accepts the schedule as an argument and does not embed these figures.
 */
export const IRO_FEE_SCHEDULE_V1: FeeSchedule = {
  id: 'iro-fee-2026-10-19-preliminary',
  preliminary: true,
  effective_from: '2026-01-01T00:00:00.000Z',
  effective_to: null,
  approved_by: null,
  change_note: 'Preliminary schedule from the 2026-10-19 build direction. Not confirmed.',
  charges: {
    standard: { code: 'IRO_STD', amount_cents: 100_000 },
    expedited: { code: 'IRO_EXP', amount_cents: 130_000 },
    standard_ei: { code: 'IRO_STD_EI', amount_cents: 125_000 },
    expedited_ei: { code: 'IRO_EXP_EI', amount_cents: 175_000 },
    early_closure: { code: 'IRO_EARLY_CLOSE', amount_cents: 15_000 },
    additional_specialist: { code: 'IRO_ADDL_SPEC', amount_cents: 70_000 },
  },
};

export const IRO_FEE_SCHEDULES: readonly FeeSchedule[] = [IRO_FEE_SCHEDULE_V1];
