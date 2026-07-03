/**
 * Surfaces the labor metric for a case via the audit layer + persists the
 * per-case cockpit field. Kept separate from the pure canonical module
 * (lib/labor-metric.ts) so the synthetic harness never pulls in audit/supabase.
 *
 * Flag-gated: ENABLE_LABOR_METRIC (default off). Wired into case-create (after
 * the brief) and the determination path. PHI-safe — only stream, weights,
 * percentages and booleans are logged; never clinical content.
 */
import { logAuditEvent } from '@/lib/audit';
import {
  computeLaborMetricForCase,
  isConfidenceResolved,
  type LaborMetricResult,
  type BriefDirection,
} from '@/lib/labor-metric';
import { isLaborMetricEnabled } from '@/lib/env';

export { isLaborMetricEnabled };


export interface ConfidenceSignals {
  directional_confidence: number;
  brief_complete: boolean;
  recommendation: BriefDirection | null;
}

export interface CaseLaborMetric {
  labor_metric: LaborMetricResult;
  confidence_resolution: ConfidenceSignals & { resolved: boolean };
}

export interface AttestationEnvelope {
  flags_acknowledged: boolean;
  attested_at: string;
}

/** Minimal case shape this module reads (avoids importing the full Case type). */
interface CaseForMetric {
  id: string;
  case_type?: string | null;
  ai_brief?: unknown;
  fact_check?: unknown;
}

type SupabaseLike = { from: (table: string) => any };

/**
 * Derive the confidence-resolution signals from the engine's brief + fact-check:
 *  - directional_confidence ← fact_check.overall_score (0–100)
 *  - recommendation        ← ai_brief.ai_recommendation.recommendation (approve/deny)
 *  - brief_complete        ← a brief + fact-check exist and did not fail
 */
export function deriveConfidenceSignals(caseRow: CaseForMetric): ConfidenceSignals {
  const brief = caseRow.ai_brief as { ai_recommendation?: { recommendation?: string } } | null | undefined;
  const fc = caseRow.fact_check as { overall_score?: number; overall_status?: string } | null | undefined;

  const directional_confidence = typeof fc?.overall_score === 'number' ? fc.overall_score : 0;
  const brief_complete = !!brief && !!fc && fc.overall_status !== 'fail';
  const rec = brief?.ai_recommendation?.recommendation;
  const recommendation: BriefDirection | null = rec === 'approve' ? 'approve' : rec === 'deny' ? 'deny' : null;

  return { directional_confidence, brief_complete, recommendation };
}

/**
 * Compute the labor metric + confidence-resolution for a case, emit a PHI-safe
 * `labor_metric_computed` audit event, and (best-effort) persist the per-case
 * cockpit fields. Returns the values, or null when the flag is off (callers
 * no-op cleanly). The column write is guarded — it silently no-ops until
 * migration 027 adds cases.labor_metric / cases.confidence_resolution, so it can
 * never break case-create or determination.
 */
export async function recordLaborMetricForCase(
  caseRow: CaseForMetric,
  supabase?: SupabaseLike,
  overrides?: Record<string, number>,
): Promise<CaseLaborMetric | null> {
  if (!isLaborMetricEnabled()) return null;

  const confidence = deriveConfidenceSignals(caseRow);
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

  if (supabase) {
    try {
      await supabase.from('cases').update({ labor_metric, confidence_resolution }).eq('id', caseRow.id);
    } catch {
      /* column may not exist until migration 027 is applied; audit event still carries it */
    }
  }

  return { labor_metric, confidence_resolution };
}

export async function recordAttestationForDetermination(
  caseId: string,
  actor: string,
  attestation: AttestationEnvelope | null,
  supabase?: SupabaseLike,
): Promise<void> {
  if (!attestation) return;

  await logAuditEvent(caseId, 'determination_attested', actor, {
    flags_acknowledged: attestation.flags_acknowledged,
    attested_at: attestation.attested_at,
  }).catch(() => {
    /* audit non-blocking */
  });

  if (supabase) {
    try {
      await supabase.from('cases').update({ attestation }).eq('id', caseId);
    } catch {
      /* column may not exist until 028; audit still has the record */
    }
  }
}

