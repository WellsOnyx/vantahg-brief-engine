import { authorizeLineAccess, type FirewallAuditEvent, type LineActor, type LineScopedRecord } from '@/lib/lines';
import type { LineOfBusiness } from '@/lib/lines/types';
import type { CredentialingService, IroStorageAdapter, MailingAdapter } from './adapters/types';
import { evaluatePartA } from './attestation';
import type { UracIroBaseline } from './config/urac-baseline';
import { assignmentBlockedByCredential, missingPanelApprovers } from './credentialing';
import { calculateDeadline, resolvePinnedSettings, settingsEffectiveAt, type ContractDeadline } from './deadlines';
import { quoteFee, quoteIsConfirmable, resolveFeeSchedule } from './fees';
import {
  IRO_STEPS,
  type BillingEvent,
  type CaseAuditEvent,
  type CaseDocument,
  type DeadlineResult,
  type FeeQuote,
  type FeeSchedule,
  type IroAccessPolicy,
  type IroActionType,
  type IroActor,
  type IroCase,
  type IroClassification,
  type IroFailure,
  type IroOutcome,
  type IroStage,
  type IroStateCode,
  type IroStep,
  type PartAAnswer,
  type PartAQuestion,
  type Receipts,
  type ReviewCategory,
  type ReviewOutcome,
  type SealedSnapshot,
  type SealedVersion,
  type StateSettingsVersion,
} from './types';

export interface IroDeps {
  now: () => string;
  settings: readonly StateSettingsVersion[];
  fees: readonly FeeSchedule[];
  urac: UracIroBaseline;
  policy: IroAccessPolicy;
  credentials: CredentialingService;
  mailing: MailingAdapter;
  storage: IroStorageAdapter;
  audit: FirewallAuditEvent[];
  contract?: ContractDeadline | null;
}

const STAGE_FOR: Record<IroStep, IroStage> = {
  intake: 1,
  classification: 1,
  pathway_deadline: 1,
  conflict_check: 1,
  acceptance: 1,
  records: 2,
  referral: 2,
  reviewer_assignment: 3,
  attestation_gate: 3,
  review: 4,
  md_signoff: 5,
  notice: 5,
  delivery: 6,
  closure: 6,
  billing: 6,
};

const ACTION_STEP: Partial<Record<IroActionType, IroStep>> = {
  log_intake: 'intake',
  classify: 'classification',
  set_pathway_deadline: 'pathway_deadline',
  record_conflict_check: 'conflict_check',
  clear_conflict: 'conflict_check',
  accept_case: 'acceptance',
  log_records: 'records',
  generate_referral: 'referral',
  assign_reviewer: 'reviewer_assignment',
  submit_attestation: 'attestation_gate',
  release_records: 'attestation_gate',
  complete_review: 'review',
  team_lead_process_check: 'md_signoff',
  md_signoff: 'md_signoff',
  issue_notice: 'notice',
  record_delivery: 'delivery',
  close_case: 'closure',
  record_billing: 'billing',
};

const STOP_RETRY: Record<string, readonly IroActionType[]> = {
  conflict_unresolved: ['clear_conflict'],
  attestation_yes: ['submit_attestation', 'release_records'],
  attestation_blank: ['submit_attestation', 'release_records'],
  attestation_unsigned: ['submit_attestation', 'release_records'],
  attestation_required: ['submit_attestation', 'release_records'],
  records_need_team_lead: ['log_records'],
  state_not_configured: ['set_pathway_deadline'],
  pathway_not_configured: ['set_pathway_deadline'],
  clock_timestamp_missing: ['set_pathway_deadline'],
  benefit_exclusion_needs_team_lead: ['accept_case'],
  panel_not_activated: ['assign_reviewer'],
  credential_expires_before_due: ['assign_reviewer'],
  credential_inactive: ['assign_reviewer'],
  credential_status_missing: ['assign_reviewer'],
  credential_state_not_licensed: ['assign_reviewer'],
  only_vanta_selects_reviewer: ['assign_reviewer'],
  patient_billing_prohibited: ['record_billing'],
  quote_not_confirmable: ['record_billing'],
};

const MISROUTE = new Set<IroClassification>(['idre', 'um', 'medical_review', 'internal_review']);
const REVIEW_CATEGORIES = new Set<IroClassification>([
  'medical_necessity',
  'experimental_investigational',
  'administrative_legal',
  'combined',
]);

export type IroAction =
  | {
      type: 'log_intake';
      timezone: string;
      arrival_channel: string;
      referring_entity_ref: string;
      original_request_ref: string;
      duplicate?: boolean;
    }
  | { type: 'classify'; category: IroClassification; expedited: boolean; review_question: string }
  | { type: 'set_pathway_deadline' }
  | {
      type: 'record_conflict_check';
      possible: boolean;
      parties: readonly string[];
      prior_line_flags: readonly LineOfBusiness[];
    }
  | { type: 'clear_conflict' }
  | { type: 'accept_case'; benefit_exclusion: boolean }
  | { type: 'log_records'; documents: readonly CaseDocument[]; missing: boolean }
  | { type: 'generate_referral' }
  | { type: 'assign_reviewer'; reviewer_id: string }
  | {
      type: 'submit_attestation';
      signed: boolean;
      answers: Partial<Record<PartAQuestion, PartAAnswer>>;
    }
  | { type: 'release_records' }
  | { type: 'complete_review'; outcome: ReviewOutcome }
  | { type: 'fail_check'; detail: string }
  | { type: 'team_lead_process_check' }
  | { type: 'md_signoff' }
  | { type: 'issue_notice'; at?: string }
  | { type: 'record_delivery'; channel: 'regular' | 'certified'; to_ref: string }
  | { type: 'close_case' }
  | {
      type: 'record_billing';
      specialist_count: number;
      early_closure: boolean;
      payer: 'client' | 'carrier' | 'patient';
    }
  | { type: 'revise_after_approval'; return_to?: IroStep; detail: string }
  | { type: 'pause_deadline' };

export function stageForStep(step: IroStep): IroStage {
  return STAGE_FOR[step];
}

export function previousStep(step: IroStep): IroStep | null {
  const index = IRO_STEPS.indexOf(step);
  if (index <= 0) return null;
  return IRO_STEPS[index - 1];
}

export function iroWorkQueue(cases: readonly IroCase[]): IroCase[] {
  return cases.filter((row) => row.line_of_business === 'IRO' && row.status !== 'routed_out');
}

export function toLineActor(actor: IroActor): LineActor {
  return {
    id: actor.id,
    companies: actor.companies,
    lines: actor.lines,
    case_restricted: actor.case_restricted,
    assigned_case_ids: actor.assigned_case_ids,
    line_wide: actor.line_wide || actor.role === 'iro_team_lead',
  };
}

function asRecord(kase: IroCase): LineScopedRecord {
  return {
    id: kase.id,
    case_id: kase.id,
    company: kase.company,
    line_of_business: kase.line_of_business,
    kind: 'workflow',
  };
}

export function createIroCase(
  input: { id: string; state_code: IroStateCode; receipts: Receipts },
  actor: IroActor,
  deps: IroDeps,
): IroOutcome {
  const kase = blankCase(input);
  return finish(kase, actor, deps, 'create', () => ({ ok: true as const, patch: {} }));
}

function blankCase(input: { id: string; state_code: IroStateCode; receipts: Receipts }): IroCase {
  return {
    id: input.id,
    company: 'VANTA_HG',
    line_of_business: 'IRO',
    synthetic: true,
    version: 1,
    step: 'intake',
    status: 'active',
    stop: null,
    receipts: { ...input.receipts },
    timezone: null,
    arrival_channel: null,
    referring_entity_ref: null,
    original_request_ref: null,
    duplicate: false,
    review_question: null,
    category: null,
    expedited: false,
    state_code: input.state_code,
    pinned_settings_id: null,
    pinned_fee_schedule_id: null,
    deadline: null,
    conflict: null,
    acceptance: null,
    records: { documents: [], missing: false, page_count: 0, released_on_version: null },
    referral: null,
    reviewer_id: null,
    reviewer_selected_by: null,
    attestation: null,
    review: null,
    process_check: null,
    md_signoff: null,
    notice: null,
    delivery: { state: 'pending', channel: null, at: null },
    closure: { closed: false, at: null },
    billing: { quote: null, events: [] },
    versions: [],
    audit: [],
  };
}

export function applyIroAction(kase: IroCase, action: IroAction, actor: IroActor, deps: IroDeps): IroOutcome {
  return finish(kase, actor, deps, action.type, () => reduce(kase, action, actor, deps));
}

function finish(
  kase: IroCase,
  actor: IroActor,
  deps: IroDeps,
  actionName: string,
  run: () => { ok: true; patch: Partial<IroCase> } | { ok: false; code: string; message: string; patch?: Partial<IroCase> },
): IroOutcome {
  const gate = authorizeLineAccess(toLineActor(actor), asRecord(kase), 'write', {
    now: deps.now,
    audit: deps.audit,
  });
  if (!gate.allowed) {
    return audited(kase, actor, deps, actionName, gate.code, gate.message, false, {});
  }
  const result = run();
  if (!result.ok) {
    return audited(kase, actor, deps, actionName, result.code, result.message, false, result.patch ?? {});
  }
  return audited(kase, actor, deps, actionName, 'ok', 'ok', true, result.patch);
}

function audited(
  kase: IroCase,
  actor: IroActor,
  deps: IroDeps,
  actionName: string,
  code: string,
  message: string,
  ok: boolean,
  patch: Partial<IroCase>,
): IroOutcome {
  const next = applyPatch(kase, patch);
  const event: CaseAuditEvent = {
    at: deps.now(),
    actor_id: actor.id,
    action: actionName,
    code,
    step: next.step,
    version: next.version,
  };
  next.audit = [...next.audit, event];
  if (ok) return { ok: true, case: next };
  const failure: IroFailure = { ok: false, code, message, case: next };
  return failure;
}

function applyPatch(kase: IroCase, patch: Partial<IroCase>): IroCase {
  return {
    ...kase,
    receipts: { ...kase.receipts },
    records: {
      ...kase.records,
      documents: kase.records.documents.map((row) => ({ ...row })),
    },
    delivery: { ...kase.delivery },
    closure: { ...kase.closure },
    billing: { quote: kase.billing.quote, events: [...kase.billing.events] },
    versions: [...kase.versions],
    audit: [...kase.audit],
    ...patch,
  };
}

function reduce(
  kase: IroCase,
  action: IroAction,
  actor: IroActor,
  deps: IroDeps,
): { ok: true; patch: Partial<IroCase> } | { ok: false; code: string; message: string; patch?: Partial<IroCase> } {
  if (kase.status === 'routed_out') {
    return { ok: false, code: 'routed_out_of_iro', message: 'This request is off the IRO queue.' };
  }
  if (kase.status === 'stopped' && kase.stop) {
    const allowed = STOP_RETRY[kase.stop.code] ?? [];
    if (!allowed.includes(action.type)) {
      return { ok: false, code: 'stopped', message: kase.stop.message };
    }
  }
  if (!roleAllows(actor, action, kase, deps.policy)) {
    return {
      ok: false,
      code: action.type === 'clear_conflict' ? 'conflict_clearance_denied' : 'role_denied',
      message: 'This role cannot take that action on this stage.',
    };
  }
  if (action.type === 'pause_deadline') {
    return {
      ok: false,
      code: 'deadline_pause_forbidden',
      message: 'Missing records never pause or restart the deadline.',
    };
  }
  if (action.type === 'fail_check') {
    return failCheck(kase, action.detail, deps);
  }
  if (action.type === 'revise_after_approval') {
    return reviseAfterApproval(kase, action, deps);
  }
  const expected = ACTION_STEP[action.type];
  if (expected && kase.step !== expected) {
    return {
      ok: false,
      code: 'wrong_step',
      message: `Cannot skip ahead. Current step is ${kase.step}.`,
    };
  }
  switch (action.type) {
    case 'log_intake':
      return {
        ok: true,
        patch: {
          step: 'classification',
          timezone: action.timezone,
          arrival_channel: action.arrival_channel,
          referring_entity_ref: action.referring_entity_ref,
          original_request_ref: action.original_request_ref,
          duplicate: Boolean(action.duplicate),
        },
      };
    case 'classify':
      return classify(kase, action);
    case 'set_pathway_deadline':
      return setPathway(kase, deps);
    case 'record_conflict_check':
      return recordConflict(action);
    case 'clear_conflict':
      return clearConflict(kase, actor);
    case 'accept_case':
      return acceptCase(action, actor);
    case 'log_records':
      return logRecords(kase, action, actor, deps);
    case 'generate_referral':
      return referral(kase);
    case 'assign_reviewer':
      return assignReviewer(kase, action, actor, deps);
    case 'submit_attestation':
      return submitAttestation(action, deps);
    case 'release_records':
      return releaseRecords(kase);
    case 'complete_review':
      return {
        ok: true,
        patch: {
          step: 'md_signoff',
          review: { outcome: action.outcome, completed_on_version: kase.version },
          process_check: null,
          md_signoff: null,
        },
      };
    case 'team_lead_process_check':
      return {
        ok: true,
        patch: { process_check: { version: kase.version, actor_id: actor.id, passed: true } },
      };
    case 'md_signoff':
      return signOff(kase, actor, deps);
    case 'issue_notice':
      return issueNotice(kase, action, deps);
    case 'record_delivery':
      return deliver(kase, action, deps);
    case 'close_case':
      return {
        ok: true,
        patch: { step: 'billing', closure: { closed: true, at: deps.now() } },
      };
    case 'record_billing':
      return bill(kase, action, deps);
    default:
      return { ok: false, code: 'wrong_step', message: 'Action is not available.' };
  }
}

function roleAllows(actor: IroActor, action: IroAction, kase: IroCase, policy: IroAccessPolicy): boolean {
  if (action.type === 'clear_conflict') {
    if (!actor.clearance_role) return false;
    return policy.conflict_clearance_roles.some(
      (role) => role.toLowerCase() === actor.clearance_role!.toLowerCase(),
    );
  }
  if (action.type === 'fail_check') {
    if (actor.role === 'iro_team_lead') return true;
    return policy.stage_actors[stageForStep(kase.step)].includes(actor.role);
  }
  if (action.type === 'pause_deadline') return true;
  return policy.action_roles[action.type].includes(actor.role);
}

function classify(
  kase: IroCase,
  action: Extract<IroAction, { type: 'classify' }>,
): { ok: true; patch: Partial<IroCase> } | { ok: false; code: string; message: string; patch: Partial<IroCase> } {
  if (MISROUTE.has(action.category)) {
    return {
      ok: false,
      code: 'routed_out_of_iro',
      message: `${action.category} requests are routed out of the IRO queue.`,
      patch: {
        status: 'routed_out',
        category: action.category,
        expedited: action.expedited,
        review_question: action.review_question,
        stop: {
          code: 'routed_out_of_iro',
          message: `${action.category} requests are routed out of the IRO queue.`,
          step: kase.step,
        },
      },
    };
  }
  return {
    ok: true,
    patch: {
      step: 'pathway_deadline',
      category: action.category,
      expedited: action.expedited,
      review_question: action.review_question,
    },
  };
}

function setPathway(
  kase: IroCase,
  deps: IroDeps,
): { ok: true; patch: Partial<IroCase> } | { ok: false; code: string; message: string; patch: Partial<IroCase> } {
  const settings = settingsEffectiveAt(deps.settings, kase.state_code, deps.now());
  if (!settings) {
    return stopped(kase, 'state_not_configured', `${kase.state_code} has no settings row.`);
  }
  const fee = resolveFeeSchedule(deps.fees, deps.now());
  const calculated = calculateDeadline({
    receipts: kase.receipts,
    settings,
    urac: deps.urac,
    contract: deps.contract,
    expedited: kase.expedited,
  });
  if (!calculated.ok) {
    return stopped(kase, calculated.code, calculated.message, {
      pinned_settings_id: settings.id,
      pinned_fee_schedule_id: fee?.id ?? null,
    });
  }
  return {
    ok: true,
    patch: {
      step: 'conflict_check',
      status: 'active',
      stop: null,
      pinned_settings_id: settings.id,
      pinned_fee_schedule_id: fee?.id ?? null,
      deadline: calculated.deadline,
    },
  };
}

function recordConflict(
  action: Extract<IroAction, { type: 'record_conflict_check' }>,
): { ok: true; patch: Partial<IroCase> } | { ok: false; code: string; message: string; patch: Partial<IroCase> } {
  const conflict = {
    possible: action.possible,
    cleared: false,
    cleared_by_role: null,
    parties: action.parties,
    prior_line_flags: action.prior_line_flags,
  };
  if (action.possible) {
    return {
      ok: false,
      code: 'conflict_unresolved',
      message: 'Possible conflict is a STOP until a configured clearance role clears it.',
      patch: {
        status: 'stopped',
        conflict,
        stop: {
          code: 'conflict_unresolved',
          message: 'Possible conflict is a STOP until a configured clearance role clears it.',
          step: 'conflict_check',
        },
      },
    };
  }
  return { ok: true, patch: { step: 'acceptance', conflict } };
}

function clearConflict(
  kase: IroCase,
  actor: IroActor,
): { ok: true; patch: Partial<IroCase> } | { ok: false; code: string; message: string } {
  if (!kase.conflict?.possible) {
    return { ok: false, code: 'wrong_step', message: 'No conflict is waiting for clearance.' };
  }
  return {
    ok: true,
    patch: {
      step: 'acceptance',
      status: 'active',
      stop: null,
      conflict: {
        ...kase.conflict,
        cleared: true,
        cleared_by_role: actor.clearance_role,
      },
    },
  };
}

function acceptCase(
  action: Extract<IroAction, { type: 'accept_case' }>,
  actor: IroActor,
): { ok: true; patch: Partial<IroCase> } | { ok: false; code: string; message: string; patch: Partial<IroCase> } {
  if (action.benefit_exclusion && actor.role !== 'iro_team_lead') {
    return {
      ok: false,
      code: 'benefit_exclusion_needs_team_lead',
      message: 'A possible benefit exclusion stops for the Team Lead.',
      patch: {
        status: 'stopped',
        acceptance: { benefit_exclusion: true },
        stop: {
          code: 'benefit_exclusion_needs_team_lead',
          message: 'A possible benefit exclusion stops for the Team Lead.',
          step: 'acceptance',
        },
      },
    };
  }
  return {
    ok: true,
    patch: {
      step: 'records',
      status: 'active',
      stop: null,
      acceptance: { benefit_exclusion: action.benefit_exclusion },
    },
  };
}

function logRecords(
  kase: IroCase,
  action: Extract<IroAction, { type: 'log_records' }>,
  actor: IroActor,
  deps: IroDeps,
): { ok: true; patch: Partial<IroCase> } | { ok: false; code: string; message: string; patch?: Partial<IroCase> } {
  if (kase.stop?.code === 'records_need_team_lead') {
    if (actor.role !== 'iro_team_lead') {
      return {
        ok: false,
        code: 'records_need_team_lead',
        message: 'Missing or unreadable records stop for the Team Lead. The deadline does not move.',
      };
    }
    return {
      ok: true,
      patch: { step: 'referral', status: 'active', stop: null },
    };
  }
  const documents = action.documents.map((row) => ({ ...row }));
  for (const doc of documents) {
    const stored = deps.storage.putOriginal({
      key: `${kase.id}/${doc.ref}`,
      case_id: kase.id,
      line_of_business: 'IRO',
      bytes: doc.pages,
    });
    if (!stored.ok) {
      return { ok: false, code: stored.code, message: 'Original record is already stored.' };
    }
  }
  const pageCount = documents.reduce((sum, doc) => sum + doc.pages, 0);
  const unreadable = documents.some((doc) => !doc.readable);
  const records = { documents, missing: action.missing, page_count: pageCount, released_on_version: null };
  if ((action.missing || unreadable) && actor.role !== 'iro_team_lead') {
    return {
      ok: false,
      code: 'records_need_team_lead',
      message: 'Missing or unreadable records stop for the Team Lead. The deadline does not move.',
      patch: {
        status: 'stopped',
        records,
        stop: {
          code: 'records_need_team_lead',
          message: 'Missing or unreadable records stop for the Team Lead. The deadline does not move.',
          step: 'records',
        },
      },
    };
  }
  return { ok: true, patch: { step: 'referral', status: 'active', stop: null, records } };
}

function referral(
  kase: IroCase,
): { ok: true; patch: Partial<IroCase> } | { ok: false; code: string; message: string } {
  if (!kase.category || !REVIEW_CATEGORIES.has(kase.category) || !kase.deadline || !kase.review_question) {
    return { ok: false, code: 'referral_incomplete', message: 'Referral Form is missing case fields.' };
  }
  return {
    ok: true,
    patch: {
      step: 'reviewer_assignment',
      referral: {
        case_id: kase.id,
        category: kase.category as ReviewCategory,
        expedited: kase.expedited,
        state_code: kase.state_code,
        pathway: kase.expedited ? 'expedited' : 'standard',
        review_question: kase.review_question,
        document_count: kase.records.documents.length,
        page_count: kase.records.page_count,
        reviewer_due_at: kase.deadline.reviewer_due_at,
        conflict_parties: kase.conflict?.parties ?? [],
      },
    },
  };
}

function assignReviewer(
  kase: IroCase,
  action: Extract<IroAction, { type: 'assign_reviewer' }>,
  actor: IroActor,
  deps: IroDeps,
): { ok: true; patch: Partial<IroCase> } | { ok: false; code: string; message: string; patch?: Partial<IroCase> } {
  if (actor.selector !== 'vanta') {
    return stopped(kase, 'only_vanta_selects_reviewer', 'Only Vanta selects the reviewer.');
  }
  if (!kase.deadline) {
    return { ok: false, code: 'wrong_step', message: 'Deadline is not pinned yet.' };
  }
  const status = deps.credentials.readStatus(action.reviewer_id);
  const blocked = assignmentBlockedByCredential(status, kase.deadline.due_at);
  if (blocked.blocked) {
    return stopped(kase, blocked.code, 'Credential status blocks assignment.');
  }
  if (status && !status.licensed_states.includes(kase.state_code)) {
    return stopped(kase, 'credential_state_not_licensed', 'Credential status does not include this state.');
  }
  const panel = deps.credentials.readPanelActivation(action.reviewer_id);
  const missing = missingPanelApprovers(panel, deps.policy.panel_approvers);
  if (missing.length > 0) {
    return stopped(
      kase,
      'panel_not_activated',
      `Panel activation is missing recorded approvals: ${missing.join(', ')}.`,
    );
  }
  return {
    ok: true,
    patch: {
      step: 'attestation_gate',
      status: 'active',
      stop: null,
      reviewer_id: action.reviewer_id,
      reviewer_selected_by: 'vanta',
    },
  };
}

function submitAttestation(
  action: Extract<IroAction, { type: 'submit_attestation' }>,
  deps: IroDeps,
): { ok: true; patch: Partial<IroCase> } | { ok: false; code: string; message: string; patch: Partial<IroCase> } {
  const result = evaluatePartA({ signed: action.signed, answers: action.answers });
  const attestation = {
    signed: action.signed,
    signed_at: action.signed ? deps.now() : null,
    answers: {
      financial_conflict: action.answers.financial_conflict ?? '',
      familial_conflict: action.answers.familial_conflict ?? '',
      treating_relationship: action.answers.treating_relationship ?? '',
      credential_concern: action.answers.credential_concern ?? '',
    },
    passed: result.passed,
  };
  if (!result.passed) {
    return {
      ok: false,
      code: result.code,
      message: result.message,
      patch: {
        status: 'stopped',
        attestation,
        stop: { code: result.code, message: result.message, step: 'attestation_gate' },
      },
    };
  }
  return {
    ok: true,
    patch: { status: 'active', stop: null, attestation },
  };
}

function releaseRecords(
  kase: IroCase,
): { ok: true; patch: Partial<IroCase> } | { ok: false; code: string; message: string; patch: Partial<IroCase> } {
  if (!kase.attestation?.passed || !kase.attestation.signed) {
    const message = 'No records release until Part A is signed and complete.';
    return {
      ok: false,
      code: 'attestation_required',
      message,
      patch: {
        status: 'stopped',
        stop: { code: 'attestation_required', message, step: 'attestation_gate' },
      },
    };
  }
  return {
    ok: true,
    patch: {
      step: 'review',
      status: 'active',
      stop: null,
      records: {
        ...kase.records,
        documents: kase.records.documents.map((row) => ({ ...row })),
        released_on_version: kase.version,
      },
    },
  };
}

function signOff(
  kase: IroCase,
  actor: IroActor,
  deps: IroDeps,
): { ok: true; patch: Partial<IroCase> } | { ok: false; code: string; message: string } {
  if (!kase.process_check || kase.process_check.version !== kase.version || !kase.process_check.passed) {
    return { ok: false, code: 'process_check_required', message: 'Team Lead process check has not passed on this version.' };
  }
  if (!kase.review || kase.review.completed_on_version !== kase.version) {
    return { ok: false, code: 'wrong_step', message: 'Review on this version is not complete.' };
  }
  return {
    ok: true,
    patch: {
      step: 'notice',
      md_signoff: { version: kase.version, actor_id: actor.id, at: deps.now() },
    },
  };
}

function issueNotice(
  kase: IroCase,
  action: Extract<IroAction, { type: 'issue_notice' }>,
  deps: IroDeps,
): { ok: true; patch: Partial<IroCase> } | { ok: false; code: string; message: string } {
  if (action.at && action.at !== deps.now()) {
    return { ok: false, code: 'backdate_forbidden', message: 'Notice dates cannot be backdated.' };
  }
  if (!kase.md_signoff || kase.md_signoff.version !== kase.version || !kase.review) {
    return { ok: false, code: 'signoff_required', message: 'Notice requires Medical Director sign-off on this version.' };
  }
  const settings = kase.pinned_settings_id
    ? resolvePinnedSettings(deps.settings, kase.pinned_settings_id)
    : null;
  return {
    ok: true,
    patch: {
      step: 'delivery',
      notice: {
        version: kase.version,
        outcome: kase.review.outcome,
        at: deps.now(),
        reviewer_named: false,
        consumer_assistance: settings?.recipients ?? [],
      },
    },
  };
}

function deliver(
  kase: IroCase,
  action: Extract<IroAction, { type: 'record_delivery' }>,
  deps: IroDeps,
): { ok: true; patch: Partial<IroCase> } | { ok: false; code: string; message: string; patch: Partial<IroCase> } {
  const receipt = deps.mailing.send({
    case_id: kase.id,
    channel: action.channel,
    to_ref: action.to_ref,
  });
  if (!receipt.delivered) {
    return {
      ok: false,
      code: 'delivery_failed',
      message: 'Delivery failed. Closure is unchanged.',
      patch: { delivery: { state: 'failed', channel: action.channel, at: receipt.at } },
    };
  }
  return {
    ok: true,
    patch: {
      step: 'closure',
      delivery: { state: 'delivered', channel: action.channel, at: receipt.at },
    },
  };
}

function bill(
  kase: IroCase,
  action: Extract<IroAction, { type: 'record_billing' }>,
  deps: IroDeps,
): { ok: true; patch: Partial<IroCase> } | { ok: false; code: string; message: string; patch?: Partial<IroCase> } {
  const settings = kase.pinned_settings_id
    ? resolvePinnedSettings(deps.settings, kase.pinned_settings_id)
    : null;
  const schedule = resolveFeeSchedule(deps.fees, deps.now(), kase.pinned_fee_schedule_id);
  if (!settings || !schedule || !kase.category || !REVIEW_CATEGORIES.has(kase.category)) {
    return { ok: false, code: 'fee_schedule_missing', message: 'No pinned fee schedule or state row.' };
  }
  const quote: FeeQuote = quoteFee({
    schedule,
    settings,
    category: kase.category as ReviewCategory,
    expedited: kase.expedited,
    specialist_count: action.specialist_count,
    early_closure: action.early_closure,
    payer: action.payer,
  });
  if (!quoteIsConfirmable(quote)) {
    const code = quote.patient_billing_blocked ? 'patient_billing_prohibited' : 'quote_not_confirmable';
    return {
      ok: false,
      code,
      message: 'Quote is tracked and not billed. Flagged or prohibited charges do not post.',
      patch: { billing: { quote, events: kase.billing.events } },
    };
  }
  const event: BillingEvent = {
    id: `${kase.id}-bill-v${kase.version}`,
    at: deps.now(),
    quote_schedule_id: schedule.id,
    amount_cents: quote.billable_total_cents,
    closes_case: false,
  };
  return {
    ok: true,
    patch: { billing: { quote, events: [...kase.billing.events, event] } },
  };
}

function failCheck(
  kase: IroCase,
  detail: string,
  deps: IroDeps,
): { ok: true; patch: Partial<IroCase> } | { ok: false; code: string; message: string } {
  const prev = previousStep(kase.step);
  if (!prev) {
    return { ok: false, code: 'cannot_step_back', message: 'Intake has no previous step.' };
  }
  const sealed = seal(kase, 'failed_check', detail, deps.now());
  const rewound = rewindPatch(kase, prev);
  return {
    ok: true,
    patch: {
      ...rewound,
      version: kase.version + 1,
      step: prev,
      status: 'active',
      stop: null,
      versions: [...kase.versions, sealed],
    },
  };
}

function reviseAfterApproval(
  kase: IroCase,
  action: Extract<IroAction, { type: 'revise_after_approval' }>,
  deps: IroDeps,
): { ok: true; patch: Partial<IroCase> } | { ok: false; code: string; message: string } {
  if (!kase.md_signoff || kase.md_signoff.version !== kase.version) {
    return { ok: false, code: 'signoff_required', message: 'Nothing approved on this version to revise.' };
  }
  const returnTo = action.return_to ?? 'review';
  if (IRO_STEPS.indexOf(returnTo) >= IRO_STEPS.indexOf('md_signoff')) {
    return { ok: false, code: 'wrong_step', message: 'A post-approval change steps back before sign-off.' };
  }
  const sealed = seal(kase, 'post_approval_change', action.detail, deps.now());
  const rewound = rewindPatch(kase, returnTo);
  return {
    ok: true,
    patch: {
      ...rewound,
      version: kase.version + 1,
      step: returnTo,
      status: 'active',
      stop: null,
      versions: [...kase.versions, sealed],
    },
  };
}

function rewindPatch(kase: IroCase, step: IroStep): Partial<IroCase> {
  const index = IRO_STEPS.indexOf(step);
  const patch: Partial<IroCase> = {};
  if (index <= IRO_STEPS.indexOf('review')) patch.review = null;
  if (index <= IRO_STEPS.indexOf('md_signoff')) {
    patch.process_check = null;
    patch.md_signoff = null;
  }
  if (index <= IRO_STEPS.indexOf('notice')) patch.notice = null;
  if (index <= IRO_STEPS.indexOf('delivery')) {
    patch.delivery = { state: 'pending', channel: null, at: null };
  }
  if (index <= IRO_STEPS.indexOf('closure')) patch.closure = { closed: false, at: null };
  if (index <= IRO_STEPS.indexOf('attestation_gate')) {
    patch.attestation = null;
    patch.records = {
      ...kase.records,
      documents: kase.records.documents.map((row) => ({ ...row })),
      released_on_version: null,
    };
  }
  if (index <= IRO_STEPS.indexOf('reviewer_assignment')) {
    patch.reviewer_id = null;
    patch.reviewer_selected_by = null;
  }
  return patch;
}

function seal(kase: IroCase, reason: SealedVersion['reason'], detail: string, at: string): SealedVersion {
  const snapshot: SealedSnapshot = {
    version: kase.version,
    step: kase.step,
    original_request_ref: kase.original_request_ref,
    deadline_due_at: kase.deadline?.due_at ?? null,
    attestation_passed: kase.attestation?.passed ?? false,
    records_released: kase.records.released_on_version,
    review_outcome: kase.review?.outcome ?? null,
    md_signed: kase.md_signoff?.version === kase.version,
  };
  return {
    version: kase.version,
    reason,
    sealed_at: at,
    detail,
    snapshot,
  };
}

function stopped(
  kase: IroCase,
  code: string,
  message: string,
  extra?: Partial<IroCase>,
): { ok: false; code: string; message: string; patch: Partial<IroCase> } {
  return {
    ok: false,
    code,
    message,
    patch: {
      ...extra,
      status: 'stopped',
      stop: { code, message, step: kase.step },
    },
  };
}

/** Exported so tests can show a records gap does not move a pinned due date. */
export function deadlineUnchangedByRecords(before: DeadlineResult, after: IroCase): boolean {
  return after.deadline?.due_at === before.due_at && after.deadline.missing_records_effect === 'none';
}
