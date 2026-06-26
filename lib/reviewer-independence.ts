/**
 * Reviewer independence — the single, fail-closed enforcement of the
 * "a reviewer who touched the original case (or its UM decision) cannot be
 * assigned to its appeal / IRO / external (medical) review" rule.
 *
 * The rule is declared in several places (lib/types.ts:441 appeal field comment,
 * lib/appeal-engine.ts:41 docstring, URAC IRO accreditation requirements) but was
 * NOT enforced in any assignment path on `main`. This module is the central fix:
 * every reviewer-assignment chokepoint calls it.
 *
 * Design:
 *  - getConflictedReviewerIds() derives the exclusion set from case lineage.
 *    Returns an EMPTY set for first-pass cases (no `appeal_of_case_id`), so the
 *    ~90% first-pass UM path is unchanged (no regression).
 *  - filterIndependentReviewers() removes conflicted candidates from an auto pool.
 *  - assertReviewerIndependent() is the bypass-proof gate: it throws on a
 *    conflicted reviewer, and is called before any WRITE that sets a reviewer
 *    (including manual hand-assignment), so the rule can't be routed around.
 *
 * Fail-closed: callers that end up with an empty independent pool must REFUSE
 * to assign (leave the case for manual escalation) rather than fall back to a
 * conflicted reviewer.
 *
 * The lineage data is loaded through an injected `LineageLoader` so this module
 * has no hard dependency on Supabase or demo data — each chokepoint passes the
 * loader appropriate to its mode, and tests pass a fake loader.
 */

/** The slice of a case row needed to detect a re-review and find its origin. */
export interface CaseForIndependence {
  id: string;
  appeal_of_case_id?: string | null;
}

/** The original-case fields whose owners must be excluded from the re-review. */
export interface OriginalCaseTouchpoints {
  assigned_reviewer_id?: string | null;
  determined_by?: string | null;
  assigned_rn_id?: string | null;
  assigned_lpn_id?: string | null;
}

export interface LineageLoader {
  /** Load the original case's reviewer/decider touchpoints, or null if not found. */
  loadCaseTouchpoints(caseId: string): Promise<OriginalCaseTouchpoints | null>;
  /** The denying reviewer recorded on the appeals row for this original case, if any. */
  loadOriginalDenyingReviewerId(originalCaseId: string): Promise<string | null>;
}

export class ReviewerIndependenceError extends Error {
  readonly code = 'reviewer_independence_violation';
  constructor(
    readonly reviewerId: string,
    readonly caseId: string,
  ) {
    super(
      `Reviewer ${reviewerId} is not independent of case ${caseId} ` +
        `(they touched the original determination) and cannot be assigned to its review.`,
    );
    this.name = 'ReviewerIndependenceError';
  }
}

/**
 * Derive the set of reviewer/staff IDs that must NOT review this case because
 * they touched the original determination it is reviewing.
 *
 * Empty set for first-pass cases (no `appeal_of_case_id`) → no behavior change
 * for the ~90% first-pass UM path.
 */
export async function getConflictedReviewerIds(
  caseRow: CaseForIndependence,
  loader: LineageLoader,
): Promise<Set<string>> {
  const conflicted = new Set<string>();

  const originalCaseId = caseRow?.appeal_of_case_id;
  if (!originalCaseId) {
    // First-pass case: there is no prior determination, so nobody is conflicted.
    return conflicted;
  }

  const original = await loader.loadCaseTouchpoints(originalCaseId);
  if (original) {
    for (const id of [
      original.assigned_reviewer_id,
      original.determined_by,
      original.assigned_rn_id,
      original.assigned_lpn_id,
    ]) {
      if (id) conflicted.add(id);
    }
  }

  const denier = await loader.loadOriginalDenyingReviewerId(originalCaseId);
  if (denier) conflicted.add(denier);

  conflicted.delete(''); // never treat empty-string as a real id
  return conflicted;
}

/**
 * Remove conflicted candidates from an auto-assignment pool.
 * Returns the original array (same reference is fine) when there are no
 * conflicts, so first-pass cases pay no cost.
 */
export async function filterIndependentReviewers<T extends { id: string }>(
  caseRow: CaseForIndependence,
  candidates: T[],
  loader: LineageLoader,
): Promise<T[]> {
  const conflicted = await getConflictedReviewerIds(caseRow, loader);
  if (conflicted.size === 0) return candidates;
  return candidates.filter((c) => !conflicted.has(c.id));
}

/**
 * Bypass-proof gate. Throws {@link ReviewerIndependenceError} if `reviewerId`
 * touched the original determination. Call this before ANY write that sets a
 * reviewer (auto OR manual), so independence cannot be hand-assigned around.
 */
export async function assertReviewerIndependent(
  caseRow: CaseForIndependence,
  reviewerId: string | null | undefined,
  loader: LineageLoader,
): Promise<void> {
  if (!reviewerId) return;
  const conflicted = await getConflictedReviewerIds(caseRow, loader);
  if (conflicted.has(reviewerId)) {
    throw new ReviewerIndependenceError(reviewerId, caseRow.id);
  }
}

// ── Loader factories ────────────────────────────────────────────────────────

/** Minimal shape of the Supabase client this module needs (keeps it untyped-light). */
type SupabaseLike = {
  from: (table: string) => any;
};

/** Live loader backed by Supabase (cases + appeals tables). */
export function supabaseLineageLoader(supabase: SupabaseLike): LineageLoader {
  return {
    async loadCaseTouchpoints(caseId: string) {
      const { data } = await supabase
        .from('cases')
        .select('assigned_reviewer_id, determined_by, assigned_rn_id, assigned_lpn_id')
        .eq('id', caseId)
        .single();
      return (data as OriginalCaseTouchpoints) ?? null;
    },
    async loadOriginalDenyingReviewerId(originalCaseId: string) {
      const { data } = await supabase
        .from('appeals')
        .select('original_denying_reviewer_id')
        .eq('original_case_id', originalCaseId)
        .maybeSingle();
      return (data?.original_denying_reviewer_id as string) ?? null;
    },
  };
}

/**
 * Demo loader backed by the in-memory demo cases. Prod currently boots in demo
 * mode (see STATE.md), so independence MUST be enforced here too. There is no
 * demo `appeals` table, so the denying reviewer is derived from the original
 * case's touchpoints alone.
 */
export function demoLineageLoader(
  getDemoCase: (id: string) => OriginalCaseTouchpoints | null | undefined,
): LineageLoader {
  return {
    async loadCaseTouchpoints(caseId: string) {
      const c = getDemoCase(caseId);
      return c ? (c as OriginalCaseTouchpoints) : null;
    },
    async loadOriginalDenyingReviewerId() {
      return null;
    },
  };
}
