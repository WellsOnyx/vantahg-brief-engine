/**
 * VantaQual — VantaUM's own clinical qualifications engine.
 *
 * Working name (Jonah, 2026-06-16; placeholder but kept). This is the
 * branded product surface over our criteria engine — the in-house answer
 * to InterQual/MCG that VantaUM owns end to end.
 *
 * Layering (Make-it-real Block 2):
 *   lib/medical-criteria.ts   — the criteria CONTENT (per-code indications)
 *   lib/criteria/library.ts   — versioned sets + the CriteriaSource contract
 *   lib/vantaqual/ (here)      — the named product: identity, coverage
 *                               honesty, and a single import surface
 *   lib/medical-qualifications/ — Cole's citation-enforced RAG, drops in
 *                               behind the same CriteriaSource later (V2)
 *
 * Why a thin product layer instead of renaming the lib: callers depend on
 * lib/criteria/library.ts today. VantaQual gives us ONE place to evolve
 * the product (versioning, coverage reporting, the RAG swap) without a
 * breaking rename, and one import the rest of the app reaches for.
 */

import {
  getCriteriaSet,
  findCriteriaSetForCodes,
  assessFromBrief,
  staticCriteriaSource,
  CRITERIA_LIBRARY_VERSION,
  type VantaCriteriaSet,
  type CriteriaAssessment,
  type CriteriaVerdict,
  type CriteriaSource,
} from '@/lib/criteria/library';
import { medicalCriteria } from '@/lib/medical-criteria';

/** Public product name. Placeholder per Jonah — central so a rename is one edit. */
export const VANTAQUAL_NAME = 'VantaQual' as const;
export const VANTAQUAL_VERSION = CRITERIA_LIBRARY_VERSION;

/** Re-export the engine surface under the product so callers can import one place. */
export {
  getCriteriaSet,
  findCriteriaSetForCodes,
  assessFromBrief,
  staticCriteriaSource as vantaQualSource,
};
export type { VantaCriteriaSet, CriteriaAssessment, CriteriaVerdict, CriteriaSource };

/**
 * Which backend is serving qualifications. Static today; flips to 'rag'
 * when Cole's medical-qualifications RAG is wired behind the same contract.
 */
export type VantaQualBackend = 'static_library' | 'rag';

export function activeBackend(): VantaQualBackend {
  // The RAG isn't wired into the request path yet; this is the honest answer.
  return 'static_library';
}

export interface VantaQualProductInfo {
  name: typeof VANTAQUAL_NAME;
  version: number;
  backend: VantaQualBackend;
  /** How many CPT/HCPCS codes the library governs today. */
  governed_code_count: number;
}

export function vantaQualInfo(): VantaQualProductInfo {
  return {
    name: VANTAQUAL_NAME,
    version: VANTAQUAL_VERSION,
    backend: activeBackend(),
    governed_code_count: Object.keys(medicalCriteria).length,
  };
}

/**
 * Coverage honesty: for a set of procedure codes, which does VantaQual
 * actually govern vs. fall back on? No silent gaps — a code we don't
 * govern is reported, so a determination never quietly rests on "we had
 * nothing for this code."
 */
export interface CoverageReport {
  governed: string[];
  ungoverned: string[];
  fully_covered: boolean;
}

export function coverageFor(codes: readonly string[]): CoverageReport {
  const governed: string[] = [];
  const ungoverned: string[] = [];
  for (const code of codes) {
    if (getCriteriaSet(code)) governed.push(code);
    else ungoverned.push(code);
  }
  return { governed, ungoverned, fully_covered: ungoverned.length === 0 && codes.length > 0 };
}
