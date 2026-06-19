/**
 * Readiness routing — the two-tier "gamified human approval" brain.
 *
 * Locked design (Jonah, 2026-06-15, docs/throughput-architecture-11k.md):
 * at 11k auths/day every case still gets a human approval, but the
 * interaction splits into two lanes so the work stays a delight:
 *
 *   Lane 1  "tap to approve"  (~95%) — AI did the work, the case is
 *           clearly clean, a human gives a 3-5s one-tap blessing.
 *   Lane 2  "needs you"       (~5%)  — anything uncertain gets the full
 *           review UI with required human reasoning.
 *
 * This module is the PURE decision that routes a case into a lane from
 * signals the platform already produces. No invention — it combines:
 *   - fact_check.overall_status / overall_score / human_review_recommended
 *   - ai_recommendation.recommendation / confidence
 *   - VantaUM criteria verdict (lib/criteria/library.ts)
 *
 * Non-negotiable guardrail: a DENIAL never auto-approves. Every adverse
 * determination gets explicit human reasoning — regulatory + ethical.
 *
 * The AUTO bar is intentionally strict and tunable. Start conservative
 * (more cases in review), loosen only as confidence calibration proves
 * out against the load-test's false-confident rate.
 */

import type { AIBrief, FactCheckResult } from '@/lib/types';
import { assessFromBrief, type CriteriaVerdict } from '@/lib/criteria/library';

export type ReadinessLane = 'auto' | 'review';

export interface ReadinessDecision {
  lane: ReadinessLane;
  /** 0-100 composite confidence the case is safe to one-tap. */
  score: number;
  /** PHI-safe reasons. For 'review' lane, why it needs a human. */
  reasons: string[];
  /** Signal breakdown for the dashboard chip + audit trail. */
  signals: {
    fact_check_score: number | null;
    fact_check_status: FactCheckResult['overall_status'] | null;
    human_review_recommended: boolean;
    ai_recommendation: AIBrief['ai_recommendation']['recommendation'] | null;
    ai_confidence: AIBrief['ai_recommendation']['confidence'] | null;
    criteria_verdict: CriteriaVerdict | null;
  };
}

/**
 * Minimum fact-check score for the auto lane. Tunable knob — the single
 * most important dial for the auto/review ratio. Conservative default;
 * raise the auto-pass rate by improving AI quality, not by lowering this.
 */
export const AUTO_FACT_CHECK_THRESHOLD = 90;

/** Recommendations that are eligible to auto-approve. Denials never are. */
const AUTO_ELIGIBLE_RECOMMENDATIONS = new Set(['approve']);

export interface ReadinessInput {
  procedure_codes: string[];
  ai_brief: AIBrief | null;
  fact_check: FactCheckResult | null;
}

export function scoreReadiness(input: ReadinessInput): ReadinessDecision {
  const { procedure_codes, ai_brief, fact_check } = input;
  const reasons: string[] = [];

  const factScore = fact_check?.overall_score ?? null;
  const factStatus = fact_check?.overall_status ?? null;
  const humanFlag = fact_check?.human_review_recommended ?? false;
  const recommendation = ai_brief?.ai_recommendation?.recommendation ?? null;
  const confidence = ai_brief?.ai_recommendation?.confidence ?? null;
  const criteria = assessFromBrief(procedure_codes, ai_brief);
  const verdict = criteria?.verdict ?? null;

  const signals: ReadinessDecision['signals'] = {
    fact_check_score: factScore,
    fact_check_status: factStatus,
    human_review_recommended: humanFlag,
    ai_recommendation: recommendation,
    ai_confidence: confidence,
    criteria_verdict: verdict,
  };

  // No brief yet → not routable; it belongs in review (nothing to tap).
  if (!ai_brief || !fact_check) {
    return {
      lane: 'review',
      score: 0,
      reasons: ['Brief not ready — no AI output to confirm yet'],
      signals,
    };
  }

  // Each failed gate is a concrete, PHI-safe reason the case needs a human.
  if (factStatus !== 'pass') {
    reasons.push(`Fact-check did not fully pass (status: ${factStatus})`);
  }
  if (humanFlag) {
    // Surface the fact-checker's own reasons verbatim (already PHI-safe).
    reasons.push(...(fact_check.review_reasons.length
      ? fact_check.review_reasons
      : ['Fact-checker recommends human review']));
  }
  if (factScore == null || factScore < AUTO_FACT_CHECK_THRESHOLD) {
    reasons.push(`Fact-check score below auto threshold (${factScore ?? 'n/a'} < ${AUTO_FACT_CHECK_THRESHOLD})`);
  }
  if (verdict !== 'met') {
    reasons.push(`VantaUM criteria not fully met (verdict: ${verdict ?? 'unknown'})`);
  }
  if (confidence !== 'high') {
    reasons.push(`AI confidence is ${confidence ?? 'unknown'}, not high`);
  }
  if (recommendation == null || !AUTO_ELIGIBLE_RECOMMENDATIONS.has(recommendation)) {
    // Denials/pends/P2P always get human reasoning — the hard guardrail.
    reasons.push(
      recommendation === 'deny'
        ? 'Adverse determination — denials always require human reasoning'
        : `AI recommendation "${recommendation ?? 'none'}" requires human review`
    );
  }

  const lane: ReadinessLane = reasons.length === 0 ? 'auto' : 'review';
  return { lane, score: computeScore(signals), reasons, signals };
}

/**
 * Composite 0-100 confidence-to-tap. Drives ordering within a lane and
 * the dashboard chip; the lane decision itself is the boolean gate above,
 * not a threshold on this score (so a single hard failure can't be
 * out-voted by otherwise-strong signals).
 */
function computeScore(s: ReadinessDecision['signals']): number {
  let score = s.fact_check_score ?? 0;
  // Confidence and criteria nudge the within-lane ordering.
  if (s.ai_confidence === 'high') score += 5;
  else if (s.ai_confidence === 'low') score -= 15;
  if (s.criteria_verdict === 'met') score += 5;
  else if (s.criteria_verdict === 'not_met') score -= 20;
  if (s.human_review_recommended) score -= 20;
  if (s.ai_recommendation === 'deny') score -= 10;
  return Math.max(0, Math.min(100, Math.round(score)));
}
