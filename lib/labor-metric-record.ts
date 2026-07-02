/**
 * Surfaces the labor metric for a case via the audit layer + returns the values
 * for the per-case cockpit field. Kept separate from the pure canonical module
 * (lib/labor-metric.ts) so the synthetic harness never pulls in audit/supabase.
 *
 * Flag-gated: ENABLE_LABOR_METRIC (default off). PHI-safe — only stream, weights,
 * percentages and booleans are logged; never clinical content.
 */
import { logAuditEvent } from '@/lib/audit';
import {
  computeLaborMetricForCase,
  isConfidenceResolved,
  type LaborMetricResult,
  type BriefDirection,
} from '@/lib/labor-metric';

export function isLaborMetricEnabled(): boolean {
  return process.env.ENABLE_LABOR_METRIC === 'true';
}

export interface ConfidenceSignals {
  directional_confidence: number;
  brief_complete: boolean;
  recommendation: BriefDirection | null;
}

export interface CaseLaborMetric {
  labor_metric: LaborMetricResult;
  confidence_resolution: ConfidenceSignals & { resolved: boolean };
}

/**
 * Compute the labor metric + confidence-resolution for a case and (if enabled)
 * emit a PHI-safe `labor_metric_computed` audit event. Returns the values to
 * persist on the case (cases.labor_metric / cases.confidence_resolution) — or
 * null when the flag is off, so callers no-op cleanly.
 */
export async function recordLaborMetricForCase(
  caseRow: { id: string; case_type?: string | null },
  confidence: ConfidenceSignals,
  overrides?: Record<string, number>,
): Promise<CaseLaborMetric | null> {
  if (!isLaborMetricEnabled()) return null;

  const labor_metric = computeLaborMetricForCase(caseRow, overrides);
  const resolved = isConfidenceResolved(confidence);
  const confidence_resolution = { ...confidence, resolved };

  await logAuditEvent(caseRow.id, 'labor_metric_computed', 'system', {
    stream: labor_metric.stream,
    labor_reduction_pct: labor_metric.labor_reduction_pct,
    human_judgment_pct: labor_metric.human_judgment_pct,
    engine_lu: labor_metric.engine_lu,
    human_lu: labor_metric.human_lu,
    total_lu: labor_metric.total_lu,
    weights_basis: labor_metric.weights_basis,
    directional_confidence: confidence.directional_confidence,
    brief_complete: confidence.brief_complete,
    confidence_resolved: resolved,
  }).catch(() => {
    /* audit is non-blocking */
  });

  return { labor_metric, confidence_resolution };
}
