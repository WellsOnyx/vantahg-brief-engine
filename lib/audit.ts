import { getServiceClient } from './supabase';

export async function logAuditEvent(
  caseId: string | null,
  action: string,
  actor: string,
  details?: Record<string, unknown>
) {
  const supabase = getServiceClient();
  const { error } = await supabase.from('audit_log').insert({
    case_id: caseId,
    action,
    actor,
    details: details || null,
  });
  if (error) {
    console.error('Failed to write audit log:', error);
  }
}
