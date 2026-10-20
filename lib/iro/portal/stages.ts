import type { IroStage, IroStep } from '@/lib/iro/types';
import { stageForStep } from '@/lib/iro/workflow';

/**
 * The six SOP stages the portal shows. The workflow steps underneath
 * are unchanged.
 */
export const PORTAL_STAGE_LABELS = [
  'Intake',
  'Eligibility / conflict',
  'Assignment',
  'Review',
  'Determination',
  'Notice / close',
] as const;

export type PortalStageLabel = (typeof PORTAL_STAGE_LABELS)[number];

const STEP_LABEL: Record<IroStep, PortalStageLabel> = {
  intake: 'Intake',
  classification: 'Intake',
  pathway_deadline: 'Intake',
  conflict_check: 'Eligibility / conflict',
  acceptance: 'Eligibility / conflict',
  records: 'Eligibility / conflict',
  referral: 'Eligibility / conflict',
  reviewer_assignment: 'Assignment',
  attestation_gate: 'Assignment',
  review: 'Review',
  md_signoff: 'Determination',
  notice: 'Notice / close',
  delivery: 'Notice / close',
  closure: 'Notice / close',
  billing: 'Notice / close',
};

export function portalStageLabel(step: IroStep): PortalStageLabel {
  return STEP_LABEL[step];
}

export function portalStageNumber(step: IroStep): IroStage {
  return stageForStep(step);
}
