import type { Case, AIBrief, FactCheckResult } from './types';

/**
 * Denial Strength Scoring Engine
 *
 * Before a denial letter goes out, this engine scores how defensible
 * it is against an appeal. Based on real-world data showing 80%+
 * overturn rates on appeals — most denials are poorly documented.
 *
 * A strong denial has:
 * 1. Specific clinical criteria cited (not vague references)
 * 2. Complete documentation review (all submitted docs addressed)
 * 3. Alternative treatment recommended (shows good faith)
 * 4. Peer-to-peer offered (required in many states)
 * 5. Evidence-based rationale (published guidelines cited)
 * 6. Missing info documented (shows due diligence)
 * 7. Patient-specific reasoning (not cookie-cutter)
 *
 * Score: 0-100
 * - 90-100: Strong denial — likely to withstand appeal
 * - 70-89:  Moderate — some gaps that could be exploited on appeal
 * - 50-69:  Weak — significant vulnerability on appeal
 * - 0-49:   Very weak — recommend re-review before issuing
 */

export interface DenialStrengthScore {
  score: number;
  grade: 'strong' | 'moderate' | 'weak' | 'very_weak';
  factors: DenialFactor[];
  overall_assessment: string;
  recommendations: string[];
  /** AI-generated appeal likelihood signal (0-100). Higher = greater risk the denial will be appealed and potentially overturned.
   *  Computed from denial documentation quality + AI brief/fact-check coherence. Pure signal for human reviewer — never auto-decides.
   */
  appeal_likelihood?: number;
  appeal_risk_grade?: 'low' | 'medium' | 'high' | 'very_high';
  appeal_risk_assessment?: string;
}

export interface DenialFactor {
  name: string;
  weight: number; // how much this factor contributes (0-20)
  score: number; // how well this factor is met (0-100)
  weighted_score: number; // weight * score / 100
  detail: string;
  status: 'pass' | 'warning' | 'fail';
}

/**
 * Score how defensible a denial is before the letter goes out.
 * Should be called when determination = 'deny' or 'partial_approve'.
 */
export function scoreDenialStrength(caseData: Case): DenialStrengthScore {
  const factors: DenialFactor[] = [];

  // Factor 1: Clinical criteria cited (weight: 20)
  const criteriaCited = caseData.denial_criteria_cited;
  const criteriaScore = !criteriaCited ? 0 :
    criteriaCited.length > 100 ? 100 : // detailed citation
    criteriaCited.length > 50 ? 70 : // moderate citation
    40; // minimal citation
  factors.push({
    name: 'Clinical Criteria Cited',
    weight: 20,
    score: criteriaScore,
    weighted_score: 20 * criteriaScore / 100,
    detail: !criteriaCited
      ? 'No specific clinical criteria cited in denial. This is the #1 reason denials are overturned on appeal.'
      : criteriaScore >= 70
        ? 'Clinical criteria cited with sufficient detail.'
        : 'Clinical criteria reference is too brief. Add specific guideline names, versions, and criteria elements.',
    status: criteriaScore >= 70 ? 'pass' : criteriaScore > 0 ? 'warning' : 'fail',
  });

  // Factor 2: Denial reason specificity (weight: 20)
  const denialReason = caseData.denial_reason;
  const reasonScore = !denialReason ? 0 :
    denialReason.length > 150 ? 100 :
    denialReason.length > 80 ? 70 :
    denialReason.length > 30 ? 40 : 20;
  factors.push({
    name: 'Denial Reason Specificity',
    weight: 20,
    score: reasonScore,
    weighted_score: 20 * reasonScore / 100,
    detail: !denialReason
      ? 'No denial reason documented. Every denial must include a specific, patient-relevant reason.'
      : reasonScore >= 70
        ? 'Denial reason is specific and detailed.'
        : 'Denial reason is too generic. Include patient-specific clinical details, not boilerplate language.',
    status: reasonScore >= 70 ? 'pass' : reasonScore > 0 ? 'warning' : 'fail',
  });

  // Factor 3: Alternative treatment recommended (weight: 15)
  const alternative = caseData.alternative_recommended;
  const altScore = !alternative ? 0 :
    alternative.length > 50 ? 100 :
    alternative.length > 20 ? 60 : 30;
  factors.push({
    name: 'Alternative Treatment Recommended',
    weight: 15,
    score: altScore,
    weighted_score: 15 * altScore / 100,
    detail: !alternative
      ? 'No alternative treatment recommended. Offering an alternative demonstrates good faith and reduces appeal risk.'
      : altScore >= 60
        ? 'Alternative treatment recommendation provided.'
        : 'Alternative is vague. Recommend specific procedure codes, settings, or step therapy options.',
    status: altScore >= 60 ? 'pass' : altScore > 0 ? 'warning' : 'fail',
  });

  // Factor 4: Peer-to-peer offered (weight: 15)
  const p2pStatus = caseData.peer_to_peer_status;
  const p2pScore = p2pStatus === 'completed' ? 100 :
    p2pStatus === 'scheduled' ? 80 :
    p2pStatus === 'requested' ? 60 :
    p2pStatus === 'declined' || p2pStatus === 'no_response' ? 90 : // offered but declined = good
    0; // not offered
  factors.push({
    name: 'Peer-to-Peer Offered',
    weight: 15,
    score: p2pScore,
    weighted_score: 15 * p2pScore / 100,
    detail: !p2pStatus
      ? 'Peer-to-peer review not offered. Many states require P2P opportunity before denial. Always offer P2P — it strengthens the denial letter.'
      : p2pStatus === 'completed'
        ? 'Peer-to-peer completed. Denial is significantly strengthened.'
        : p2pStatus === 'declined' || p2pStatus === 'no_response'
          ? 'P2P was offered but the provider declined/did not respond. Document this in the denial letter.'
          : `P2P status: ${p2pStatus}. Consider completing P2P before finalizing denial.`,
    status: p2pScore >= 60 ? 'pass' : p2pScore > 0 ? 'warning' : 'fail',
  });

  // Factor 5: Determination rationale quality (weight: 15)
  const rationale = caseData.determination_rationale;
  const rationaleScore = !rationale ? 0 :
    rationale.length > 200 ? 100 :
    rationale.length > 100 ? 70 :
    rationale.length > 40 ? 40 : 20;
  factors.push({
    name: 'Evidence-Based Rationale',
    weight: 15,
    score: rationaleScore,
    weighted_score: 15 * rationaleScore / 100,
    detail: !rationale
      ? 'No determination rationale documented. The reviewing physician must provide their clinical reasoning.'
      : rationaleScore >= 70
        ? 'Rationale is detailed and evidence-based.'
        : 'Rationale is too brief. Physician should cite specific clinical evidence, published guidelines, or medical literature.',
    status: rationaleScore >= 70 ? 'pass' : rationaleScore > 0 ? 'warning' : 'fail',
  });

  // Factor 6: Documentation completeness (weight: 10)
  const aiBrief = caseData.ai_brief;
  const missingDocs = aiBrief?.documentation_review?.missing_documentation || [];
  const docsScore = missingDocs.length === 0 ? 100 :
    missingDocs.length <= 1 ? 70 :
    missingDocs.length <= 3 ? 40 : 20;
  factors.push({
    name: 'Documentation Completeness',
    weight: 10,
    score: docsScore,
    weighted_score: 10 * docsScore / 100,
    detail: missingDocs.length === 0
      ? 'All expected documentation was reviewed. No gaps identified.'
      : `${missingDocs.length} documentation gap(s) identified: ${missingDocs.slice(0, 3).join('; ')}. Missing documentation weakens the denial — consider requesting info before denying.`,
    status: docsScore >= 70 ? 'pass' : docsScore > 0 ? 'warning' : 'fail',
  });

  // Factor 7: AI recommendation alignment (weight: 5)
  const aiRec = aiBrief?.ai_recommendation?.recommendation;
  const aiAligned = aiRec === 'deny' || aiRec === 'pend';
  const aiScore = aiAligned ? 100 : aiRec === 'peer_to_peer_recommended' ? 50 : 0;
  factors.push({
    name: 'AI Recommendation Alignment',
    weight: 5,
    score: aiScore,
    weighted_score: 5 * aiScore / 100,
    detail: aiAligned
      ? 'Physician determination aligns with AI recommendation.'
      : aiRec === 'approve'
        ? 'Physician is overriding AI recommendation of approval. Ensure rationale clearly explains why the AI analysis was insufficient.'
        : 'AI recommended peer-to-peer review. Consider completing P2P before finalizing.',
    status: aiScore >= 50 ? 'pass' : 'warning',
  });

  // Calculate total weighted score
  const totalWeight = factors.reduce((sum, f) => sum + f.weight, 0);
  const totalWeightedScore = factors.reduce((sum, f) => sum + f.weighted_score, 0);
  const score = Math.round((totalWeightedScore / totalWeight) * 100);

  const grade: DenialStrengthScore['grade'] =
    score >= 90 ? 'strong' :
    score >= 70 ? 'moderate' :
    score >= 50 ? 'weak' : 'very_weak';

  // Generate recommendations based on failing factors
  const recommendations: string[] = [];
  const failingFactors = factors.filter(f => f.status === 'fail');
  const warningFactors = factors.filter(f => f.status === 'warning');

  if (failingFactors.length > 0) {
    recommendations.push(`Address ${failingFactors.length} critical gap(s) before issuing this denial: ${failingFactors.map(f => f.name).join(', ')}.`);
  }
  if (warningFactors.length > 0) {
    recommendations.push(`Consider strengthening ${warningFactors.length} area(s): ${warningFactors.map(f => f.name).join(', ')}.`);
  }
  if (score < 70) {
    recommendations.push('This denial has significant appeal risk. Consider re-reviewing the case or requesting additional clinical information before issuing.');
  }
  if (score < 50) {
    recommendations.push('STRONG RECOMMENDATION: Do not issue this denial in its current form. The appeal risk is extremely high.');
  }

  const overall_assessment = grade === 'strong'
    ? 'This denial is well-documented and likely to withstand appeal. All key elements are present.'
    : grade === 'moderate'
      ? 'This denial has a reasonable foundation but has gaps that could be exploited on appeal. Address warnings before issuing.'
      : grade === 'weak'
        ? 'This denial has significant weaknesses. Based on industry data (80%+ overturn rate), denials at this score level are frequently overturned.'
        : 'This denial is critically under-documented. Issuing it in this form will almost certainly result in an overturned appeal and wasted physician review time.';

  // === AI Automation Layer (Track A): Compute appeal likelihood signal (explainable, for human reviewers only) ===
  // Reuses the denial factors + pulls from AI brief + fact-check for predictive risk (pre- or post-determination).
  // Deterministic primary logic (no LLM dependency for core signal; future enhancement can layer nuance).
  const appealContext = {
    aiBrief: (caseData as any).ai_brief as AIBrief | undefined,
    factCheck: (caseData as any).fact_check as FactCheckResult | undefined,
  };
  const appealSignal = computeAppealLikelihood(appealContext.aiBrief, appealContext.factCheck, {
    denial_strength: score,
    missing_docs_count: (appealContext.aiBrief?.documentation_review?.missing_documentation?.length ?? 0),
    unable_count: (appealContext.aiBrief?.criteria_match?.criteria_unable_to_assess?.length ?? 0),
    not_met_count: (appealContext.aiBrief?.criteria_match?.criteria_not_met?.length ?? 0),
    complexity: appealContext.aiBrief?.procedure_analysis?.complexity_level,
    confidence: appealContext.aiBrief?.ai_recommendation?.confidence,
    p2p_offered: (caseData as any).peer_to_peer_status != null,
  });

  return {
    score,
    grade,
    factors,
    overall_assessment,
    recommendations,
    appeal_likelihood: appealSignal.likelihood,
    appeal_risk_grade: appealSignal.risk_grade,
    appeal_risk_assessment: appealSignal.assessment,
  };
}

/**
 * Compute appeal likelihood (0-100) as an AI-generated signal for human reviewers.
 * Higher score = higher predicted risk that this denial/partial will be appealed and may be overturned.
 * Primary: deterministic rules on brief coherence, documentation gaps, AI confidence vs outcome, complexity.
 * Designed to be called from scoreDenialStrength or standalone pre-determination for routing/prioritization.
 * Always explainable via factors. Never used for automatic denial or routing decisions.
 */
export function computeAppealLikelihood(
  aiBrief?: AIBrief | null,
  factCheck?: FactCheckResult | null,
  context: {
    denial_strength?: number;
    missing_docs_count?: number;
    unable_count?: number;
    not_met_count?: number;
    complexity?: 'routine' | 'moderate' | 'complex';
    confidence?: 'high' | 'medium' | 'low';
    p2p_offered?: boolean;
  } = {}
): {
  likelihood: number;
  risk_grade: 'low' | 'medium' | 'high' | 'very_high';
  factors: Array<{ name: string; impact: number; detail: string }>;
  assessment: string;
} {
  const factors: Array<{ name: string; impact: number; detail: string }> = [];
  let likelihood = 30; // baseline moderate risk

  // Factor: Documentation gaps from AI brief (high impact on appeal success)
  const missing = context.missing_docs_count ?? aiBrief?.documentation_review?.missing_documentation?.length ?? 0;
  if (missing > 2) {
    likelihood += 25;
    factors.push({ name: 'Multiple documentation gaps', impact: 25, detail: `${missing} items flagged missing by AI — providers often supply these on appeal, leading to overturn.` });
  } else if (missing > 0) {
    likelihood += 12;
    factors.push({ name: 'Documentation gaps', impact: 12, detail: 'Some documentation gaps identified; strengthens appeal potential.' });
  } else {
    factors.push({ name: 'Documentation complete', impact: -10, detail: 'No gaps per AI review — lowers appeal success odds.' });
    likelihood -= 10;
  }

  // Factor: Criteria unable to assess (uncertainty = appeal opportunity)
  const unable = context.unable_count ?? aiBrief?.criteria_match?.criteria_unable_to_assess?.length ?? 0;
  if (unable >= 3) {
    likelihood += 20;
    factors.push({ name: 'High uncertainty in criteria', impact: 20, detail: 'Multiple "unable to assess" — reviewer may have missed key facts; appeal often succeeds with more records.' });
  } else if (unable > 0) {
    likelihood += 8;
    factors.push({ name: 'Some criteria uncertainty', impact: 8, detail: 'Partial uncertainty in AI analysis creates opening for provider to supply clarifying info.' });
  }

  // Factor: Criteria not met count vs denial strength
  const notMet = context.not_met_count ?? aiBrief?.criteria_match?.criteria_not_met?.length ?? 0;
  if (notMet === 0 && (context.denial_strength ?? 0) < 60) {
    likelihood += 15;
    factors.push({ name: 'Weak denial with few explicit fails', impact: 15, detail: 'Denial issued despite limited "not met" citations — vulnerable on appeal.' });
  }

  // Factor: Complexity + confidence mismatch (from fact-checker coherence)
  const complexity = context.complexity ?? aiBrief?.procedure_analysis?.complexity_level;
  const confidence = context.confidence ?? aiBrief?.ai_recommendation?.confidence;
  if (complexity === 'complex' && confidence === 'high') {
    likelihood += 12;
    factors.push({ name: 'Complex case with high AI confidence', impact: 12, detail: 'Complex clinical scenario marked high-confidence by AI — human reviewers should scrutinize; appeals often cite nuance missed.' });
  } else if (complexity === 'complex') {
    likelihood += 8;
    factors.push({ name: 'Complex case', impact: 8, detail: 'High clinical complexity increases chance of successful appeal with specialist input.' });
  }

  // Factor: Low AI confidence on a denial path
  if (confidence === 'low') {
    likelihood += 18;
    factors.push({ name: 'Low AI confidence', impact: 18, detail: 'AI itself expressed low confidence — strong signal for provider to challenge.' });
  }

  // Factor: P2P not offered (state compliance + good faith)
  if (!context.p2p_offered) {
    likelihood += 10;
    factors.push({ name: 'P2P opportunity not documented', impact: 10, detail: 'Many jurisdictions require or expect peer-to-peer before final denial; omission is common appeal ground.' });
  }

  // Factor: Strong denial strength reduces likelihood
  if ((context.denial_strength ?? 0) >= 85) {
    likelihood -= 20;
    factors.push({ name: 'Strong documentation per denial strength', impact: -20, detail: 'High denial strength score indicates detailed criteria citation + rationale — statistically lower overturn risk.' });
  } else if ((context.denial_strength ?? 0) >= 70) {
    likelihood -= 8;
    factors.push({ name: 'Solid denial documentation', impact: -8, detail: 'Good denial strength lowers (but does not eliminate) appeal risk.' });
  }

  // Clamp and grade
  likelihood = Math.max(5, Math.min(95, Math.round(likelihood)));

  const risk_grade: 'low' | 'medium' | 'high' | 'very_high' =
    likelihood >= 75 ? 'very_high' :
    likelihood >= 55 ? 'high' :
    likelihood >= 35 ? 'medium' : 'low';

  const assessment = risk_grade === 'low'
    ? 'Low predicted appeal risk. Denial is well-supported; low likelihood of successful challenge.'
    : risk_grade === 'medium'
      ? 'Moderate appeal risk. Standard provider pushback possible; ensure rationale is patient-specific.'
      : risk_grade === 'high'
        ? 'High appeal likelihood. Significant vulnerabilities or uncertainty. Strongly consider additional review or info request before final denial.'
        : 'Very high appeal risk. Multiple red flags (gaps, uncertainty, weak citations). Re-review or pend recommended. Issuing in current form likely to be overturned.';

  if (factors.length === 0) {
    factors.push({ name: 'Balanced profile', impact: 0, detail: 'No strong aggravating or mitigating signals from AI analysis.' });
  }

  return { likelihood, risk_grade, factors, assessment };
}
