import { getDemoCases, getDemoClients } from '@/lib/demo-mode';
import type { Case } from '@/lib/types';

/**
 * SERVER-ONLY demo derivations over the real demo case layer
 * (lib/demo-data via lib/demo-mode). Split from lib/demo-live.ts because
 * this import chain reaches lib/supabase -> pg, which must never enter a
 * client bundle. Import this only from API routes / server components.
 */

export interface ConciergeQueueRow {
  id: string;
  case_number: string;
  status: string;
  priority: string;
  patient_name: string | null;
  procedure_description: string | null;
  client_name: string | null;
  created_at: string;
  turnaround_deadline: string | null;
  fact_check?: Case['fact_check'];
}

const ACTIVE_STATUSES = new Set([
  'intake', 'processing', 'brief_ready', 'lpn_review', 'rn_review', 'md_review', 'pend_missing_info',
]);

/**
 * Demo concierge queue derived from lib/demo-data cases, so EVERY row's id
 * resolves at /cases/[id] with the full brief / fact-check / audit detail.
 * The CPAP case presents as brief_ready — it is the case getDemoBrief()
 * builds the showcase brief for, i.e. the concierge-validation story.
 */
export function deriveConciergeQueue(): ConciergeQueueRow[] {
  const clientNames = new Map(getDemoClients().map((c) => [c.id, c.name]));
  const rows: ConciergeQueueRow[] = [];
  for (const c of getDemoCases()) {
    const presentedStatus = c.id === 'case-004-cpap-e0601' ? 'brief_ready' : c.status;
    if (!ACTIVE_STATUSES.has(presentedStatus)) continue;
    rows.push({
      id: c.id,
      case_number: c.case_number,
      status: presentedStatus,
      priority: c.priority,
      patient_name: c.patient_name,
      procedure_description: c.procedure_description,
      client_name: (c.client_id && clientNames.get(c.client_id)) || (c.case_number.includes('IDR') ? 'Payer IDR program' : c.case_number.includes('IR') ? 'External review program' : null),
      created_at: c.created_at,
      turnaround_deadline: c.turnaround_deadline,
      fact_check: c.fact_check,
    });
  }
  // SLA urgency first (soonest deadline), then created_at desc.
  rows.sort((a, b) => {
    const da = a.turnaround_deadline ? new Date(a.turnaround_deadline).getTime() : Infinity;
    const db = b.turnaround_deadline ? new Date(b.turnaround_deadline).getTime() : Infinity;
    if (da !== db) return da - db;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });
  return rows;
}

export function conciergeQueueStats(): { in_queue: number; overdue: number } {
  const rows = deriveConciergeQueue();
  const now = Date.now();
  return {
    in_queue: rows.length,
    overdue: rows.filter((r) => r.turnaround_deadline && new Date(r.turnaround_deadline).getTime() < now).length,
  };
}
