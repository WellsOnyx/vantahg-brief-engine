import { getServiceClient } from '@/lib/supabase';
import { logAuditEvent } from '@/lib/audit';
import { getTimeRemaining } from '@/lib/sla-calculator';
import { notifySlaEscalation } from '@/lib/notifications';
import { isDemoMode, getDemoCases } from '@/lib/demo-mode';
import type { UrgencyLevel } from '@/lib/sla-calculator';

export interface EscalationResult {
  checked: number;
  warnings: number;
  critical: number;
  overdue: number;
}

/**
 * Check all active cases for SLA breaches and send escalation notifications.
 * De-duplicates: only sends one notification per case per urgency level per 12h window.
 */
export async function checkAndEscalateSlaBreach(): Promise<EscalationResult> {
  const result: EscalationResult = { checked: 0, warnings: 0, critical: 0, overdue: 0 };

  if (isDemoMode()) {
    const cases = getDemoCases();
    const activeCases = cases.filter(
      (c) => ['brief_ready', 'in_review'].includes(c.status) && c.turnaround_deadline
    );
    result.checked = activeCases.length;

    for (const c of activeCases) {
      const timeRemaining = getTimeRemaining(c.turnaround_deadline!);
      if (timeRemaining.urgencyLevel === 'overdue') result.overdue++;
      else if (timeRemaining.urgencyLevel === 'critical') result.critical++;
      else if (timeRemaining.urgencyLevel === 'warning') result.warnings++;
    }

    console.log(`[SLA CHECK DEMO] Checked ${result.checked} cases: ${result.overdue} overdue, ${result.critical} critical, ${result.warnings} warning`);
    return result;
  }

  const supabase = getServiceClient();

  // Fetch all active cases with deadlines
  const { data: cases, error } = await supabase
    .from('cases')
    .select('id, case_number, turnaround_deadline, status, assigned_reviewer_id')
    .in('status', ['brief_ready', 'in_review'])
    .not('turnaround_deadline', 'is', null);

  if (error || !cases) {
    console.error('SLA check query failed:', error);
    return result;
  }

  result.checked = cases.length;

  // 12-hour de-duplication window
  const twelveHoursAgo = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString();

  for (const c of cases) {
    const timeRemaining = getTimeRemaining(c.turnaround_deadline);
    const level = timeRemaining.urgencyLevel;

    if (level === 'ok' || level === 'caution') continue;

    // Check if we already sent this level of notification in the last 12h
    const auditAction = `sla_${level}`;
    const { count } = await supabase
      .from('audit_log')
      .select('*', { count: 'exact', head: true })
      .eq('case_id', c.id)
      .eq('action', auditAction)
      .gte('created_at', twelveHoursAgo);

    if ((count ?? 0) > 0) continue; // Already notified recently

    // Log and notify
    await logAuditEvent(c.id, auditAction, 'system', {
      urgency_level: level,
      case_number: c.case_number,
      deadline: c.turnaround_deadline,
    });

    if (level === 'warning') {
      result.warnings++;
    } else if (level === 'critical') {
      result.critical++;
      await notifySlaEscalation(c.id, 'critical', c.assigned_reviewer_id).catch(console.error);
    } else if (level === 'overdue') {
      result.overdue++;
      await notifySlaEscalation(c.id, 'overdue', c.assigned_reviewer_id).catch(console.error);
    }
  }

  return result;
}
