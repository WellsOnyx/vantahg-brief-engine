import { getServiceClient } from '@/lib/supabase';
import { logAuditEvent } from '@/lib/audit';
import { isDemoMode, getDemoReviewers, getDemoCase } from '@/lib/demo-mode';
import type { Case, Reviewer } from '@/lib/types';
import { redactName } from '@/lib/security';
import {
  filterIndependentReviewers,
  supabaseLineageLoader,
  demoLineageLoader,
} from '@/lib/reviewer-independence';

export interface AssignmentResult {
  assigned: boolean;
  reviewerId?: string;
  reviewerName?: string;
  reason?: string;
}

/**
 * Auto-assign a reviewer to a case based on service_category match,
 * capacity limits, and turnaround speed.
 * Only operates when status === 'brief_ready' and no reviewer assigned.
 */
export async function autoAssignReviewer(caseId: string): Promise<AssignmentResult> {
  // Demo mode
  if (isDemoMode()) {
    return await autoAssignDemo(caseId);
  }

  const supabase = getServiceClient();

  // 1. Fetch the case
  const { data: caseData, error: caseError } = await supabase
    .from('cases')
    .select('*')
    .eq('id', caseId)
    .single();

  if (caseError || !caseData) {
    return { assigned: false, reason: 'Case not found' };
  }

  // Guard: only auto-assign if brief_ready and no reviewer
  if (caseData.status !== 'brief_ready' || caseData.assigned_reviewer_id) {
    return { assigned: false, reason: `Case not eligible (status: ${caseData.status}, has reviewer: ${!!caseData.assigned_reviewer_id})` };
  }

  const serviceCategory = caseData.service_category;

  // IRO/IRE independence wall enforcement (Phase B)
  // Behind flag. Reviewer who touched original case cannot be assigned to IRO.
  const ENABLE_IRO_STREAM = true; // feature flag - enables IRO as first-class stream
  let originalReviewerId: string | null = null;
  if (ENABLE_IRO_STREAM && (caseData.case_type === 'iro' || caseData.case_type === 'ire') && caseData.appeal_of_case_id) {
    const { data: originalCase } = await supabase
      .from('cases')
      .select('assigned_reviewer_id, determined_by')
      .eq('id', caseData.appeal_of_case_id)
      .single();
    originalReviewerId = originalCase?.assigned_reviewer_id || originalCase?.determined_by || null;
  }

  // 2. Fetch active reviewers whose approved_service_categories contains the case's service_category
  const { data: reviewers, error: reviewerError } = await supabase
    .from('reviewers')
    .select('*')
    .eq('status', 'active')
    .contains('approved_service_categories', [serviceCategory]);

  if (reviewerError || !reviewers || reviewers.length === 0) {
    await logAuditEvent(caseId, 'auto_assign_failed', 'system', {
      reason: 'no_eligible_reviewer',
      service_category: serviceCategory,
    });
    return { assigned: false, reason: `No active reviewers for ${serviceCategory}` };
  }

  // Apply IRO independence wall if applicable
  let filteredReviewers = reviewers;
  if (originalReviewerId) {
    filteredReviewers = reviewers.filter(r => r.id !== originalReviewerId);
  }

  // 3. Filter by daily capacity
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const eligible: (Reviewer & { dailyCount: number })[] = [];

  for (const reviewer of filteredReviewers) {
    const { count } = await supabase
      .from('cases')
      .select('*', { count: 'exact', head: true })
      .eq('assigned_reviewer_id', reviewer.id)
      .gte('created_at', todayStart.toISOString())
      .not('status', 'eq', 'delivered');

    const dailyCount = count ?? 0;

    // null max_cases_per_day means unlimited
    if (reviewer.max_cases_per_day === null || dailyCount < reviewer.max_cases_per_day) {
      eligible.push({ ...reviewer, dailyCount });
    }
  }

  if (originalReviewerId && eligible.length === reviewers.length) {
    // no exclusion happened, but wall was active - log for audit
  }

  if (eligible.length === 0) {
    await logAuditEvent(caseId, 'auto_assign_failed', 'system', {
      reason: 'all_reviewers_at_capacity',
      service_category: serviceCategory,
      reviewers_checked: reviewers.length,
    });
    return { assigned: false, reason: 'All matching reviewers at daily capacity' };
  }

  // 3b. Reviewer independence (central enforcement — lib/reviewer-independence.ts).
  // A reviewer who touched the original case cannot review its appeal/IRO/
  // external review. Empty exclusions for first-pass cases → the ~90% UM path
  // is unchanged. Fail-closed: if no independent reviewer remains, REFUSE.
  const independent = await filterIndependentReviewers(
    caseData as Case,
    eligible,
    supabaseLineageLoader(supabase),
  );
  if (independent.length === 0) {
    await logAuditEvent(caseId, 'reviewer_independence_block', 'system', {
      reason: 'no_independent_reviewer',
      service_category: serviceCategory,
      candidates_excluded: eligible.length,
      appeal_of_case_id: caseData.appeal_of_case_id ?? null,
    });
    return { assigned: false, reason: 'no_independent_reviewer' };
  }

  // 4. Sort by avg_turnaround_hours ASC (fastest first), then cases_completed ASC (spread load)
  independent.sort((a, b) => {
    const aHours = a.avg_turnaround_hours ?? 999;
    const bHours = b.avg_turnaround_hours ?? 999;
    if (aHours !== bHours) return aHours - bHours;
    return (a.cases_completed ?? 0) - (b.cases_completed ?? 0);
  });

  const selected = independent[0];

  // 5. Assign the reviewer
  const { error: updateError } = await supabase
    .from('cases')
    .update({
      assigned_reviewer_id: selected.id,
      status: 'md_review',
    })
    .eq('id', caseId);

  if (updateError) {
    return { assigned: false, reason: `Update failed: ${updateError.message}` };
  }

  if (originalReviewerId) {
    await logAuditEvent(caseId, 'iro_reviewer_assigned', 'system', {
      reviewer_id: selected.id,
      original_reviewer_id: originalReviewerId,
      independence_enforced: true,
      case_type: caseData.case_type,
    });
  }

  await logAuditEvent(caseId, 'auto_assigned_reviewer', 'system', {
    reviewer_id: selected.id,
    reviewer_name: selected.name,
    match_reason: 'service_category_match',
    service_category: serviceCategory,
    reviewer_avg_turnaround: selected.avg_turnaround_hours,
    iro_independence_wall_checked: !!originalReviewerId,
    independence_verified: originalReviewerId ? selected.id !== originalReviewerId : true,
    reviewer_daily_count: selected.dailyCount,
  });

  return {
    assigned: true,
    reviewerId: selected.id,
    reviewerName: selected.name,
  };
}

async function autoAssignDemo(caseId: string): Promise<AssignmentResult> {
  const caseData = getDemoCase(caseId);
  if (!caseData) {
    return { assigned: false, reason: 'Case not found (demo)' };
  }

  const reviewers = getDemoReviewers();
  const serviceCategory = caseData.service_category || 'other';

  const matches = reviewers.filter(
    (r) => r.status === 'active' && r.approved_service_categories?.includes(serviceCategory)
  );

  // Independence applies in demo too — prod currently runs in demo mode.
  // This replaces feature/iro-stream's hardcoded `origReviewer = 'reviewer-001'`
  // wall: IRO/IRE cases carry appeal_of_case_id, so the central module excludes
  // the original reviewer for ALL re-review streams (IRO, appeals, med review).
  const independent = await filterIndependentReviewers(
    caseData,
    matches,
    demoLineageLoader(getDemoCase),
  );

  // Fail-closed: matching reviewers existed but every one is conflicted.
  if (matches.length > 0 && independent.length === 0) {
    console.log(`[AUTO-ASSIGN DEMO] All matching reviewers conflicted for ${caseData.case_number} — refusing (independence)`);
    return { assigned: false, reason: 'no_independent_reviewer' };
  }

  const match = independent[0];
  if (match) {
    console.log(`[AUTO-ASSIGN DEMO] Case ${caseData.case_number} → ${redactName(match.name)} (${match.id}, ${serviceCategory})`);
    return { assigned: true, reviewerId: match.id, reviewerName: match.name };
  }

  console.log(`[AUTO-ASSIGN DEMO] No reviewer for ${serviceCategory}`);
  return { assigned: false, reason: `No demo reviewer for ${serviceCategory}` };
}
