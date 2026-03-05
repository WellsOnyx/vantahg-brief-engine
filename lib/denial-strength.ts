import type { Case } from './types';

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

  return { score, grade, factors, overall_assessment, recommendations };
}
