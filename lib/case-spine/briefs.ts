import { randomUUID } from 'crypto';
import { payloadHash } from './hash';
import type {
  CanonicalCase,
  CriteriaResult,
  SpineBrief,
  SpineBriefContent,
  SpineDetermination,
} from './types';

const DRAFT_BY_CRITERIA: Record<CriteriaResult, SpineDetermination> = {
  meet: 'approve',
  fail: 'deny',
  gray: 'pend',
};

const REC_BY_CRITERIA: Record<
  CriteriaResult,
  SpineBriefContent['ai_recommendation']['recommendation']
> = {
  meet: 'approve',
  fail: 'deny',
  gray: 'pend',
};

/**
 * Build a synthetic brief from tokenized intake only.
 * Does not call generateBriefForCase / fact-check — those engines stay untouched.
 */
export function buildSyntheticBriefContent(
  c: CanonicalCase,
  criteria: CriteriaResult,
): SpineBriefContent {
  const member = c.intake.member_ref || 'memb_synth_unknown';
  const service = c.intake.service_or_rx || 'SYNTH-PROC';
  const provider = c.intake.requesting_provider || 'prov_synth_unknown';
  const clinicals = c.intake.clinicals_pointer || c.packet_storage_keys[0] || 's3://synth/packet/missing';
  const draft = DRAFT_BY_CRITERIA[criteria];
  const rec = REC_BY_CRITERIA[criteria];

  return {
    clinical_question: `Does tokenized member ${member} meet coverage criteria for ${service}?`,
    patient_summary: `Synthetic prior-auth packet for ${member}. Requesting provider ${provider}. Service/Rx ${service}. No live PHI.`,
    diagnosis_analysis: {
      primary_diagnosis: 'Synthetic indication (tokenized)',
      secondary_diagnoses: [],
      diagnosis_procedure_alignment: `Service ${service} aligned to the synthetic indication on the packet.`,
    },
    procedure_analysis: {
      codes: [service],
      clinical_rationale: `Draft ${draft} brief from criteria_result=${criteria}. Packet pointer ${clinicals}.`,
      complexity_level: 'routine',
      setting_appropriateness: c.intake.place_of_service || 'office',
    },
    criteria_match: {
      guideline_source: 'synthetic_criteria_v1',
      applicable_guideline: `Client ${c.client_id} synthetic pack`,
      criteria_met: criteria === 'meet' ? ['Synthetic criteria clear-meet'] : [],
      criteria_not_met: criteria === 'fail' ? ['Synthetic criteria clear-fail'] : [],
      criteria_unable_to_assess: criteria === 'gray' ? ['Insufficient synthetic evidence'] : [],
      conservative_alternatives: criteria === 'fail' ? ['Documented alternative on draft deny brief'] : [],
    },
    documentation_review: {
      documents_provided: clinicals,
      key_findings: [`Packet keys: ${c.packet_storage_keys.join(',') || 'none'}`],
      missing_documentation: criteria === 'gray' ? ['Additional clinicals requested'] : [],
    },
    ai_recommendation: {
      recommendation: rec,
      confidence: criteria === 'gray' ? 'low' : 'high',
      rationale: `Criteria engine ${criteria} → draft ${draft}. MD sign required; this is not a determination.`,
      key_considerations: ['Human MD must sign', 'Synthetic fixture only'],
      if_modify_suggestion: criteria === 'fail' ? 'Consider documented alternative if contracted' : null,
    },
    reviewer_action: {
      decision_required: `Confirm or override draft ${draft}`,
      time_sensitivity: c.priority,
      peer_to_peer_suggested: false,
      additional_info_needed: criteria === 'gray' ? ['request_clinicals'] : [],
      state_specific_requirements: [],
    },
  };
}

export function criteriaFromExistingRecommendation(
  recommendation: string | undefined,
): CriteriaResult {
  if (recommendation === 'approve') return 'meet';
  if (recommendation === 'deny') return 'fail';
  return 'gray';
}

export function mintSpineBrief(input: {
  case: CanonicalCase;
  content: SpineBriefContent;
  criteria_result: CriteriaResult;
  source: SpineBrief['source'];
  existing_brief_ref?: string | null;
  brief_id?: string;
  now?: Date;
}): SpineBrief {
  const now = input.now ?? new Date();
  const brief_id = input.brief_id ?? randomUUID();
  return {
    brief_id,
    case_id: input.case.case_id,
    source: input.source,
    existing_brief_ref: input.existing_brief_ref ?? null,
    created_at: now.toISOString(),
    draft_determination: DRAFT_BY_CRITERIA[input.criteria_result],
    criteria_result: input.criteria_result,
    content: input.content,
    content_hash: payloadHash({
      brief_id,
      case_id: input.case.case_id,
      criteria_result: input.criteria_result,
      recommendation: input.content.ai_recommendation.recommendation,
    }),
  };
}

/**
 * Resolve an existing generate-brief / demo brief by id.
 * Returns null when the id is not a known demo brief — caller then mints synthetic.
 */
export async function resolveExistingBriefContent(sourceCaseId: string): Promise<{
  content: SpineBriefContent;
  criteria_result: CriteriaResult;
} | null> {
  try {
    const { getDemoBrief } = await import('@/lib/demo-mode');
    const existing = getDemoBrief(sourceCaseId);
    if (!existing?.brief) return null;
    const content = existing.brief as SpineBriefContent;
    return {
      content,
      criteria_result: criteriaFromExistingRecommendation(content.ai_recommendation?.recommendation),
    };
  } catch {
    return null;
  }
}
