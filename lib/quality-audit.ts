import { getServiceClient } from '@/lib/supabase';
import { logAuditEvent } from '@/lib/audit';
import { isDemoMode, getDemoQualityAudits, getDemoCases } from '@/lib/demo-mode';
import type { QualityAudit } from '@/lib/types';

export interface AuditResult {
  success: boolean;
  auditId?: string;
  reason?: string;
}

export interface AuditMetrics {
  totalAudits: number;
  averageScore: number;
  slaComplianceRate: number;
  determinationAccuracyRate: number;
  staffScores: { staffId: string; staffName: string; avgScore: number; auditCount: number }[];
}

/**
 * Create a new quality audit for a case.
 * Per Santana: "RNs pull a random sample of LPN work for URAC compliance."
 */
export async function createAudit(
  caseId: string,
  auditorId: string,
  auditedStaffId: string,
): Promise<AuditResult> {
  if (isDemoMode()) {
    console.log(`[QA AUDIT DEMO] Creating audit for case ${caseId} by ${auditorId}`);
    return { success: true, auditId: `qa-demo-${Date.now()}` };
  }

  const supabase = getServiceClient();

  const { data, error } = await supabase
    .from('quality_audits')
    .insert({
      case_id: caseId,
      auditor_id: auditorId,
      audited_staff_id: auditedStaffId,
      status: 'pending',
    })
    .select()
    .single();

  if (error || !data) {
    return { success: false, reason: error?.message || 'Insert failed' };
  }

  await logAuditEvent(caseId, 'quality_audit_created', auditorId, {
    audit_id: data.id,
    audited_staff_id: auditedStaffId,
  });

  return { success: true, auditId: data.id };
}

/**
 * Submit a completed quality audit.
 */
export async function submitAudit(
  auditId: string,
  scores: {
    criteria_accuracy: number;
    documentation_quality: number;
    sla_compliance: boolean;
    determination_appropriate: boolean;
    notes: string;
  },
): Promise<AuditResult> {
  if (isDemoMode()) {
    console.log(`[QA AUDIT DEMO] Submitting audit ${auditId}`);
    return { success: true };
  }

  const supabase = getServiceClient();

  const overallScore = Math.round(
    (scores.criteria_accuracy + scores.documentation_quality) / 2
  );

  const { error } = await supabase
    .from('quality_audits')
    .update({
      ...scores,
      overall_score: overallScore,
      status: 'completed',
    })
    .eq('id', auditId);

  if (error) {
    return { success: false, reason: error.message };
  }

  return { success: true };
}

/**
 * Select random cases for audit from a given LPN's completed work.
 * URAC recommends auditing ~10% of cases.
 */
export async function selectCasesForAudit(
  lpnId: string,
  sampleSize: number = 3,
): Promise<string[]> {
  if (isDemoMode()) {
    const cases = getDemoCases();
    return cases
      .filter((c) => c.assigned_lpn_id === lpnId && c.status === 'determination_made')
      .slice(0, sampleSize)
      .map((c) => c.id);
  }

  const supabase = getServiceClient();

  const { data } = await supabase
    .from('cases')
    .select('id')
    .eq('assigned_lpn_id', lpnId)
    .eq('status', 'determination_made')
    .order('created_at', { ascending: false })
    .limit(sampleSize * 3); // Get extra, then randomly sample

  if (!data || data.length === 0) return [];

  // Random sample
  const shuffled = data.sort(() => Math.random() - 0.5);
  return shuffled.slice(0, sampleSize).map((d) => d.id);
}

/**
 * Get quality audit metrics for a time period.
 */
export async function getAuditMetrics(): Promise<AuditMetrics> {
  if (isDemoMode()) {
    const audits = getDemoQualityAudits();
    const completed = audits.filter((a) => a.status === 'completed');

    if (completed.length === 0) {
      return {
        totalAudits: 0,
        averageScore: 0,
        slaComplianceRate: 0,
        determinationAccuracyRate: 0,
        staffScores: [],
      };
    }

    const avgScore = completed.reduce((sum, a) => sum + a.overall_score, 0) / completed.length;
    const slaRate = completed.filter((a) => a.sla_compliance).length / completed.length;
    const detRate = completed.filter((a) => a.determination_appropriate).length / completed.length;

    // Group by staff
    const staffMap = new Map<string, { scores: number[]; name: string }>();
    for (const a of completed) {
      const existing = staffMap.get(a.audited_staff_id);
      if (existing) {
        existing.scores.push(a.overall_score);
      } else {
        staffMap.set(a.audited_staff_id, { scores: [a.overall_score], name: a.audited_staff_id });
      }
    }

    const staffScores = Array.from(staffMap.entries()).map(([staffId, data]) => ({
      staffId,
      staffName: data.name,
      avgScore: data.scores.reduce((s, v) => s + v, 0) / data.scores.length,
      auditCount: data.scores.length,
    }));

    return {
      totalAudits: completed.length,
      averageScore: Math.round(avgScore),
      slaComplianceRate: Math.round(slaRate * 100),
      determinationAccuracyRate: Math.round(detRate * 100),
      staffScores,
    };
  }

  const supabase = getServiceClient();

  const { data: audits } = await supabase
    .from('quality_audits')
    .select('*')
    .eq('status', 'completed');

  if (!audits || audits.length === 0) {
    return { totalAudits: 0, averageScore: 0, slaComplianceRate: 0, determinationAccuracyRate: 0, staffScores: [] };
  }

  const avgScore = audits.reduce((sum: number, a: QualityAudit) => sum + a.overall_score, 0) / audits.length;
  const slaRate = audits.filter((a: QualityAudit) => a.sla_compliance).length / audits.length;
  const detRate = audits.filter((a: QualityAudit) => a.determination_appropriate).length / audits.length;

  return {
    totalAudits: audits.length,
    averageScore: Math.round(avgScore),
    slaComplianceRate: Math.round(slaRate * 100),
    determinationAccuracyRate: Math.round(detRate * 100),
    staffScores: [],
  };
}
