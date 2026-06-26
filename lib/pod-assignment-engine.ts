import { getServiceClient } from '@/lib/supabase';
import { logAuditEvent } from '@/lib/audit';
import { isDemoMode, getDemoCases, getDemoCase, getDemoStaff, getDemoPods } from '@/lib/demo-mode';
import { autoAssignReviewer } from '@/lib/assignment-engine';
import { pickLpnByScore, scoreLpnForCase } from '@/lib/delivery/lpn-scoring';
import type { Case, Staff, Pod, LpnDetermination, RnDetermination } from '@/lib/types';
import { redactName } from '@/lib/security';
import {
  getConflictedReviewerIds,
  supabaseLineageLoader,
  demoLineageLoader,
} from '@/lib/reviewer-independence';

// ============================================================================
// Types
// ============================================================================

export interface PodAssignmentResult {
  assigned: boolean;
  podId?: string;
  podName?: string;
  lpnId?: string;
  lpnName?: string;
  reason?: string;
}

export interface NursingReviewResult {
  success: boolean;
  newStatus?: string;
  reason?: string;
}

// ============================================================================
// Pod Assignment — called when a case enters brief_ready
// ============================================================================

/**
 * Assign a case to a pod and LPN based on service_category and client_id.
 * Picks the pod that handles the case's service category and client,
 * then assigns the LPN with the lowest current load.
 */
export async function assignToPod(caseId: string): Promise<PodAssignmentResult> {
  if (isDemoMode()) {
    return await assignToPodDemo(caseId);
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

  if (caseData.status !== 'brief_ready') {
    return { assigned: false, reason: `Case not eligible (status: ${caseData.status})` };
  }

  const serviceCategory = caseData.service_category || 'other';

  // 2. Find a matching pod
  const { data: pods } = await supabase
    .from('pods')
    .select('*')
    .eq('is_active', true)
    .contains('service_categories', [serviceCategory]);

  if (!pods || pods.length === 0) {
    return { assigned: false, reason: `No active pod for ${serviceCategory}` };
  }

  // Prefer pod that also has the client
  let selectedPod = pods.find((p: Pod) =>
    caseData.client_id && p.client_ids?.includes(caseData.client_id)
  ) || pods[0];

  // 3. Get LPNs in the pod
  const { data: podLpns } = await supabase
    .from('pod_lpns')
    .select('lpn_id')
    .eq('pod_id', selectedPod.id);

  if (!podLpns || podLpns.length === 0) {
    return { assigned: false, reason: 'No LPNs in matching pod' };
  }

  const lpnIds = podLpns.map((pl: { lpn_id: string }) => pl.lpn_id);

  // 4. Find LPN with lowest active caseload
  const { data: lpnStaff } = await supabase
    .from('staff')
    .select('*')
    .in('id', lpnIds)
    .eq('status', 'active');

  if (!lpnStaff || lpnStaff.length === 0) {
    return { assigned: false, reason: 'No active LPNs in pod' };
  }

  // Count active cases per LPN
  const lpnWithLoad: (Staff & { activeCount: number })[] = [];
  for (const lpn of lpnStaff) {
    const { count } = await supabase
      .from('cases')
      .select('*', { count: 'exact', head: true })
      .eq('assigned_lpn_id', lpn.id)
      .in('status', ['lpn_review', 'pend_missing_info']);

    const activeCount = count ?? 0;
    if (lpn.max_cases_per_day === null || activeCount < lpn.max_cases_per_day) {
      lpnWithLoad.push({ ...lpn, activeCount });
    }
  }

  if (lpnWithLoad.length === 0) {
    return { assigned: false, reason: 'All LPNs at capacity' };
  }

  // Reviewer independence (central enforcement — lib/reviewer-independence.ts).
  // A nurse who decided the original case cannot review its appeal/IRO. Empty
  // exclusions for first-pass cases → no change to the ~90% UM path. Fail-closed.
  const conflicted = await getConflictedReviewerIds(caseData as Case, supabaseLineageLoader(supabase));
  const independentLpns = lpnWithLoad.filter((l) => !conflicted.has(l.id));
  const rnConflicted = !!selectedPod.rn_id && conflicted.has(selectedPod.rn_id);
  if (independentLpns.length === 0 || rnConflicted) {
    await logAuditEvent(caseId, 'reviewer_independence_block', 'system', {
      reason: rnConflicted ? 'pod_rn_conflicted' : 'no_independent_lpn',
      pod_id: selectedPod.id,
      appeal_of_case_id: caseData.appeal_of_case_id ?? null,
      lpns_excluded: lpnWithLoad.length - independentLpns.length,
    });
    return { assigned: false, reason: 'no_independent_reviewer' };
  }

  // SLA-aware LPN selection. The legacy sort (load asc, turnaround
  // asc) under-weights speed when a case is approaching its
  // deadline. pickLpnByScore picks the LPN MOST LIKELY to complete
  // the case before its turnaround_deadline, with a light tiebreaker
  // toward lower load. Falls back to the legacy ordering when the
  // case has no SLA deadline. See lib/delivery/lpn-scoring.ts.
  const selectedLpn = pickLpnByScore(independentLpns, caseData);
  if (!selectedLpn) {
    return { assigned: false, reason: 'No scoreable LPN in pod' };
  }
  const selectedScore = scoreLpnForCase(selectedLpn, caseData);

  // 5. Assign to pod and LPN
  const { error: updateError } = await supabase
    .from('cases')
    .update({
      assigned_pod_id: selectedPod.id,
      assigned_lpn_id: selectedLpn.id,
      assigned_rn_id: selectedPod.rn_id,
      status: 'lpn_review',
    })
    .eq('id', caseId);

  if (updateError) {
    return { assigned: false, reason: `Update failed: ${updateError.message}` };
  }

  await logAuditEvent(caseId, 'pod_assigned', 'system', {
    pod_id: selectedPod.id,
    pod_name: selectedPod.name,
    lpn_id: selectedLpn.id,
    lpn_name: selectedLpn.name,
    service_category: serviceCategory,
    // Scoring trail — lets ops investigate why this LPN was picked
    // when reviewing a missed SLA. Tested in lpn-scoring.test.ts.
    sla_score: selectedScore.score,
    sla_slack_hours: selectedScore.slack_hours,
    expected_completion_hours: selectedScore.expected_completion_hours,
  });

  return {
    assigned: true,
    podId: selectedPod.id,
    podName: selectedPod.name,
    lpnId: selectedLpn.id,
    lpnName: selectedLpn.name,
  };
}

// ============================================================================
// LPN Review Submission
// ============================================================================

/**
 * LPN submits their review. Based on their determination:
 * - criteria_met: Case can be approved at nursing level (→ rn_review for oversight)
 * - criteria_not_met: Escalate to RN for further review
 * - unclear: Escalate to RN
 * - escalate_to_rn: Explicit escalation
 */
export async function submitLpnReview(
  caseId: string,
  lpnId: string,
  determination: LpnDetermination,
  notes: string,
): Promise<NursingReviewResult> {
  if (isDemoMode()) {
    console.log(`[LPN REVIEW DEMO] Case ${caseId} → ${determination}`);
    return { success: true, newStatus: 'rn_review' };
  }

  const supabase = getServiceClient();

  const { error } = await supabase
    .from('cases')
    .update({
      lpn_determination: determination,
      lpn_review_notes: notes,
      lpn_review_at: new Date().toISOString(),
      status: 'rn_review', // All LPN outcomes go to RN for oversight (URAC requirement)
    })
    .eq('id', caseId);

  if (error) {
    return { success: false, reason: error.message };
  }

  await logAuditEvent(caseId, 'lpn_review_submitted', lpnId, {
    determination,
    notes_length: notes.length,
  });

  return { success: true, newStatus: 'rn_review' };
}

// ============================================================================
// RN Review Submission
// ============================================================================

/**
 * RN submits their review. Based on their determination:
 * - approve: RN concurs with LPN's criteria_met assessment → determination_made (skips MD)
 * - escalate_to_md: Case needs physician review → md_review
 *
 * This is the key workflow per Santana: 90% of cases resolve here.
 */
export async function submitRnReview(
  caseId: string,
  rnId: string,
  determination: RnDetermination,
  notes: string,
): Promise<NursingReviewResult> {
  if (isDemoMode()) {
    const newStatus = determination === 'approve' ? 'determination_made' : 'md_review';
    console.log(`[RN REVIEW DEMO] Case ${caseId} → ${determination} (${newStatus})`);
    return { success: true, newStatus };
  }

  const supabase = getServiceClient();

  if (determination === 'approve') {
    // RN approves — case is determined without physician (90% of cases)
    const { error } = await supabase
      .from('cases')
      .update({
        rn_determination: determination,
        rn_review_notes: notes,
        rn_review_at: new Date().toISOString(),
        status: 'determination_made',
        determination: 'approve',
        determination_rationale: `Approved at nursing level. LPN criteria assessment confirmed by RN. ${notes}`,
        determination_at: new Date().toISOString(),
        determined_by: rnId,
      })
      .eq('id', caseId);

    if (error) {
      return { success: false, reason: error.message };
    }

    await logAuditEvent(caseId, 'rn_review_submitted', rnId, {
      determination: 'approve',
      resolved_at_nursing_level: true,
    });

    await logAuditEvent(caseId, 'determination_made', rnId, {
      determination: 'approve',
      resolved_at_nursing_level: true,
    });

    return { success: true, newStatus: 'determination_made' };
  } else {
    // Escalate to physician
    const { error } = await supabase
      .from('cases')
      .update({
        rn_determination: determination,
        rn_review_notes: notes,
        rn_review_at: new Date().toISOString(),
        status: 'md_review',
      })
      .eq('id', caseId);

    if (error) {
      return { success: false, reason: error.message };
    }

    await logAuditEvent(caseId, 'rn_review_submitted', rnId, {
      determination: 'escalate_to_md',
      reason: notes,
    });

    // Auto-assign a physician reviewer
    await autoAssignReviewer(caseId).catch(console.error);

    return { success: true, newStatus: 'md_review' };
  }
}

// ============================================================================
// Demo Implementation
// ============================================================================

async function assignToPodDemo(caseId: string): Promise<PodAssignmentResult> {
  const cases = getDemoCases();
  const caseData = cases.find((c) => c.id === caseId);
  if (!caseData) {
    return { assigned: false, reason: 'Case not found (demo)' };
  }

  const pods = getDemoPods();
  const serviceCategory = caseData.service_category || 'other';

  // Find matching pod
  const pod = pods.find((p) =>
    p.is_active && p.service_categories.includes(serviceCategory as any)
  );

  if (!pod) {
    return { assigned: false, reason: `No demo pod for ${serviceCategory}` };
  }

  // Reviewer independence (central enforcement). Demo too — prod runs in demo mode.
  const conflicted = await getConflictedReviewerIds(caseData, demoLineageLoader(getDemoCase));
  const staff = getDemoStaff('lpn');
  const podLpns = staff.filter((s) => pod.lpn_ids.includes(s.id));
  const independentLpns = podLpns.filter((s) => !conflicted.has(s.id));
  const rnConflicted = !!(pod as { rn_id?: string }).rn_id && conflicted.has((pod as { rn_id?: string }).rn_id!);

  if (podLpns.length > 0 && (independentLpns.length === 0 || rnConflicted)) {
    console.log(`[POD ASSIGN DEMO] Pod nurses conflicted for ${caseData.case_number} — refusing (independence)`);
    return { assigned: false, reason: 'no_independent_reviewer' };
  }

  const lpn = independentLpns[0];

  if (!lpn) {
    return { assigned: false, reason: 'No LPN in demo pod' };
  }

  console.log(`[POD ASSIGN DEMO] Case ${caseData.case_number} → ${pod.name} → ${redactName(lpn.name)} (${lpn.id})`);
  return {
    assigned: true,
    podId: pod.id,
    podName: pod.name,
    lpnId: lpn.id,
    lpnName: lpn.name,
  };
}
