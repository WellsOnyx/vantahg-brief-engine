/**
 * Inpatient + continued-stay SLA logic for First Mover intake.
 *
 * Per Santana's May 7 ops call:
 *   - Inpatient admission must be NOTIFIED within 24-48 hours of admit.
 *   - The review TAT for inpatient should be 24 hours (patient is in the
 *     hospital — the policy ceiling may still be 15 days, but the
 *     operational target is 24h).
 *   - Continued-stay reviews require updated clinicals every 3 days.
 *     Each cycle has a 24-48h review window.
 *
 * This module provides deadline computation and breach detection for
 * those flows. Keeps the main `lib/sla-calculator.ts` untouched —
 * First Mover is namespaced.
 */

const HOUR_MS = 60 * 60 * 1000;

export interface InpatientNotificationStatus {
  /** True when the admit→notification window (≤48h) is met. */
  within_window: boolean;
  /** Hours from admission to notification (negative if notified before admit). */
  hours_late: number;
  /** When the 48h notification deadline lands (relative to admission). */
  notification_deadline: Date;
}

export function checkInpatientNotificationWindow(
  admission_date: string | Date,
  notification_at: string | Date
): InpatientNotificationStatus {
  const admit = new Date(admission_date);
  const notify = new Date(notification_at);
  const deadline = new Date(admit.getTime() + 48 * HOUR_MS);
  const hours_late = (notify.getTime() - admit.getTime()) / HOUR_MS;
  return {
    within_window: notify.getTime() <= deadline.getTime(),
    hours_late,
    notification_deadline: deadline,
  };
}

export interface InpatientReviewDeadline {
  /** Operational target — Santana's 24h. */
  target_deadline: Date;
  /** Policy ceiling — typically 15 days. */
  ceiling_deadline: Date;
}

export function computeInpatientReviewDeadlines(
  case_opened_at: string | Date
): InpatientReviewDeadline {
  const opened = new Date(case_opened_at);
  return {
    target_deadline: new Date(opened.getTime() + 24 * HOUR_MS),
    ceiling_deadline: new Date(opened.getTime() + 15 * 24 * HOUR_MS),
  };
}

export interface ContinuedStayCycle {
  /** Cycle number (1 = initial admission review, 2 = first continued stay, etc.) */
  cycle: number;
  /** When this cycle's clinicals were submitted. */
  clinicals_received_at: Date;
  /** When the next clinicals must arrive (3 days after this cycle). */
  next_clinicals_due_at: Date;
  /** Operational review TAT (24h) for this cycle. */
  review_target_at: Date;
  /** Outer review window (48h). */
  review_ceiling_at: Date;
}

export function nextContinuedStayCycle(
  previous_clinicals_at: string | Date,
  cycle: number
): ContinuedStayCycle {
  const received = new Date(previous_clinicals_at);
  return {
    cycle,
    clinicals_received_at: received,
    next_clinicals_due_at: new Date(received.getTime() + 3 * 24 * HOUR_MS),
    review_target_at: new Date(received.getTime() + 24 * HOUR_MS),
    review_ceiling_at: new Date(received.getTime() + 48 * HOUR_MS),
  };
}

export function isContinuedStayClinicalsOverdue(
  last_clinicals_at: string | Date,
  now: Date = new Date()
): boolean {
  const last = new Date(last_clinicals_at);
  return now.getTime() > last.getTime() + 3 * 24 * HOUR_MS;
}

/**
 * Standard outpatient/expedited deadlines per Santana's call. Mirrors
 * the values in `lib/sla-calculator.ts` but exposed through the firstmover
 * namespace so the manual MVP doesn't reach across the import boundary.
 */
export const FIRSTMOVER_SLA_HOURS = {
  outpatient_standard: 15 * 24, // 15 calendar days
  outpatient_expedited: 72,     // 72 hours
  inpatient_target: 24,         // operational TAT
  inpatient_ceiling: 15 * 24,   // policy ceiling
  inpatient_notify_window: 48,  // hours after admission
  continued_stay_clinicals: 72, // every 3 days
  continued_stay_review_target: 24,
  continued_stay_review_ceiling: 48,
} as const;
