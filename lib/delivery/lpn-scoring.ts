/**
 * SLA-aware LPN scoring for pod assignment.
 *
 * Old behavior in lib/pod-assignment-engine.ts sorted LPNs by
 *   (activeCount asc, avg_turnaround_hours asc)
 *
 * That under-weights speed when a case is approaching its deadline.
 * Example: a case due in 2 hours assigned to the "least loaded" LPN
 * whose average turnaround is 4 hours will miss SLA — even if a
 * slightly-loaded LPN with a 90-minute turnaround was available.
 *
 * The new scorer turns the question on its head: pick the LPN MOST
 * LIKELY to complete this specific case before its deadline,
 * lightly penalized by current load as a tiebreaker.
 *
 *   slack_hours = time_to_deadline - expected_completion
 *   expected_completion = activeCount * avg_turnaround + avg_turnaround
 *                       = (activeCount + 1) * avg_turnaround
 *
 * (The +1 accounts for the case we're about to assign — the LPN has
 * to clear their queue first, then do this one. Treats LPN throughput
 * as strictly serial which is the worst-case assumption.)
 *
 *   score = slack_hours - LOAD_PENALTY_WEIGHT * activeCount
 *
 * Higher score = better fit. The LOAD_PENALTY_WEIGHT is small (0.1)
 * so SLA pressure dominates when deadlines are tight, but the
 * tiebreaker still favors lower load when slack is similar.
 *
 * When a case has no turnaround_deadline (rare — happens for cases
 * created without an SLA contract), the scorer falls back to the
 * legacy behavior: negative-load-and-turnaround combined.
 */

export interface ScoringLpn {
  /** Unique id — used by tests + audit only, scorer doesn't read it. */
  id: string;
  /** Active cases on this LPN's plate right now. */
  activeCount: number;
  /** Historical average turnaround in hours. null = treated as 999. */
  avg_turnaround_hours: number | null;
}

export interface ScoringCase {
  /** ISO timestamp of the case's SLA deadline. null = no SLA pressure. */
  turnaround_deadline: string | null;
}

/** How much the scorer penalizes each active case on top of slack. */
export const LOAD_PENALTY_WEIGHT = 0.1;

/** Fallback used in legacy ordering when avg_turnaround_hours is null. */
const UNKNOWN_TURNAROUND = 999;

export interface ScoreResult {
  /** Composite score — higher is better. */
  score: number;
  /** Hours of slack vs the SLA deadline, or null if the case has no deadline. */
  slack_hours: number | null;
  /** Expected hours from now until this LPN finishes the case. */
  expected_completion_hours: number;
}

export function scoreLpnForCase(
  lpn: ScoringLpn,
  caseData: ScoringCase,
  now: Date = new Date(),
): ScoreResult {
  const avgTurnaround = lpn.avg_turnaround_hours ?? UNKNOWN_TURNAROUND;
  const expected_completion_hours = (lpn.activeCount + 1) * avgTurnaround;

  if (!caseData.turnaround_deadline) {
    // Legacy fallback: lower load + lower turnaround wins. Combine
    // both into a negative score so the comparator math stays the
    // same (higher = better). Equivalent to the prior sort.
    const legacy = -(lpn.activeCount * 1000 + avgTurnaround);
    return {
      score: legacy,
      slack_hours: null,
      expected_completion_hours,
    };
  }

  const deadline = new Date(caseData.turnaround_deadline);
  const time_to_deadline_hours = (deadline.getTime() - now.getTime()) / (60 * 60 * 1000);
  const slack_hours = time_to_deadline_hours - expected_completion_hours;
  const score = slack_hours - LOAD_PENALTY_WEIGHT * lpn.activeCount;

  return { score, slack_hours, expected_completion_hours };
}

/**
 * Pick the LPN with the highest score for a given case. Returns null
 * if the input list is empty.
 *
 * Tiebreakers: when two LPNs have the same score (rare but happens
 * with synthetic data + integer turnarounds), prefer lower activeCount
 * first, then lower avg_turnaround_hours. Falls back to stable order
 * (first-supplied wins) if everything is identical.
 */
export function pickLpnByScore<T extends ScoringLpn>(
  lpns: readonly T[],
  caseData: ScoringCase,
  now: Date = new Date(),
): T | null {
  if (lpns.length === 0) return null;
  let best: { lpn: T; score: ScoreResult } | null = null;
  for (const lpn of lpns) {
    const result = scoreLpnForCase(lpn, caseData, now);
    if (best === null || result.score > best.score.score) {
      best = { lpn, score: result };
      continue;
    }
    if (result.score === best.score.score) {
      // Same score — prefer lower load, then lower turnaround.
      if (
        lpn.activeCount < best.lpn.activeCount ||
        (lpn.activeCount === best.lpn.activeCount &&
          (lpn.avg_turnaround_hours ?? UNKNOWN_TURNAROUND) <
            (best.lpn.avg_turnaround_hours ?? UNKNOWN_TURNAROUND))
      ) {
        best = { lpn, score: result };
      }
    }
  }
  return best?.lpn ?? null;
}
