/**
 * Clinician day planner — projects a clinician's personal queue onto
 * the clock and answers the question the queue page can't: "if I work
 * my cases in the right order, do I make every deadline today?"
 *
 * Sibling of lib/delivery/lpn-scoring.ts. The scorer asks "which LPN
 * should get this case?" at assignment time; the planner asks "given
 * the cases I already have, what order do I work them in and where do
 * I land?" at work time. Both treat clinician throughput as strictly
 * serial (worst-case assumption).
 *
 * Ordering is earliest-deadline-first (EDF). For a single serial
 * worker, EDF minimizes maximum lateness — if EDF projects a miss,
 * no other ordering of the same queue avoids it. That makes the
 * feasibility verdict trustworthy, not just a heuristic.
 *
 * Projection math for the k-th case in EDF order (1-based):
 *   projected_finish_hours(k) = k * avg_turnaround
 *   slack_hours(k)            = time_to_deadline(k) - projected_finish_hours(k)
 *   projected_miss(k)         = slack_hours(k) < 0
 *
 * Unlike lpn-scoring (which treats an unknown avg_turnaround as 999h
 * so unknown LPNs rank last), the planner needs a usable schedule for
 * a clinician with no history yet — 999h would project every case as
 * a miss and the verdict would be noise. It assumes
 * DEFAULT_TURNAROUND_HOURS instead and flags the assumption so the UI
 * can say "based on an assumed pace".
 */

export interface PlannerCase {
  id: string;
  turnaround_deadline: string | null;
}

export interface PlannerStaff {
  /** Historical average turnaround in hours. null = no history yet. */
  avg_turnaround_hours: number | null;
  /** Daily capacity from the staff roster. null = no target set. */
  max_cases_per_day: number | null;
}

/** Pace assumed when the clinician has no turnaround history. */
export const DEFAULT_TURNAROUND_HOURS = 1.5;

/** Min slack (hours) on the worst case before the day reads as "tight". */
export const TIGHT_SLACK_THRESHOLD_HOURS = 1;

export type DayFeasibility = 'on_track' | 'tight' | 'at_risk';

export interface PlannedCase<T extends PlannerCase = PlannerCase> {
  case: T;
  /** 1-based position in the recommended work order. */
  position: number;
  projected_finish_hours: number;
  /** ISO timestamp of the projected finish, derived from `now`. */
  projected_finish_at: string;
  /** Hours between deadline and projected finish. null = no deadline. */
  slack_hours: number | null;
  projected_miss: boolean;
}

export interface DayPlan<T extends PlannerCase = PlannerCase> {
  ordered: PlannedCase<T>[];
  feasibility: DayFeasibility;
  projected_misses: number;
  total_projected_hours: number;
  /** Slack on the tightest deadline-bearing case. null = none have deadlines. */
  min_slack_hours: number | null;
  /** The case to pick up next (head of the EDF order). */
  next_case_id: string | null;
  assumed_turnaround: boolean;
  turnaround_hours: number;
  capacity: {
    active_count: number;
    max_cases_per_day: number | null;
    /** active_count / max_cases_per_day, or null when no target set. */
    utilization: number | null;
  };
}

export function buildDayPlan<T extends PlannerCase>(
  cases: readonly T[],
  staff: PlannerStaff,
  now: Date = new Date(),
): DayPlan<T> {
  const assumed_turnaround = staff.avg_turnaround_hours == null;
  const turnaround_hours = staff.avg_turnaround_hours ?? DEFAULT_TURNAROUND_HOURS;

  // EDF: deadline-bearing cases by deadline ascending, deadline-less
  // cases after them in stable input order.
  const ordered = [...cases].sort((a, b) => {
    if (a.turnaround_deadline && b.turnaround_deadline) {
      return (
        new Date(a.turnaround_deadline).getTime() -
        new Date(b.turnaround_deadline).getTime()
      );
    }
    if (a.turnaround_deadline) return -1;
    if (b.turnaround_deadline) return 1;
    return 0;
  });

  let min_slack_hours: number | null = null;
  let projected_misses = 0;

  const planned: PlannedCase<T>[] = ordered.map((c, i) => {
    const position = i + 1;
    const projected_finish_hours = position * turnaround_hours;
    const projected_finish_at = new Date(
      now.getTime() + projected_finish_hours * 60 * 60 * 1000,
    ).toISOString();

    let slack_hours: number | null = null;
    let projected_miss = false;
    if (c.turnaround_deadline) {
      const time_to_deadline_hours =
        (new Date(c.turnaround_deadline).getTime() - now.getTime()) / (60 * 60 * 1000);
      slack_hours = time_to_deadline_hours - projected_finish_hours;
      projected_miss = slack_hours < 0;
      if (projected_miss) projected_misses += 1;
      if (min_slack_hours === null || slack_hours < min_slack_hours) {
        min_slack_hours = slack_hours;
      }
    }

    return { case: c, position, projected_finish_hours, projected_finish_at, slack_hours, projected_miss };
  });

  let feasibility: DayFeasibility = 'on_track';
  if (projected_misses > 0) {
    feasibility = 'at_risk';
  } else if (min_slack_hours !== null && min_slack_hours < TIGHT_SLACK_THRESHOLD_HOURS) {
    feasibility = 'tight';
  }

  return {
    ordered: planned,
    feasibility,
    projected_misses,
    total_projected_hours: planned.length * turnaround_hours,
    min_slack_hours,
    next_case_id: planned[0]?.case.id ?? null,
    assumed_turnaround,
    turnaround_hours,
    capacity: {
      active_count: cases.length,
      max_cases_per_day: staff.max_cases_per_day,
      utilization:
        staff.max_cases_per_day && staff.max_cases_per_day > 0
          ? cases.length / staff.max_cases_per_day
          : null,
    },
  };
}
