/**
 * VantaUM Criteria Library — the platform's OWN clinical criteria layer.
 *
 * Locked decision (2026-06-12): VantaUM does NOT license InterQual or MCG.
 * The criteria a determination rests on are ours: versioned, citable
 * against public evidence (specialty society guidelines, CMS coverage
 * determinations, peer-reviewed literature), and customizable per payer.
 *
 * Layering:
 *   lib/medical-criteria.ts      — the criteria CONTENT (per-code clinical
 *                                  indications + denial patterns). Already
 *                                  evidence-based; stays the single source
 *                                  of truth for what the criteria say.
 *   lib/criteria/library.ts      — (this file) identity, versioning, and
 *                                  provenance on top of that content, plus
 *                                  the assessment bridge from AI briefs.
 *   lib/medical-qualifications/  — Cole's citation-enforced RAG ("the
 *                                  in-house InterQual/MCG replacement").
 *                                  In production it serves richer,
 *                                  payer-scoped criteria behind the same
 *                                  CriteriaSource contract defined here.
 *
 * Every set carries provenance 'vantaum_criteria_library' so briefs,
 * determination letters, and audit trails can say exactly whose criteria
 * were applied — and never imply a commercial criteria product was the
 * basis.
 */

import { medicalCriteria, type MedicalCriteria } from '@/lib/medical-criteria';
import type { AIBrief } from '@/lib/types';

export const CRITERIA_PROVENANCE = 'vantaum_criteria_library' as const;

/** Current library version. Bump when criteria content materially changes. */
export const CRITERIA_LIBRARY_VERSION = 1;

export interface VantaCriteriaSet {
  /** Stable citable id, e.g. "VC-72148-v1". Goes in briefs + letters. */
  set_id: string;
  /** CPT / HCPCS code this set governs. */
  code: string;
  version: number;
  name: string;
  category: string;
  /** Clinical indications that support medical necessity. */
  criteria: string[];
  /** Patterns that historically support an adverse determination. */
  common_denial_reasons: string[];
  /** Public evidence the set is built on — society guidelines, CMS, literature. */
  citations: string[];
  provenance: typeof CRITERIA_PROVENANCE;
}

export type CriteriaVerdict = 'met' | 'not_met' | 'partial' | 'insufficient';

export interface CriteriaAssessment {
  /** null when no VantaUM set governs the case's codes (yet). */
  set_id: string | null;
  set_version: number | null;
  /** Human label for the UI, e.g. "VantaUM Criteria VC-72148-v1". */
  guideline_label: string;
  met_count: number;
  not_met_count: number;
  unable_count: number;
  verdict: CriteriaVerdict;
  /** Where the underlying evaluation came from. */
  source: 'brief_engine';
}

/**
 * The contract a production criteria backend fulfills. The static
 * library below implements it synchronously; the Medical Qualifications
 * RAG implements it with retrieval + citation enforcement. Consumers
 * (brief engine, clinician dashboard) depend only on this shape.
 */
export interface CriteriaSource {
  getCriteriaSet(code: string): VantaCriteriaSet | null;
  findCriteriaSetForCodes(codes: string[]): VantaCriteriaSet | null;
}

function toVantaSet(code: string, entry: MedicalCriteria): VantaCriteriaSet {
  return {
    set_id: `VC-${code}-v${CRITERIA_LIBRARY_VERSION}`,
    code,
    version: CRITERIA_LIBRARY_VERSION,
    name: entry.name,
    category: entry.category,
    criteria: entry.typical_criteria,
    common_denial_reasons: entry.common_denial_reasons,
    citations: entry.guideline_references,
    provenance: CRITERIA_PROVENANCE,
  };
}

export function getCriteriaSet(code: string): VantaCriteriaSet | null {
  const trimmed = code.trim().toUpperCase();
  const entry = medicalCriteria[trimmed];
  return entry ? toVantaSet(trimmed, entry) : null;
}

/** First governed code wins — cases list the primary procedure first. */
export function findCriteriaSetForCodes(codes: string[]): VantaCriteriaSet | null {
  for (const code of codes) {
    const set = getCriteriaSet(code);
    if (set) return set;
  }
  return null;
}

/** Default static implementation of the CriteriaSource contract. */
export const staticCriteriaSource: CriteriaSource = {
  getCriteriaSet,
  findCriteriaSetForCodes,
};

/**
 * Bridge an AI brief's criteria_match section into a provenance-stamped
 * assessment. The brief engine already evaluates indications against the
 * criteria reference injected into its prompt; this rolls that up into
 * a verdict the dashboards can chip without re-reading the brief.
 */
export function assessFromBrief(
  procedureCodes: string[],
  brief: Pick<AIBrief, 'criteria_match'> | null,
): CriteriaAssessment | null {
  if (!brief?.criteria_match) return null;

  const set = findCriteriaSetForCodes(procedureCodes);
  const met_count = brief.criteria_match.criteria_met.length;
  const not_met_count = brief.criteria_match.criteria_not_met.length;
  const unable_count = brief.criteria_match.criteria_unable_to_assess.length;

  let verdict: CriteriaVerdict;
  if (met_count === 0 && not_met_count === 0 && unable_count === 0) {
    verdict = 'insufficient';
  } else if (not_met_count > 0) {
    verdict = 'not_met';
  } else if (unable_count > 0) {
    verdict = 'partial';
  } else {
    verdict = 'met';
  }

  return {
    set_id: set?.set_id ?? null,
    set_version: set?.version ?? null,
    guideline_label: set
      ? `VantaUM Criteria ${set.set_id}`
      : 'VantaUM Criteria Library',
    met_count,
    not_met_count,
    unable_count,
    verdict,
    source: 'brief_engine',
  };
}
