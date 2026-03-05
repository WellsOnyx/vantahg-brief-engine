import { getServiceClient } from '@/lib/supabase';
import { logAuditEvent } from '@/lib/audit';
import { isDemoMode, getDemoCase, getDemoMissingInfoRequests } from '@/lib/demo-mode';
import type { MissingInfoRequest } from '@/lib/types';

export interface MissingInfoResult {
  success: boolean;
  requestId?: string;
  reason?: string;
}

/**
 * Request missing info from a provider. Pauses the SLA clock.
 * Per Santana: "If we're missing info, we pend the case and stop the clock."
 */
export async function requestMissingInfo(
  caseId: string,
  requestedBy: string,
  requestedItems: string[],
  sentTo: string,
  sentVia: 'efax' | 'email' | 'portal' | 'phone',
): Promise<MissingInfoResult> {
  if (isDemoMode()) {
    console.log(`[MISSING INFO DEMO] Case ${caseId}: requesting ${requestedItems.length} items via ${sentVia}`);
    return { success: true, requestId: `mir-demo-${Date.now()}` };
  }

  const supabase = getServiceClient();

  // Create the missing info request
  const { data: request, error: insertError } = await supabase
    .from('missing_info_requests')
    .insert({
      case_id: caseId,
      requested_by: requestedBy,
      requested_items: requestedItems,
      sent_to: sentTo,
      sent_via: sentVia,
      status: 'pending',
      deadline: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(), // 14-day deadline
    })
    .select()
    .single();

  if (insertError || !request) {
    return { success: false, reason: insertError?.message || 'Insert failed' };
  }

  // Pause the SLA clock and move to pend_missing_info
  const { error: updateError } = await supabase
    .from('cases')
    .update({
      status: 'pend_missing_info',
      sla_paused_at: new Date().toISOString(),
    })
    .eq('id', caseId);

  if (updateError) {
    return { success: false, reason: updateError.message };
  }

  await logAuditEvent(caseId, 'missing_info_requested', requestedBy, {
    request_id: request.id,
    items: requestedItems,
    sent_to: sentTo,
    sent_via: sentVia,
    sla_paused: true,
  });

  return { success: true, requestId: request.id };
}

/**
 * Mark missing info as received. Resumes the SLA clock.
 * Per Santana: "Once we get the info back, the clock starts again."
 */
export async function receiveMissingInfo(
  caseId: string,
  requestId: string,
  receivedItems: string[],
  resumeToStatus: 'lpn_review' | 'rn_review' | 'md_review' = 'lpn_review',
): Promise<MissingInfoResult> {
  if (isDemoMode()) {
    console.log(`[MISSING INFO DEMO] Case ${caseId}: received ${receivedItems.length} items, resuming to ${resumeToStatus}`);
    return { success: true };
  }

  const supabase = getServiceClient();

  // Update the missing info request
  const { error: requestError } = await supabase
    .from('missing_info_requests')
    .update({
      received_at: new Date().toISOString(),
      received_items: receivedItems,
      status: 'received',
    })
    .eq('id', requestId);

  if (requestError) {
    return { success: false, reason: requestError.message };
  }

  // Get the case to calculate pause duration
  const { data: caseData } = await supabase
    .from('cases')
    .select('sla_paused_at, sla_pause_total_hours')
    .eq('id', caseId)
    .single();

  let pauseHours = 0;
  if (caseData?.sla_paused_at) {
    const pausedAt = new Date(caseData.sla_paused_at);
    const now = new Date();
    pauseHours = (now.getTime() - pausedAt.getTime()) / (1000 * 60 * 60);
  }

  const totalPauseHours = (caseData?.sla_pause_total_hours || 0) + pauseHours;

  // Resume clock and return to previous status
  const { error: updateError } = await supabase
    .from('cases')
    .update({
      status: resumeToStatus,
      sla_resumed_at: new Date().toISOString(),
      sla_pause_total_hours: totalPauseHours,
    })
    .eq('id', caseId);

  if (updateError) {
    return { success: false, reason: updateError.message };
  }

  await logAuditEvent(caseId, 'missing_info_received', 'system', {
    request_id: requestId,
    received_items: receivedItems,
    pause_hours: pauseHours,
    total_pause_hours: totalPauseHours,
    resumed_to: resumeToStatus,
  });

  return { success: true };
}

/**
 * Auto-detect missing info from the AI brief's documentation_review section.
 */
export function autoDetectMissingInfo(caseData: { ai_brief?: { documentation_review?: { missing_documentation?: string[] } } | null }): string[] {
  return caseData?.ai_brief?.documentation_review?.missing_documentation ?? [];
}

/**
 * Get missing info requests for a case.
 */
export async function getMissingInfoRequests(caseId: string): Promise<MissingInfoRequest[]> {
  if (isDemoMode()) {
    return getDemoMissingInfoRequests(caseId);
  }

  const supabase = getServiceClient();
  const { data } = await supabase
    .from('missing_info_requests')
    .select('*')
    .eq('case_id', caseId)
    .order('created_at', { ascending: false });

  return data ?? [];
}
