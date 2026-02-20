/**
 * VantaHG Fact-Checker Engine
 *
 * Runs DETERMINISTICALLY (no AI calls) to verify AI-generated clinical briefs.
 * Cross-references cited criteria, guidelines, and codes against known databases.
 * Produces a FactCheckResult with a 0-100 verification score.
 */

import type {
  AIBrief,
  Case,
  FactCheckResult,
  ClaimVerification,
  SectionVerification,
  ConsistencyCheck,
  VerificationStatus,
} from './types';
import { medicalCriteria } from './medical-criteria';
import { findKnownGuideline, isRecognizedRegulatoryFormat } from './known-guidelines';

// ── Code Format Validators ──────────────────────────────────────────────────

function isValidCPT(code: string): boolean {
  return /^\d{5}$/.test(code.trim());
}

function isValidHCPCS(code: string): boolean {
  return /^[A-Z]\d{4}$/i.test(code.trim());
}

function isValidICD10(code: string): boolean {
  return /^[A-Z]\d{2}(\.\d{1,4})?$/i.test(code.trim());
}

function isValidMedicalCode(code: string): boolean {
  const clean = code.trim().split(/\s/)[0]; // Take first token (code before description)
  return isValidCPT(clean) || isValidHCPCS(clean) || isValidICD10(clean);
}

// ── Fuzzy String Match ──────────────────────────────────────────────────────

function fuzzyMatch(a: string, b: string): boolean {
  const normalize = (s: string) =>
    s.toLowerCase().replace(/[^a-z0-9]/g, '').trim();
  const na = normalize(a);
  const nb = normalize(b);
  if (na.length < 5 || nb.length < 5) return na === nb;
  return na.includes(nb) || nb.includes(na);
}

function fuzzyContains(haystack: string[], needle: string): boolean {
  return haystack.some((h) => fuzzyMatch(h, needle));
}

// ── Section Verifiers ───────────────────────────────────────────────────────

function verifyCriteriaMatch(
  brief: AIBrief,
  caseData: Case
): SectionVerification {
  const claims: ClaimVerification[] = [];
  const flags: string[] = [];

  // 1. Verify criteria_met against known medical criteria
  const matchedCriteria: Record<string, typeof medicalCriteria[string]> = {};
  for (const code of caseData.procedure_codes || []) {
    const trimmed = code.trim().toUpperCase();
    if (medicalCriteria[trimmed]) {
      matchedCriteria[trimmed] = medicalCriteria[trimmed];
    }
  }

  const allKnownCriteria = Object.values(matchedCriteria).flatMap(
    (c) => c.typical_criteria
  );

  for (const criterion of brief.criteria_match.criteria_met) {
    if (allKnownCriteria.length === 0) {
      // No reference criteria available - mark unverified
      claims.push({
        claim: criterion,
        status: 'unverified',
        source: null,
        explanation: 'No reference criteria available for these procedure codes',
      });
    } else if (fuzzyContains(allKnownCriteria, criterion)) {
      claims.push({
        claim: criterion,
        status: 'verified',
        source: 'VantaHG Medical Criteria Database',
        explanation: 'Matches known clinical criteria for this procedure',
      });
    } else {
      claims.push({
        claim: criterion,
        status: 'unverified',
        source: null,
        explanation:
          'Could not match against known criteria database — may be valid but requires manual review',
      });
    }
  }

  for (const criterion of brief.criteria_match.criteria_not_met) {
    if (allKnownCriteria.length > 0 && fuzzyContains(allKnownCriteria, criterion)) {
      claims.push({
        claim: criterion,
        status: 'verified',
        source: 'VantaHG Medical Criteria Database',
        explanation: 'Recognized criterion correctly identified as not met',
      });
    } else if (allKnownCriteria.length > 0) {
      claims.push({
        claim: criterion,
        status: 'unverified',
        source: null,
        explanation: 'Not-met criterion could not be matched against known criteria',
      });
    }
  }

  // 2. Verify guideline source
  const guidelineSource = brief.criteria_match.guideline_source;
  if (guidelineSource) {
    const parts = guidelineSource.split(/[\/,;]+/).map((s) => s.trim()).filter(Boolean);
    for (const part of parts) {
      const match = findKnownGuideline(part);
      if (match) {
        claims.push({
          claim: `Guideline source: ${part}`,
          status: 'verified',
          source: match.organization,
          explanation: `Recognized guideline: ${match.name}`,
        });
      } else if (part.length > 2) {
        // Check if it matches a plan-specific policy (these are valid but unverifiable)
        if (/policy|plan|formulary|benefit/i.test(part)) {
          claims.push({
            claim: `Guideline source: ${part}`,
            status: 'unverified',
            source: null,
            explanation: 'Plan-specific policy — cannot be independently verified',
          });
        } else {
          claims.push({
            claim: `Guideline source: ${part}`,
            status: 'flagged',
            source: null,
            explanation: 'Unrecognized guideline source — may be fabricated',
          });
          flags.push(`Unrecognized guideline: "${part}"`);
        }
      }
    }
  }

  // 3. Verify applicable_guideline
  const applicableGuideline = brief.criteria_match.applicable_guideline;
  if (applicableGuideline) {
    const match = findKnownGuideline(applicableGuideline);
    if (match) {
      claims.push({
        claim: `Applicable guideline: ${applicableGuideline}`,
        status: 'verified',
        source: match.organization,
        explanation: `References recognized guideline from ${match.organization}`,
      });
    } else if (
      isRecognizedRegulatoryFormat(applicableGuideline) ||
      /plan|policy|formulary/i.test(applicableGuideline)
    ) {
      claims.push({
        claim: `Applicable guideline: ${applicableGuideline}`,
        status: 'unverified',
        source: null,
        explanation: 'Follows recognized reference format but could not be independently verified',
      });
    } else {
      claims.push({
        claim: `Applicable guideline: ${applicableGuideline}`,
        status: 'flagged',
        source: null,
        explanation: 'Could not verify this guideline reference',
      });
      flags.push(`Unverified applicable guideline reference`);
    }
  }

  return { section: 'Clinical Criteria Match', claims, flags };
}

function verifyProcedureCodes(
  brief: AIBrief,
  caseData: Case
): SectionVerification {
  const claims: ClaimVerification[] = [];
  const flags: string[] = [];

  // Verify procedure codes from the brief
  for (const codeEntry of brief.procedure_analysis.codes) {
    const code = codeEntry.split(/[\s\-–—]/)[0].trim();
    if (isValidMedicalCode(code)) {
      claims.push({
        claim: `Procedure code: ${codeEntry}`,
        status: 'verified',
        source: 'Code format validation',
        explanation: 'Valid CPT/HCPCS code format',
      });
    } else if (code.length > 0) {
      claims.push({
        claim: `Procedure code: ${codeEntry}`,
        status: 'flagged',
        source: null,
        explanation: 'Code does not match standard CPT/HCPCS format',
      });
      flags.push(`Invalid procedure code format: ${code}`);
    }
  }

  // Verify diagnosis codes from the brief
  if (brief.diagnosis_analysis) {
    const primaryDx = brief.diagnosis_analysis.primary_diagnosis;
    const dxCode = primaryDx.split(/[\s\-–—]/)[0].trim();
    if (isValidICD10(dxCode)) {
      claims.push({
        claim: `Primary diagnosis: ${primaryDx}`,
        status: 'verified',
        source: 'Code format validation',
        explanation: 'Valid ICD-10 code format',
      });
    } else if (dxCode.length > 0) {
      claims.push({
        claim: `Primary diagnosis: ${primaryDx}`,
        status: 'unverified',
        source: null,
        explanation: 'Could not extract a standard ICD-10 code from this diagnosis',
      });
    }
  }

  // Cross-check that brief codes match case codes
  const caseCodes = new Set(
    (caseData.procedure_codes || []).map((c) => c.trim().toUpperCase())
  );
  for (const codeEntry of brief.procedure_analysis.codes) {
    const code = codeEntry.split(/[\s\-–—]/)[0].trim().toUpperCase();
    if (caseCodes.size > 0 && !caseCodes.has(code) && isValidMedicalCode(code)) {
      flags.push(
        `Brief references code ${code} not found in case procedure codes`
      );
    }
  }

  return { section: 'Procedure & Diagnosis Codes', claims, flags };
}

function verifyDocumentation(brief: AIBrief): SectionVerification {
  const claims: ClaimVerification[] = [];
  const flags: string[] = [];

  // Check that missing documentation items appear in additional_info_needed
  const additionalInfoNeeded =
    brief.reviewer_action.additional_info_needed || [];
  const missingDocs = brief.documentation_review.missing_documentation || [];

  for (const missing of missingDocs) {
    const referenced = additionalInfoNeeded.some((info) =>
      fuzzyMatch(info, missing)
    );
    if (referenced) {
      claims.push({
        claim: `Missing doc flagged: ${missing}`,
        status: 'verified',
        source: 'Internal consistency',
        explanation:
          'Missing documentation is also listed in additional info needed',
      });
    } else {
      claims.push({
        claim: `Missing doc flagged: ${missing}`,
        status: 'unverified',
        source: null,
        explanation:
          'Missing documentation noted but not referenced in additional info needed — may be minor',
      });
    }
  }

  return { section: 'Documentation Review', claims, flags };
}

function verifyRecommendation(brief: AIBrief): SectionVerification {
  const claims: ClaimVerification[] = [];
  const flags: string[] = [];

  // Check for state-specific citations that look fabricated
  const stateReqs = brief.reviewer_action.state_specific_requirements || [];
  for (const req of stateReqs) {
    if (isRecognizedRegulatoryFormat(req)) {
      claims.push({
        claim: `State requirement: ${req}`,
        status: 'unverified',
        source: null,
        explanation: 'Follows recognized regulatory format — requires manual verification',
      });
    } else {
      claims.push({
        claim: `State requirement: ${req}`,
        status: 'flagged',
        source: null,
        explanation:
          'State-specific requirement does not match recognized regulatory patterns — may be fabricated',
      });
      flags.push(`Potentially fabricated state requirement: "${req}"`);
    }
  }

  return { section: 'Recommendation & Reviewer Action', claims, flags };
}

// ── Consistency Checks ──────────────────────────────────────────────────────

function runConsistencyChecks(brief: AIBrief): ConsistencyCheck[] {
  const checks: ConsistencyCheck[] = [];

  // 1. Recommendation vs criteria balance
  const metCount = brief.criteria_match.criteria_met.length;
  const notMetCount = brief.criteria_match.criteria_not_met.length;
  const recommendation = brief.ai_recommendation.recommendation;

  if (recommendation === 'approve' && notMetCount > metCount && metCount > 0) {
    checks.push({
      check: 'Recommendation-criteria alignment',
      passed: false,
      detail: `Recommendation is "approve" but ${notMetCount} criteria are not met vs ${metCount} met — unusual pattern`,
    });
  } else if (
    recommendation === 'deny' &&
    metCount > notMetCount &&
    notMetCount === 0
  ) {
    checks.push({
      check: 'Recommendation-criteria alignment',
      passed: false,
      detail: `Recommendation is "deny" but all ${metCount} criteria are met with 0 not met — inconsistent`,
    });
  } else {
    checks.push({
      check: 'Recommendation-criteria alignment',
      passed: true,
      detail: `Recommendation "${recommendation}" is consistent with ${metCount} met / ${notMetCount} not met criteria`,
    });
  }

  // 2. High confidence with many unable-to-assess
  const unableCount = brief.criteria_match.criteria_unable_to_assess.length;
  const confidence = brief.ai_recommendation.confidence;

  if (confidence === 'high' && unableCount >= 3) {
    checks.push({
      check: 'Confidence-uncertainty alignment',
      passed: false,
      detail: `Confidence is "high" but ${unableCount} criteria are unable to be assessed — confidence may be overstated`,
    });
  } else {
    checks.push({
      check: 'Confidence-uncertainty alignment',
      passed: true,
      detail: `Confidence "${confidence}" is consistent with ${unableCount} unable-to-assess items`,
    });
  }

  // 3. Missing documentation should drive pend/info-needed
  const missingDocs = brief.documentation_review.missing_documentation.length;
  const additionalInfo = brief.reviewer_action.additional_info_needed.length;

  if (missingDocs >= 3 && recommendation === 'approve' && additionalInfo === 0) {
    checks.push({
      check: 'Missing documentation impact',
      passed: false,
      detail: `${missingDocs} missing documents noted but recommendation is "approve" with no additional info requested`,
    });
  } else {
    checks.push({
      check: 'Missing documentation impact',
      passed: true,
      detail: `Documentation gaps (${missingDocs}) are appropriately reflected in the recommendation`,
    });
  }

  // 4. Peer-to-peer consistency
  if (
    brief.reviewer_action.peer_to_peer_suggested &&
    recommendation === 'approve' &&
    confidence === 'high'
  ) {
    checks.push({
      check: 'Peer-to-peer necessity',
      passed: false,
      detail:
        'Peer-to-peer is suggested but recommendation is "approve" with high confidence — P2P is unusual in this scenario',
    });
  } else {
    checks.push({
      check: 'Peer-to-peer necessity',
      passed: true,
      detail: 'Peer-to-peer suggestion is consistent with the recommendation and confidence level',
    });
  }

  return checks;
}

// ── Main Fact-Check Function ────────────────────────────────────────────────

export function factCheckBrief(
  brief: AIBrief,
  caseData: Case
): FactCheckResult {
  const sections: SectionVerification[] = [
    verifyCriteriaMatch(brief, caseData),
    verifyProcedureCodes(brief, caseData),
    verifyDocumentation(brief),
    verifyRecommendation(brief),
  ];

  const consistencyChecks = runConsistencyChecks(brief);

  // Count claim statuses
  let verified = 0;
  let unverified = 0;
  let flagged = 0;

  for (const section of sections) {
    for (const claim of section.claims) {
      if (claim.status === 'verified') verified++;
      else if (claim.status === 'unverified') unverified++;
      else if (claim.status === 'flagged') flagged++;
    }
  }

  // Count flags
  const totalFlags = sections.reduce((sum, s) => sum + s.flags.length, 0);
  const failedChecks = consistencyChecks.filter((c) => !c.passed).length;

  // Calculate score (0-100)
  const totalClaims = verified + unverified + flagged;
  let score = 100;

  if (totalClaims > 0) {
    // Base score from verification ratio
    const verifiedRatio = verified / totalClaims;
    const flaggedRatio = flagged / totalClaims;
    score = Math.round(verifiedRatio * 100 - flaggedRatio * 50);
  }

  // Penalize for flags and failed consistency checks
  score -= totalFlags * 5;
  score -= failedChecks * 10;

  // Clamp to 0-100
  score = Math.max(0, Math.min(100, score));

  // Determine overall status
  let overall_status: 'pass' | 'warning' | 'fail';
  if (score >= 80 && flagged === 0 && failedChecks === 0) {
    overall_status = 'pass';
  } else if (score < 50 || flagged >= 3 || failedChecks >= 2) {
    overall_status = 'fail';
  } else {
    overall_status = 'warning';
  }

  return {
    overall_score: score,
    overall_status,
    sections,
    summary: { verified, unverified, flagged },
    consistency_checks: consistencyChecks,
    checked_at: new Date().toISOString(),
  };
}
