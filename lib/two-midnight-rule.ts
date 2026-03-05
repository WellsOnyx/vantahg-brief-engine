import type { Case } from './types';

/**
 * Two-Midnight Rule Engine
 *
 * CMS's Two-Midnight Rule (effective Oct 2013, updated 2015):
 * - If a physician expects a patient to require hospital care spanning at least
 *   two midnights, inpatient admission is generally appropriate.
 * - If the expected stay is less than two midnights, observation (outpatient)
 *   status is generally appropriate.
 * - EXCEPTION: Certain procedures on the Inpatient-Only List always qualify as inpatient.
 *
 * CRITICAL: This rule applies ONLY to Traditional Medicare (Part A/B).
 * Medicare Advantage plans and commercial payers are NOT required to follow it,
 * though some voluntarily adopt similar standards.
 *
 * Financial Impact:
 * - Inpatient = Part A coverage (hospital gets DRG payment, patient pays deductible)
 * - Observation = Part B coverage (patient pays 20% of all covered services + 100% of non-covered)
 * - Differential can be $3,000-$6,000+ per case
 * - One wrong call per day = $1.4-1.6M annual revenue loss for the hospital
 */

// ── Inpatient-Only List (CMS) ──────────────────────────────────────────────
// These procedures ALWAYS qualify for inpatient admission regardless of
// expected length of stay. Note: CMS has been removing procedures from this
// list (TKA/THA removed ~2020). This list reflects current status as of 2026.

export const INPATIENT_ONLY_PROCEDURES: Record<string, string> = {
  // Cardiac
  '33361': 'TAVR - Transcatheter Aortic Valve Replacement',
  '33405': 'Aortic Valve Replacement (Open)',
  '33430': 'Mitral Valve Replacement',
  '33533': 'CABG - Coronary Artery Bypass Graft (single)',
  '33534': 'CABG - Coronary Artery Bypass Graft (two)',
  '33535': 'CABG - Coronary Artery Bypass Graft (three)',
  '33536': 'CABG - Coronary Artery Bypass Graft (four or more)',
  // Spine
  '22630': 'Posterior Lumbar Interbody Fusion (PLIF)',
  '22633': 'Combined Anterior + Posterior Lumbar Fusion',
  // Transplant
  '33945': 'Heart Transplant',
  '47135': 'Liver Transplant (orthotopic)',
  '48554': 'Pancreas Transplant',
  '50360': 'Kidney Transplant',
  '32851': 'Lung Transplant (single)',
  '32852': 'Lung Transplant (double)',
  // Major vascular
  '34800': 'Endovascular Repair of Infrarenal Aortic Aneurysm',
  '34802': 'Endovascular Repair of Infrarenal Aortic Aneurysm (modular)',
  '35081': 'Open Repair of Abdominal Aortic Aneurysm',
  // Major neuro
  '61510': 'Craniotomy for Tumor Excision (supratentorial)',
  '61518': 'Craniotomy for Tumor Excision (infratentorial)',
  // Major GI
  '43631': 'Gastrectomy (partial)',
  '43632': 'Gastrectomy (total)',
  '44150': 'Colectomy (total)',
  '48150': 'Whipple Procedure (Pancreaticoduodenectomy)',
};

// ── Procedures REMOVED from Inpatient-Only List ────────────────────────────
// These CAN be done outpatient but may still qualify as inpatient
// depending on patient factors. Important context for reviewers.

export const REMOVED_FROM_INPATIENT_ONLY: Record<string, { description: string; removed_year: number; note: string }> = {
  '27447': {
    description: 'Total Knee Arthroplasty (TKA)',
    removed_year: 2020,
    note: 'Can be done outpatient for appropriate candidates. Still qualifies for inpatient based on clinical factors (age, comorbidities, BMI, social support).',
  },
  '27130': {
    description: 'Total Hip Arthroplasty (THA)',
    removed_year: 2020,
    note: 'Can be done outpatient for appropriate candidates. Same clinical factors apply.',
  },
  '22551': {
    description: 'Anterior Cervical Discectomy and Fusion (ACDF)',
    removed_year: 2021,
    note: 'Single-level ACDF can be outpatient. Multi-level typically still requires inpatient stay.',
  },
  '47562': {
    description: 'Laparoscopic Cholecystectomy',
    removed_year: 2018,
    note: 'Typically outpatient. Inpatient justified for acute cholecystitis, comorbidities, or complications.',
  },
};

// ── Medicare Plan Types ────────────────────────────────────────────────────

const TRADITIONAL_MEDICARE_INDICATORS = [
  'medicare', 'traditional medicare', 'original medicare',
  'medicare part a', 'medicare part b', 'medicare a/b',
  'cms', 'fee-for-service medicare', 'ffs medicare',
];

const MEDICARE_ADVANTAGE_INDICATORS = [
  'medicare advantage', 'ma plan', 'part c',
  'humana medicare', 'aetna medicare', 'uhc medicare',
  'anthem medicare', 'cigna medicare', 'wellcare',
  'devoted health', 'clover health', 'alignment health',
];

// ── Core Analysis Functions ────────────────────────────────────────────────

export interface TwoMidnightAnalysis {
  applies: boolean;
  is_traditional_medicare: boolean;
  is_medicare_advantage: boolean;
  payer_classification: 'traditional_medicare' | 'medicare_advantage' | 'commercial' | 'unknown';
  inpatient_only_procedure: boolean;
  inpatient_only_details: string | null;
  removed_from_inpatient_only: boolean;
  removed_details: string | null;
  financial_impact: {
    estimated_inpatient_payment: string;
    estimated_observation_payment: string;
    differential_note: string;
    beneficiary_impact: string | null;
  } | null;
  recommendations: string[];
  warnings: string[];
}

/**
 * Analyze a case for Two-Midnight Rule applicability and implications.
 * Returns structured analysis that gets injected into the AI brief.
 */
export function analyzeTwoMidnightRule(caseData: Case): TwoMidnightAnalysis {
  const payerName = (caseData.payer_name || '').toLowerCase();
  const planType = (caseData.plan_type || '').toLowerCase();
  const combined = `${payerName} ${planType}`;

  // Classify payer
  const isTraditionalMedicare = TRADITIONAL_MEDICARE_INDICATORS.some(i => combined.includes(i))
    && !MEDICARE_ADVANTAGE_INDICATORS.some(i => combined.includes(i));
  const isMedicareAdvantage = MEDICARE_ADVANTAGE_INDICATORS.some(i => combined.includes(i));
  const payerClassification: TwoMidnightAnalysis['payer_classification'] =
    isTraditionalMedicare ? 'traditional_medicare' :
    isMedicareAdvantage ? 'medicare_advantage' :
    combined.includes('medicare') ? 'traditional_medicare' : // default medicare mentions to traditional
    'commercial';

  // Check procedure codes against inpatient-only list
  const codes = caseData.procedure_codes || [];
  let inpatientOnlyProcedure = false;
  let inpatientOnlyDetails: string | null = null;
  let removedFromList = false;
  let removedDetails: string | null = null;

  for (const code of codes) {
    const trimmed = code.trim();
    if (INPATIENT_ONLY_PROCEDURES[trimmed]) {
      inpatientOnlyProcedure = true;
      inpatientOnlyDetails = `${trimmed}: ${INPATIENT_ONLY_PROCEDURES[trimmed]} — This procedure is on the CMS Inpatient-Only List. Inpatient admission is automatically appropriate.`;
    }
    if (REMOVED_FROM_INPATIENT_ONLY[trimmed]) {
      removedFromList = true;
      const info = REMOVED_FROM_INPATIENT_ONLY[trimmed];
      removedDetails = `${trimmed}: ${info.description} — Removed from Inpatient-Only List in ${info.removed_year}. ${info.note}`;
    }
  }

  const applies = isTraditionalMedicare;
  const recommendations: string[] = [];
  const warnings: string[] = [];

  if (applies) {
    if (inpatientOnlyProcedure) {
      recommendations.push('Procedure is on the CMS Inpatient-Only List. Inpatient admission is appropriate regardless of expected length of stay.');
    } else {
      recommendations.push('Apply the Two-Midnight Rule: If the admitting physician expects the patient to require hospital care spanning at least two midnights, inpatient admission is generally appropriate.');
      recommendations.push('Document the physician\'s expectation of length of stay at the time of admission, based on clinical factors.');
    }

    if (removedFromList) {
      warnings.push(`This procedure was recently removed from the Inpatient-Only List. Inpatient vs. outpatient determination should be based on individual patient factors, not solely on the procedure type.`);
    }

    if (caseData.facility_type === 'inpatient') {
      recommendations.push('Verify that the admitting physician documented their expectation that the beneficiary will require care crossing two midnights.');
    } else if (caseData.facility_type === 'outpatient' || caseData.facility_type === 'asc') {
      warnings.push('Patient is in an outpatient/ASC setting. If clinical condition deteriorates and stay is expected to cross two midnights, consider conversion to inpatient status.');
    }
  } else if (isMedicareAdvantage) {
    recommendations.push('Medicare Advantage plan — Two-Midnight Rule does NOT apply. The MA plan\'s own medical policies and criteria govern admission status determination.');
    recommendations.push('Check the specific MA plan\'s admission criteria, which may differ from Traditional Medicare.');
  }

  // Financial impact (only for Traditional Medicare)
  let financialImpact: TwoMidnightAnalysis['financial_impact'] = null;
  if (isTraditionalMedicare) {
    financialImpact = {
      estimated_inpatient_payment: 'DRG-based payment to hospital under Part A',
      estimated_observation_payment: 'Per-service billing under Part B (typically 40-60% less)',
      differential_note: 'Observation status results in significantly lower hospital reimbursement and shifts cost to the beneficiary.',
      beneficiary_impact: 'Under observation (Part B), the beneficiary is responsible for 20% of covered services and 100% of non-covered services. Observation status also disqualifies the patient from Medicare-covered skilled nursing facility (SNF) care, which requires a 3-day qualifying inpatient stay.',
    };
  }

  return {
    applies,
    is_traditional_medicare: isTraditionalMedicare,
    is_medicare_advantage: isMedicareAdvantage,
    payer_classification: payerClassification,
    inpatient_only_procedure: inpatientOnlyProcedure,
    inpatient_only_details: inpatientOnlyDetails,
    removed_from_inpatient_only: removedFromList,
    removed_details: removedDetails,
    financial_impact: financialImpact,
    recommendations,
    warnings,
  };
}

/**
 * Generate a text block for injection into the AI brief prompt when
 * the Two-Midnight Rule is relevant.
 */
export function getTwoMidnightBriefContext(analysis: TwoMidnightAnalysis): string {
  if (!analysis.applies && !analysis.is_medicare_advantage) return '';

  const lines: string[] = ['\nMEDICARE STATUS DETERMINATION CONTEXT:'];

  lines.push(`Payer Classification: ${analysis.payer_classification.replace(/_/g, ' ').toUpperCase()}`);

  if (analysis.applies) {
    lines.push('The CMS Two-Midnight Rule applies to this case (Traditional Medicare beneficiary).');
  }

  if (analysis.inpatient_only_procedure && analysis.inpatient_only_details) {
    lines.push(`INPATIENT-ONLY PROCEDURE: ${analysis.inpatient_only_details}`);
  }

  if (analysis.removed_from_inpatient_only && analysis.removed_details) {
    lines.push(`NOTE: ${analysis.removed_details}`);
  }

  for (const rec of analysis.recommendations) {
    lines.push(`- ${rec}`);
  }

  for (const warn of analysis.warnings) {
    lines.push(`WARNING: ${warn}`);
  }

  if (analysis.financial_impact) {
    lines.push(`BENEFICIARY IMPACT: ${analysis.financial_impact.beneficiary_impact}`);
  }

  return lines.join('\n');
}
