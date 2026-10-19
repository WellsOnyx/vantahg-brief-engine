import type { IroAccessPolicy, IroRole } from '../types';

/**
 * Conflict clearance and panel approvers are configuration.
 * Replacing a name is a data change, not a code change.
 * Stage ownership: coordinators 1, 2, 3, 6; physicians 4; MD sign-off 5;
 * team leads oversee every stage.
 */
const COORDINATORS = ['iro_coordinator', 'iro_team_lead'] as const satisfies readonly IroRole[];

export const DEFAULT_IRO_ACCESS_POLICY: IroAccessPolicy = {
  id: 'iro-access-2026-10-19',
  conflict_clearance_roles: ['santana', 'sam', 'johana'],
  panel_approvers: ['santana', 'jonah', 'jonathan', 'johana'],
  stage_actors: {
    1: COORDINATORS,
    2: COORDINATORS,
    3: COORDINATORS,
    4: ['iro_physician', 'iro_team_lead'],
    5: ['iro_medical_director', 'iro_team_lead'],
    6: COORDINATORS,
  },
  action_roles: {
    log_intake: COORDINATORS,
    classify: COORDINATORS,
    set_pathway_deadline: COORDINATORS,
    record_conflict_check: COORDINATORS,
    accept_case: COORDINATORS,
    log_records: COORDINATORS,
    generate_referral: COORDINATORS,
    assign_reviewer: COORDINATORS,
    submit_attestation: [...COORDINATORS, 'iro_physician'],
    release_records: COORDINATORS,
    complete_review: ['iro_physician'],
    team_lead_process_check: ['iro_team_lead'],
    md_signoff: ['iro_medical_director'],
    issue_notice: ['iro_medical_director', 'iro_team_lead'],
    record_delivery: COORDINATORS,
    close_case: COORDINATORS,
    record_billing: COORDINATORS,
    revise_after_approval: ['iro_team_lead', 'iro_medical_director'],
    pause_deadline: [],
  },
};
