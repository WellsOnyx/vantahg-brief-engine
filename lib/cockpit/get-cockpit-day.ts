/**
 * Cockpit data source. Returns the demo pod day EVERYWHERE by default. Only when
 * ENABLE_LABOR_METRIC is on (MVP calibration env) AND Supabase is configured does
 * it read real cases and their persisted labor_metric / confidence_resolution.
 * Flag off → no DB call at all, pure demo seed.
 */
import { getPodDay, telemetryFrom, type PodDay, type PodCase, type GauntletStop } from './pod-day';
import { isLaborMetricEnabled } from '@/lib/labor-metric-record';
import { computeLaborMetricForCase, isConfidenceResolved, type LaborStream } from '@/lib/labor-metric';

function stopForStatus(status: string): GauntletStop {
  if (['intake', 'processing', 'pend_missing_info'].includes(status)) return 'cx';
  if (status === 'brief_ready') return 'arbiter';
  if (['lpn_review', 'rn_review', 'md_review', 'under_attorney_review'].includes(status)) return 'physician';
  return 'dl_md'; // determination_made / delivered / attorney_determined / closed
}

export async function getCockpitDay(): Promise<PodDay> {
  // Default path: demo seed everywhere except the flagged MVP env.
  if (!isLaborMetricEnabled()) return getPodDay();

  try {
    const { getServiceClient, hasSupabaseConfig } = await import('@/lib/supabase');
    if (!hasSupabaseConfig()) return getPodDay();

    const supabase = getServiceClient();
    const { data, error } = await supabase
      .from('cases')
      .select('id, case_number, patient_name, procedure_description, case_type, status, labor_metric, confidence_resolution')
      .order('created_at', { ascending: false })
      .limit(60);

    if (error || !data || data.length === 0) return getPodDay();

    const cases: PodCase[] = data.map((r: Record<string, any>) => {
      const labor = r.labor_metric ?? computeLaborMetricForCase({ case_type: r.case_type });
      const cr = r.confidence_resolution ?? null;
      const directional_confidence = cr?.directional_confidence ?? 0;
      const brief_complete = cr?.brief_complete ?? false;
      const recommendation = cr?.recommendation ?? null;
      const confidence_resolved =
        cr?.resolved ?? isConfidenceResolved({ directional_confidence, brief_complete, recommendation });
      return {
        id: r.id,
        case_number: r.case_number ?? r.id,
        patient: r.patient_name ?? '—',
        procedure: r.procedure_description ?? '—',
        stream: (labor.stream ?? 'um') as LaborStream,
        stop: stopForStatus(r.status ?? ''),
        directional_confidence,
        brief_complete,
        recommendation,
        missing: [],
        independent: true,
        sla_minutes_remaining: 0,
        labor,
        confidence_resolved,
      };
    });

    return { ...getPodDay(), date_label: 'Pod Day — live (calibration)', cases, telemetry: telemetryFrom(cases) };
  } catch {
    // Any live-read failure falls back to the demo seed — the cockpit never breaks.
    return getPodDay();
  }
}
