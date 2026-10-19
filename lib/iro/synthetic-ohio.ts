import type { FirewallAuditEvent } from '@/lib/lines';
import { stubCredentialingService, stubEmrAdapter, stubMailingAdapter, stubPhoneAdapter, stubStorageAdapter } from './adapters/stubs';
import { DEFAULT_IRO_ACCESS_POLICY } from './config/access-policy';
import { IRO_FEE_SCHEDULES } from './config/fee-schedule';
import { STATE_SETTINGS_REGISTRY } from './config/state-settings';
import { URAC_IRO_BASELINE } from './config/urac-baseline';
import type { IroActor, IroCase, PanelApproval, PartAAnswer, PartAQuestion } from './types';
import { applyIroAction, createIroCase, type IroAction, type IroDeps } from './workflow';

export const SYNTHETIC_OHIO_NOW = '2026-10-19T15:00:00.000Z';
export const SYNTHETIC_OHIO_CASE_ID = 'iro-syn-oh-0001';

const RECEIPTS = {
  carrier_receipt_at: '2026-10-01T14:00:00.000Z',
  state_receipt_at: '2026-10-02T16:00:00.000Z',
  vanta_receipt_at: '2026-10-01T18:30:00.000Z',
};

const NO: Record<PartAQuestion, PartAAnswer> = {
  financial_conflict: 'no',
  familial_conflict: 'no',
  treating_relationship: 'no',
  credential_concern: 'no',
};

function actor(partial: Pick<IroActor, 'id' | 'role'> & Partial<IroActor>): IroActor {
  return {
    companies: ['VANTA_HG'],
    lines: ['IRO'],
    case_restricted: false,
    assigned_case_ids: [],
    line_wide: partial.role === 'iro_team_lead',
    selector: 'vanta',
    clearance_role: null,
    ...partial,
  };
}

export interface OhioTranscriptRow {
  action: string;
  ok: boolean;
  code: string;
  step: IroCase['step'];
  version: number;
}

export interface OhioWalkthrough {
  case: IroCase;
  transcript: OhioTranscriptRow[];
  stops: string[];
  dueAfterPathway: string;
  audit: FirewallAuditEvent[];
  emrConfigured: false;
  phoneCaseId: string;
  mailingLiveCall: false;
}

export function runSyntheticOhioWalkthrough(): OhioWalkthrough {
  const audit: FirewallAuditEvent[] = [];
  const approvals: PanelApproval[] = [];
  const credentials = stubCredentialingService({
    'syn-reviewer-1': {
      status: {
        physician_id: 'syn-reviewer-1',
        active: true,
        specialty_codes: ['SYN-SPEC-01'],
        licensed_states: ['OH'],
        board_certified: true,
        expires_at: '2027-06-01T00:00:00.000Z',
        lines_of_business: ['IRO'],
        license_number: 'DO-NOT-PROJECT',
      },
      panel: { physician_id: 'syn-reviewer-1', approvals },
    },
    'syn-reviewer-expired': {
      status: {
        physician_id: 'syn-reviewer-expired',
        active: true,
        specialty_codes: ['SYN-SPEC-01'],
        licensed_states: ['OH'],
        board_certified: true,
        expires_at: '2026-10-02T00:00:00.000Z',
        lines_of_business: ['IRO'],
      },
      panel: {
        physician_id: 'syn-reviewer-expired',
        approvals: DEFAULT_IRO_ACCESS_POLICY.panel_approvers.map((approver_role) => ({
          approver_role,
          recorded_at: SYNTHETIC_OHIO_NOW,
          recorded: true,
        })),
      },
    },
  });
  const mailing = stubMailingAdapter(() => SYNTHETIC_OHIO_NOW);
  const phone = stubPhoneAdapter();
  const emr = stubEmrAdapter();
  const deps: IroDeps = {
    now: () => SYNTHETIC_OHIO_NOW,
    settings: STATE_SETTINGS_REGISTRY.versions,
    fees: IRO_FEE_SCHEDULES,
    urac: URAC_IRO_BASELINE,
    policy: DEFAULT_IRO_ACCESS_POLICY,
    credentials,
    mailing,
    storage: stubStorageAdapter(),
    audit,
    contract: null,
  };
  const coordinator = actor({ id: 'syn-coord', role: 'iro_coordinator' });
  const teamLead = actor({ id: 'syn-lead', role: 'iro_team_lead' });
  const santana = actor({ id: 'syn-santana', role: 'iro_team_lead', clearance_role: 'santana' });
  const physician = actor({ id: 'syn-phys', role: 'iro_physician' });
  const medicalDirector = actor({ id: 'syn-md', role: 'iro_medical_director' });
  const external = actor({ id: 'syn-ext', role: 'iro_coordinator', selector: 'external' });

  const transcript: OhioTranscriptRow[] = [];
  const created = createIroCase(
    { id: SYNTHETIC_OHIO_CASE_ID, state_code: 'OH', receipts: RECEIPTS },
    coordinator,
    deps,
  );
  if (!created.ok) {
    throw new Error(`synthetic case was not created: ${created.code}`);
  }
  let kase = created.case;

  const take = (action: IroAction, who: IroActor) => {
    const result = applyIroAction(kase, action, who, deps);
    kase = result.case;
    transcript.push({
      action: action.type,
      ok: result.ok,
      code: result.ok ? 'ok' : result.code,
      step: kase.step,
      version: kase.version,
    });
    return result;
  };

  take({ type: 'set_pathway_deadline' }, coordinator);
  take(
    {
      type: 'log_intake',
      timezone: 'America/New_York',
      arrival_channel: 'synthetic_upload',
      referring_entity_ref: 'SYN-PLAN-OH',
      original_request_ref: 'SYN-REQ-OH-0001',
    },
    coordinator,
  );
  take(
    {
      type: 'classify',
      category: 'medical_necessity',
      expedited: false,
      review_question: 'SYN-Q-OH-001',
    },
    coordinator,
  );
  take({ type: 'set_pathway_deadline' }, coordinator);
  const dueAfterPathway = kase.deadline?.due_at;
  if (!dueAfterPathway) throw new Error('Ohio deadline did not pin');
  take({ type: 'pause_deadline' }, coordinator);
  take(
    {
      type: 'record_conflict_check',
      possible: true,
      parties: ['SYN-PLAN-OH', 'SYN-PROV-001'],
      prior_line_flags: ['MEDICAL_REVIEW'],
    },
    coordinator,
  );
  take({ type: 'clear_conflict' }, coordinator);
  take({ type: 'clear_conflict' }, santana);
  take({ type: 'accept_case', benefit_exclusion: false }, coordinator);
  take(
    {
      type: 'log_records',
      documents: [{ ref: 'syn-doc-1', pages: 12, readable: true }],
      missing: true,
    },
    coordinator,
  );
  take(
    {
      type: 'log_records',
      documents: [{ ref: 'syn-doc-1', pages: 12, readable: true }],
      missing: true,
    },
    teamLead,
  );
  take({ type: 'generate_referral' }, coordinator);
  take({ type: 'assign_reviewer', reviewer_id: 'syn-reviewer-1' }, external);
  take({ type: 'assign_reviewer', reviewer_id: 'syn-reviewer-expired' }, coordinator);
  const approvers = DEFAULT_IRO_ACCESS_POLICY.panel_approvers;
  take({ type: 'assign_reviewer', reviewer_id: 'syn-reviewer-1' }, coordinator);
  for (const approver_role of approvers.slice(0, -1)) {
    approvals.push({ approver_role, recorded_at: SYNTHETIC_OHIO_NOW, recorded: true });
    take({ type: 'assign_reviewer', reviewer_id: 'syn-reviewer-1' }, coordinator);
  }
  approvals.push({
    approver_role: approvers[approvers.length - 1],
    recorded_at: SYNTHETIC_OHIO_NOW,
    recorded: true,
  });
  take({ type: 'assign_reviewer', reviewer_id: 'syn-reviewer-1' }, coordinator);
  take({ type: 'release_records' }, coordinator);
  take(
    {
      type: 'submit_attestation',
      signed: true,
      answers: { ...NO, financial_conflict: 'yes' },
    },
    physician,
  );
  take({ type: 'release_records' }, coordinator);
  take({ type: 'submit_attestation', signed: true, answers: NO }, physician);
  take({ type: 'release_records' }, coordinator);
  take({ type: 'complete_review', outcome: 'upheld' }, physician);
  take({ type: 'fail_check', detail: 'part_b_check_failed' }, teamLead);
  take({ type: 'complete_review', outcome: 'overturned' }, physician);
  take({ type: 'md_signoff' }, medicalDirector);
  take({ type: 'team_lead_process_check' }, teamLead);
  take({ type: 'md_signoff' }, medicalDirector);
  take({ type: 'issue_notice', at: '2020-01-01T00:00:00.000Z' }, medicalDirector);
  take({ type: 'issue_notice' }, medicalDirector);
  take({ type: 'record_delivery', channel: 'certified', to_ref: 'SYN-RECIPIENT-OH' }, coordinator);
  take({ type: 'close_case' }, coordinator);
  take(
    { type: 'record_billing', specialist_count: 1, early_closure: false, payer: 'client' },
    coordinator,
  );

  const pulled = emr.pull({ case_ref: kase.id });
  const logged = phone.logMessage({ case_id: kase.id, urgent: true, token: 'SYN-CALL-1' });

  return {
    case: kase,
    transcript,
    stops: transcript.filter((row) => !row.ok).map((row) => row.code),
    dueAfterPathway,
    audit,
    emrConfigured: pulled.configured,
    phoneCaseId: logged.case_id,
    mailingLiveCall: mailing.live_call,
  };
}
