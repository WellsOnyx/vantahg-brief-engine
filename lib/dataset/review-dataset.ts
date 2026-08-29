/**
 * Review training dataset — capture, backfill, and export.
 *
 * Builds a consolidated, HIPAA Safe Harbor de-identified sample for every
 * completed medical review, pairing the review INPUTS (clinical brief,
 * extracted clinical data, codes, clinical question) with the human LABEL
 * (determination + rationale + criteria + tier decisions + the physician's
 * agreement signal). One row per case in `review_training_samples`, upserted
 * so the label always reflects the latest human decision.
 *
 * `captureReviewSample` is called fire-and-forget at each determination-
 * finalization point in the workflow. It must never throw into its caller —
 * a failed capture can never block a clinical determination.
 *
 * All PHI scrubbing happens here / in lib/deident/safe-harbor.ts BEFORE the
 * row is written. The stored `payload` contains only de-identified data.
 */

import { createHmac } from 'crypto';
import { getServiceClient } from '@/lib/supabase';
import { isDemoMode } from '@/lib/demo-mode';
import { logAuditEvent } from '@/lib/audit';
import { getEnv } from '@/lib/env';
import {
  collectIdentifiers,
  deidentifyText,
  deidentifyDeep,
  safeHarborAge,
  yearOf,
  DEIDENT_METHOD,
  DATASET_SCHEMA_VERSION,
  type CaseIdentifiers,
} from '@/lib/deident/safe-harbor';

const TABLE = 'review_training_samples';

// Re-exported so routes have a single import source for the dataset surface.
export { DEIDENT_METHOD, DATASET_SCHEMA_VERSION } from '@/lib/deident/safe-harbor';

/** Statuses / conditions that mean "this review has a human determination." */
const FINALIZED_STATUSES = [
  'determination_made',
  'delivered',
  'attorney_determined',
];

export interface CaptureResult {
  ok: true;
  skipped?: 'demo' | 'no_determination' | 'not_found';
  sample_ref?: string;
  determination?: string | null;
}
export interface CaptureError {
  ok: false;
  code: 'load_failed' | 'build_failed' | 'persist_failed';
  message: string;
}

/** Whether scrubbed free-text narrative is included (default true). */
export function includeFreetext(): boolean {
  return getEnv().REVIEW_DATASET_INCLUDE_FREETEXT;
}

/**
 * Deterministic pseudonym for the export. Salted hash of the case UUID so the
 * exported dataset never carries the real DB key but re-captures map to the
 * same ref. Salt priority: explicit knob → CRON_SECRET → static fallback.
 */
export function sampleRef(caseId: string): string {
  const env = getEnv();
  const salt = env.DATASET_SAMPLE_SALT || env.CRON_SECRET || 'vantaum-review-dataset-v1';
  return 'rs_' + createHmac('sha256', salt).update(caseId).digest('hex').slice(0, 24);
}

/** Determination is polymorphic: text enum (UM) or JSONB blob (payer IDR). */
function normalizeDetermination(determination: unknown): {
  value: string | null;
  rationale: string | null;
  denial_reason: string | null;
  denial_criteria_cited: string | null;
  alternative_recommended: string | null;
  extra: Record<string, unknown> | null;
} {
  if (determination && typeof determination === 'object' && !Array.isArray(determination)) {
    const d = determination as Record<string, unknown>;
    const {
      determination: value,
      rationale,
      denial_reason,
      denial_criteria_cited,
      alternative_recommended,
      ...rest
    } = d;
    return {
      value: typeof value === 'string' ? value : null,
      rationale: typeof rationale === 'string' ? rationale : null,
      denial_reason: typeof denial_reason === 'string' ? denial_reason : null,
      denial_criteria_cited: typeof denial_criteria_cited === 'string' ? denial_criteria_cited : null,
      alternative_recommended:
        typeof alternative_recommended === 'string' ? alternative_recommended : null,
      extra: Object.keys(rest).length ? rest : null,
    };
  }
  return {
    value: typeof determination === 'string' ? determination : null,
    rationale: null,
    denial_reason: null,
    denial_criteria_cited: null,
    alternative_recommended: null,
    extra: null,
  };
}

/** A coded-only projection of the AI brief (no narrative), for structured mode. */
function structuredBrief(brief: Record<string, unknown> | null): Record<string, unknown> | null {
  if (!brief || typeof brief !== 'object') return null;
  const cm = (brief.criteria_match ?? {}) as Record<string, unknown>;
  const pa = (brief.procedure_analysis ?? {}) as Record<string, unknown>;
  const rec = (brief.ai_recommendation ?? {}) as Record<string, unknown>;
  const len = (v: unknown) => (Array.isArray(v) ? v.length : 0);
  return {
    guideline_source: cm.guideline_source ?? null,
    applicable_guideline: cm.applicable_guideline ?? null,
    criteria_met_count: len(cm.criteria_met),
    criteria_not_met_count: len(cm.criteria_not_met),
    criteria_unable_to_assess_count: len(cm.criteria_unable_to_assess),
    complexity_level: pa.complexity_level ?? null,
    ai_recommendation: rec.recommendation ?? null,
    ai_confidence: rec.confidence ?? null,
  };
}

interface AuditRow {
  action: string;
  details: Record<string, unknown> | null;
}

/** Pull the human reasoning that lives in audit details, not case columns. */
function reasoningTrail(events: AuditRow[], ids: CaseIdentifiers): Array<Record<string, unknown>> {
  const KEEP = new Set([
    'determination_made',
    'attorney_determination_made',
    'physician_ai_feedback',
    'concierge_brief_validated',
    'rn_review_submitted',
    'lpn_review_submitted',
  ]);
  const scrub = (v: unknown) => (typeof v === 'string' ? deidentifyText(v, ids) : null);
  return events
    .filter((e) => KEEP.has(e.action))
    .map((e) => {
      const d = e.details ?? {};
      return {
        action: e.action,
        rationale: scrub(d.rationale),
        notes: scrub(d.notes),
        reason: scrub(d.reason),
        ai_risk_notes: scrub(d.ai_risk_notes),
        fact_check_review_notes: scrub(d.fact_check_review_notes),
      };
    })
    // Drop entries where everything scrubbed to null (nothing worth keeping).
    .filter((e) => e.rationale || e.notes || e.reason || e.ai_risk_notes || e.fact_check_review_notes);
}

export interface BuiltSample {
  sample_ref: string;
  case_type: string | null;
  service_category: string | null;
  review_type: string | null;
  source_determination: string | null;
  contains_freetext: boolean;
  payload: Record<string, unknown>;
}

/**
 * Pure assembler: turn a raw case row + its audit events into a de-identified
 * sample. Exported for direct unit testing (no DB, no clock beyond age math).
 */
export function buildReviewSample(
  caseRow: Record<string, unknown>,
  auditEvents: AuditRow[],
  opts: { includeFreetext?: boolean } = {},
): BuiltSample {
  const withText = opts.includeFreetext ?? true;
  const ids = collectIdentifiers(caseRow);
  const scrub = (v: unknown) => (typeof v === 'string' ? deidentifyText(v, ids) : null);

  const det = normalizeDetermination(caseRow.determination);
  const determinedAt = (caseRow.determination_at ?? caseRow.updated_at) as string | null;

  const brief = (caseRow.ai_brief ?? null) as Record<string, unknown> | null;
  const factCheck = (caseRow.fact_check ?? null) as Record<string, unknown> | null;

  const inputs: Record<string, unknown> = {
    case_type: caseRow.case_type ?? 'um',
    service_category: caseRow.service_category ?? null,
    review_type: caseRow.review_type ?? null,
    priority: caseRow.priority ?? null,
    payer_classification: caseRow.payer_classification ?? null,
    plan_type: caseRow.plan_type ?? null,
    two_midnight_applies: caseRow.two_midnight_applies ?? null,
    procedure_codes: caseRow.procedure_codes ?? [],
    diagnosis_codes: caseRow.diagnosis_codes ?? [],
    patient: {
      // Age bucketed (90+ aggregated), sex/gender kept — permitted demographics.
      age: safeHarborAge(caseRow.patient_dob as string | null),
      gender: caseRow.patient_gender ?? null,
    },
    // Brief: full scrubbed narrative when freetext is on, coded summary otherwise.
    ai_brief: withText ? deidentifyDeep(brief, ids) : structuredBrief(brief),
    fact_check_score:
      factCheck && typeof factCheck.overall_score === 'number' ? factCheck.overall_score : null,
  };
  if (withText) {
    inputs.procedure_description = scrub(caseRow.procedure_description);
    inputs.clinical_question = scrub(caseRow.clinical_question);
  }

  const label: Record<string, unknown> = {
    determination: det.value,
    lpn_determination: caseRow.lpn_determination ?? null,
    rn_determination: caseRow.rn_determination ?? null,
    physician_ai_agreement: caseRow.physician_ai_agreement ?? null,
    denial_strength_score: caseRow.denial_strength_score ?? null,
    denial_strength_grade: caseRow.denial_strength_grade ?? null,
    determined_year: yearOf(determinedAt),
  };
  if (withText) {
    // Column rationale (UM) or the rationale nested in the IDR blob, scrubbed.
    label.determination_rationale = scrub(caseRow.determination_rationale) ?? scrub(det.rationale);
    label.denial_reason = scrub(caseRow.denial_reason) ?? scrub(det.denial_reason);
    label.denial_criteria_cited = scrub(caseRow.denial_criteria_cited) ?? scrub(det.denial_criteria_cited);
    label.alternative_recommended = scrub(caseRow.alternative_recommended) ?? scrub(det.alternative_recommended);
    label.physician_ai_feedback_notes = scrub(caseRow.physician_ai_feedback_notes);
    label.tier_notes = {
      lpn: scrub(caseRow.lpn_review_notes),
      rn: scrub(caseRow.rn_review_notes),
      peer_to_peer: scrub(caseRow.peer_to_peer_notes),
      internal: scrub(caseRow.internal_notes),
    };
    label.idr_factors = det.extra ? deidentifyDeep(det.extra, ids) : null;
    label.reasoning_trail = reasoningTrail(auditEvents, ids);
  }

  return {
    sample_ref: sampleRef(caseRow.id as string),
    case_type: (caseRow.case_type as string) ?? 'um',
    service_category: (caseRow.service_category as string) ?? null,
    review_type: (caseRow.review_type as string) ?? null,
    source_determination: det.value,
    contains_freetext: withText,
    payload: {
      inputs,
      label,
      meta: {
        deident_method: DEIDENT_METHOD,
        schema_version: DATASET_SCHEMA_VERSION,
        contains_freetext: withText,
        captured_year: yearOf(new Date().toISOString()),
      },
    },
  };
}

/**
 * Capture (or refresh) the training sample for one case. Idempotent upsert on
 * case_id. Safe to call fire-and-forget — always resolves, never rejects into
 * the caller (internal errors are returned as CaptureError and audit-logged).
 */
export async function captureReviewSample(
  caseId: string,
  options: { actor: string; reason?: string },
): Promise<CaptureResult | CaptureError> {
  if (isDemoMode()) {
    return { ok: true, skipped: 'demo', sample_ref: sampleRef(caseId) };
  }

  try {
    const supabase = getServiceClient();

    const { data: caseRow, error: caseErr } = await supabase
      .from('cases')
      .select('*')
      .eq('id', caseId)
      .single();

    if (caseErr || !caseRow) {
      return { ok: false, code: 'load_failed', message: caseErr?.message ?? 'case not found' };
    }

    // Only capture reviews that actually carry a human determination.
    const hasDetermination =
      !!caseRow.determination ||
      FINALIZED_STATUSES.includes(caseRow.status as string);
    if (!hasDetermination) {
      return { ok: true, skipped: 'no_determination' };
    }

    const { data: auditRows } = await supabase
      .from('audit_log')
      .select('action, details')
      .eq('case_id', caseId);

    let built: BuiltSample;
    try {
      built = buildReviewSample(caseRow, (auditRows as AuditRow[]) ?? [], {
        includeFreetext: includeFreetext(),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { ok: false, code: 'build_failed', message: msg };
    }

    const { error: upsertErr } = await supabase
      .from(TABLE)
      .upsert(
        {
          case_id: caseId,
          sample_ref: built.sample_ref,
          case_type: built.case_type,
          service_category: built.service_category,
          review_type: built.review_type,
          source_determination: built.source_determination,
          payload: built.payload,
          deident_method: DEIDENT_METHOD,
          contains_freetext: built.contains_freetext,
          schema_version: DATASET_SCHEMA_VERSION,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'case_id' },
      );

    if (upsertErr) {
      return { ok: false, code: 'persist_failed', message: upsertErr.message };
    }

    // Audit trail carries NO PHI (sample_ref + determination class only).
    await logAuditEvent(caseId, 'review_sample_captured', options.actor, {
      sample_ref: built.sample_ref,
      determination: built.source_determination,
      contains_freetext: built.contains_freetext,
      deident_method: DEIDENT_METHOD,
      reason: options.reason ?? 'determination_finalized',
    }).catch(() => {});

    return { ok: true, sample_ref: built.sample_ref, determination: built.source_determination };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, code: 'persist_failed', message: msg };
  }
}

/**
 * Fire-and-forget wrapper for use inside route handlers / workflow steps. Never
 * throws; swallows all errors so a capture failure can't affect the request.
 */
export function captureReviewSampleAsync(caseId: string, actor: string, reason?: string): void {
  captureReviewSample(caseId, { actor, reason }).catch(() => {});
}

export interface BackfillResult {
  scanned: number;
  captured: number;
  skipped: number;
  failed: number;
}

/**
 * Sweep finalized cases and (re)capture any that are missing a sample or whose
 * determination is newer than the last capture. Powers the nightly cron so the
 * dataset is self-healing and retroactively covers historical reviews.
 */
export async function backfillReviewDataset(
  options: { limit?: number; actor?: string } = {},
): Promise<BackfillResult> {
  const result: BackfillResult = { scanned: 0, captured: 0, skipped: 0, failed: 0 };
  if (isDemoMode()) return result;

  const limit = options.limit ?? 500;
  const actor = options.actor ?? 'cron:review-dataset';
  const supabase = getServiceClient();

  const { data: cases, error } = await supabase
    .from('cases')
    .select('id')
    .in('status', FINALIZED_STATUSES)
    .order('updated_at', { ascending: false })
    .limit(limit);

  if (error || !cases) return result;

  for (const row of cases as Array<{ id: string }>) {
    result.scanned++;
    const r = await captureReviewSample(row.id, { actor, reason: 'backfill' });
    if (r.ok) {
      if (r.skipped) result.skipped++;
      else result.captured++;
    } else {
      result.failed++;
    }
  }
  return result;
}

export interface ExportRecord {
  sample_ref: string;
  case_type: string | null;
  service_category: string | null;
  review_type: string | null;
  determination: string | null;
  contains_freetext: boolean;
  deident_method: string;
  schema_version: number;
  payload: Record<string, unknown>;
}

/**
 * Project stored samples into export records. Strips `case_id` and every
 * internal timestamp — only the pseudonymous `sample_ref` and de-identified
 * payload leave. Returns records; the route serializes to JSON or JSONL.
 */
export async function exportReviewDataset(
  options: { since?: string; limit?: number } = {},
): Promise<ExportRecord[]> {
  if (isDemoMode()) return [];
  const supabase = getServiceClient();

  let query = supabase
    .from(TABLE)
    .select(
      'sample_ref, case_type, service_category, review_type, source_determination, contains_freetext, deident_method, schema_version, payload',
    )
    .order('created_at', { ascending: true })
    .limit(options.limit ?? 5000);

  if (options.since) {
    query = query.gte('created_at', options.since);
  }

  const { data, error } = await query;
  if (error || !data) return [];

  return (data as Array<Record<string, unknown>>).map((r) => ({
    sample_ref: r.sample_ref as string,
    case_type: (r.case_type as string) ?? null,
    service_category: (r.service_category as string) ?? null,
    review_type: (r.review_type as string) ?? null,
    determination: (r.source_determination as string) ?? null,
    contains_freetext: !!r.contains_freetext,
    deident_method: r.deident_method as string,
    schema_version: r.schema_version as number,
    payload: r.payload as Record<string, unknown>,
  }));
}

export function toJsonl(records: ExportRecord[]): string {
  return records.map((r) => JSON.stringify(r)).join('\n');
}
