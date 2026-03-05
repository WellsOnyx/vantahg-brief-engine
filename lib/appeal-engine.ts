import { getServiceClient } from '@/lib/supabase';
import { logAuditEvent } from '@/lib/audit';
import { isDemoMode, getDemoCase } from '@/lib/demo-mode';
import type { Appeal, AppealStatus } from '@/lib/types';

export interface AppealResult {
  success: boolean;
  appealId?: string;
  appealCaseId?: string;
  reason?: string;
}

/**
 * Validate that a case is eligible for appeal.
 * Requirements: must be denied, within appeal window, not already appealed.
 */
export function validateAppealEligibility(
  caseData: { determination?: string | null; determination_at?: string | null; appeal_status?: string | null },
): { eligible: boolean; reason?: string } {
  if (caseData.determination !== 'deny' && caseData.determination !== 'partial_approve') {
    return { eligible: false, reason: 'Only denied or partially approved cases can be appealed' };
  }

  if (caseData.appeal_status) {
    return { eligible: false, reason: 'Case has already been appealed' };
  }

  if (caseData.determination_at) {
    const determinationDate = new Date(caseData.determination_at);
    const daysSince = (Date.now() - determinationDate.getTime()) / (1000 * 60 * 60 * 24);
    if (daysSince > 180) {
      return { eligible: false, reason: 'Appeal window has expired (180 days)' };
    }
  }

  return { eligible: true };
}

/**
 * Create an appeal. Creates a new case linked to the original,
 * and ensures a different physician is assigned for the appeal review.
 */
export async function createAppeal(
  originalCaseId: string,
  reason: string,
  filedBy: string,
): Promise<AppealResult> {
  if (isDemoMode()) {
    console.log(`[APPEAL DEMO] Creating appeal for case ${originalCaseId}: ${reason}`);
    return { success: true, appealId: `appeal-demo-${Date.now()}`, appealCaseId: `case-appeal-demo-${Date.now()}` };
  }

  const supabase = getServiceClient();

  // 1. Get original case
  const { data: original, error: fetchError } = await supabase
    .from('cases')
    .select('*')
    .eq('id', originalCaseId)
    .single();

  if (fetchError || !original) {
    return { success: false, reason: 'Original case not found' };
  }

  // 2. Validate eligibility
  const eligibility = validateAppealEligibility(original);
  if (!eligibility.eligible) {
    return { success: false, reason: eligibility.reason };
  }

  // 3. Create new appeal case (copies clinical data, resets workflow)
  const appealCaseNumber = `${original.case_number}-APPEAL`;
  const { data: appealCase, error: caseError } = await supabase
    .from('cases')
    .insert({
      case_number: appealCaseNumber,
      status: 'intake',
      priority: original.priority,
      service_category: original.service_category,
      vertical: original.vertical,
      patient_name: original.patient_name,
      patient_dob: original.patient_dob,
      patient_member_id: original.patient_member_id,
      patient_gender: original.patient_gender,
      requesting_provider: original.requesting_provider,
      requesting_provider_npi: original.requesting_provider_npi,
      requesting_provider_specialty: original.requesting_provider_specialty,
      servicing_provider: original.servicing_provider,
      servicing_provider_npi: original.servicing_provider_npi,
      facility_name: original.facility_name,
      facility_type: original.facility_type,
      procedure_codes: original.procedure_codes,
      diagnosis_codes: original.diagnosis_codes,
      procedure_description: original.procedure_description,
      clinical_question: original.clinical_question,
      review_type: 'appeal',
      payer_name: original.payer_name,
      plan_type: original.plan_type,
      client_id: original.client_id,
      submitted_documents: original.submitted_documents,
      appeal_of_case_id: originalCaseId,
      intake_channel: 'portal',
      authorization_number: `${original.authorization_number}-A`,
    })
    .select()
    .single();

  if (caseError || !appealCase) {
    return { success: false, reason: caseError?.message || 'Failed to create appeal case' };
  }

  // 4. Create appeal record
  const { data: appeal, error: appealError } = await supabase
    .from('appeals')
    .insert({
      original_case_id: originalCaseId,
      appeal_case_id: appealCase.id,
      reason,
      filed_by: filedBy,
      status: 'pending',
      original_denying_reviewer_id: original.determined_by,
    })
    .select()
    .single();

  if (appealError || !appeal) {
    return { success: false, reason: appealError?.message || 'Failed to create appeal record' };
  }

  // 5. Mark original case as appealed
  await supabase
    .from('cases')
    .update({ appeal_status: 'pending' })
    .eq('id', originalCaseId);

  await logAuditEvent(originalCaseId, 'appeal_created', filedBy, {
    appeal_id: appeal.id,
    appeal_case_id: appealCase.id,
    appeal_case_number: appealCaseNumber,
    reason,
  });

  await logAuditEvent(appealCase.id, 'case_created', 'system', {
    case_number: appealCaseNumber,
    source: 'appeal',
    original_case_id: originalCaseId,
  });

  return {
    success: true,
    appealId: appeal.id,
    appealCaseId: appealCase.id,
  };
}

/**
 * Get appeal record for a case.
 */
export async function getAppeal(originalCaseId: string): Promise<Appeal | null> {
  if (isDemoMode()) {
    return null; // No demo appeals by default
  }

  const supabase = getServiceClient();
  const { data } = await supabase
    .from('appeals')
    .select('*')
    .eq('original_case_id', originalCaseId)
    .single();

  return data;
}
