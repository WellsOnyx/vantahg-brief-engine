import { getServiceClient } from '@/lib/supabase';
import { logAuditEvent } from '@/lib/audit';
import { isDemoMode, getDemoReviewers, getDemoCase } from '@/lib/demo-mode';
import type { Case, Reviewer } from '@/lib/types';

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
    return autoAssignDemo(caseId);
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

  // 3. Filter by daily capacity
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const eligible: (Reviewer & { dailyCount: number })[] = [];

  for (const reviewer of reviewers) {
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

  if (eligible.length === 0) {
    await logAuditEvent(caseId, 'auto_assign_failed', 'system', {
      reason: 'all_reviewers_at_capacity',
      service_category: serviceCategory,
      reviewers_checked: reviewers.length,
    });
    return { assigned: false, reason: 'All matching reviewers at daily capacity' };
  }

  // 4. Sort by avg_turnaround_hours ASC (fastest first), then cases_completed ASC (spread load)
  eligible.sort((a, b) => {
    const aHours = a.avg_turnaround_hours ?? 999;
    const bHours = b.avg_turnaround_hours ?? 999;
    if (aHours !== bHours) return aHours - bHours;
    return (a.cases_completed ?? 0) - (b.cases_completed ?? 0);
  });

  const selected = eligible[0];

  // 5. Assign the reviewer
  const { error: updateError } = await supabase
    .from('cases')
    .update({
      assigned_reviewer_id: selected.id,
      status: 'in_review',
    })
    .eq('id', caseId);

  if (updateError) {
    return { assigned: false, reason: `Update failed: ${updateError.message}` };
  }

  await logAuditEvent(caseId, 'auto_assigned_reviewer', 'system', {
    reviewer_id: selected.id,
    reviewer_name: selected.name,
    match_reason: 'service_category_match',
    service_category: serviceCategory,
    reviewer_avg_turnaround: selected.avg_turnaround_hours,
    reviewer_daily_count: selected.dailyCount,
  });

  return {
    assigned: true,
    reviewerId: selected.id,
    reviewerName: selected.name,
  };
}

function autoAssignDemo(caseId: string): AssignmentResult {
  const caseData = getDemoCase(caseId);
  if (!caseData) {
    return { assigned: false, reason: 'Case not found (demo)' };
  }

  const reviewers = getDemoReviewers();
  const serviceCategory = caseData.service_category || 'other';

  const match = reviewers.find(
    (r) => r.status === 'active' && r.approved_service_categories?.includes(serviceCategory)
  );

  if (match) {
    console.log(`[AUTO-ASSIGN DEMO] Case ${caseData.case_number} → ${match.name} (${serviceCategory})`);
    return { assigned: true, reviewerId: match.id, reviewerName: match.name };
  }

  console.log(`[AUTO-ASSIGN DEMO] No reviewer for ${serviceCategory}`);
  return { assigned: false, reason: `No demo reviewer for ${serviceCategory}` };
}
