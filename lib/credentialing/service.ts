import { IRO_ACTIVATION_APPROVERS } from './config';
import { isIsoStamp, itemInputRefusal } from './guard';
import type {
  AssignmentEvaluation,
  AttestationSource,
  CredentialAuditEvent,
  CredentialDenied,
  CredentialItem,
  CredentialItemInput,
  CredentialLine,
  CredentialMutation,
  CredentialingState,
  IroActivation,
  SharedCredentialRecord,
  SharedCredentialView,
} from './types';

const MESSAGES: Record<string, string> = {
  not_synthetic: 'Credential fields must be synthetic tokens.',
  phi_or_case_refused: 'Credential records do not store case data or direct identifiers.',
  field_refused: 'That field is not part of the shared credential record.',
  item_unrecognized: 'Credential item kind or status is not recognized.',
  source_unrecognized: 'Each item names vanta_verified or vendor_attested. Neither is assumed.',
  state_code_required: 'A license item needs a two-letter state code.',
  specialty_code_required: 'A board item needs a synthetic specialty code.',
  vendor_ref_not_allowed: 'A Vanta-verified item does not carry a vendor ref.',
  vendor_ref_required: 'A vendor-attested item needs a synthetic vendor ref. No vendor is selected.',
  clock_invalid: 'Credential timestamps use UTC ISO-8601.',
  credential_record_missing: 'This reviewer has no shared credential record.',
  credential_lapsed: 'A lapsed credential blocks assignment on every line.',
  credential_expired: 'An expired credential blocks assignment on every line.',
  credential_restricted: 'A restricted credential blocks assignment on every line.',
  credential_state_not_licensed: 'The shared record has no active license for this state.',
  self_approval: 'A reviewer cannot approve their own IRO activation.',
  approver_not_on_iro_panel: 'IRO activation only records the four configured approvers.',
  duplicate_approver: 'IRO activation counts each approver once.',
  approver_required: 'IRO activation needs an approver id.',
  iro_not_activated: 'IRO assignment waits for four distinct approvers.',
  assignable: 'Shared credential record allows assignment.',
};

function message(code: string): string {
  return MESSAGES[code] ?? 'Credentialing request was refused.';
}

/** Audit rows keep synthetic ids and the four IRO approver ids. Other strings are dropped. */
function auditableActor(value: string | null | undefined): string | null {
  if (!value) return null;
  const id = value.trim().toLowerCase();
  if (/^syn-[a-z0-9-]{1,64}$/.test(id)) return id;
  if (IRO_ACTIVATION_APPROVERS.some((role) => role.toLowerCase() === id)) return id;
  return null;
}

function deny(state: CredentialingState, code: string): CredentialDenied {
  return { ok: false, state, code, message: message(code) };
}

function audit(
  state: CredentialingState,
  event: CredentialAuditEvent,
): CredentialingState {
  return {
    records: state.records,
    activations: state.activations,
    audit: [...state.audit, event],
  };
}

export function emptyCredentialing(): CredentialingState {
  return { records: [], activations: [], audit: [] };
}

export function readRecord(
  state: CredentialingState,
  reviewerId: string,
): SharedCredentialRecord | null {
  return state.records.find((record) => record.reviewer_id === reviewerId) ?? null;
}

function blocksAt(item: CredentialItem, at: string): boolean {
  if (item.status === 'expired' || item.status === 'lapsed' || item.status === 'restricted') return true;
  return Boolean(item.expires_at && item.expires_at <= at);
}

function assignmentBlock(item: CredentialItem, dueAt: string): string | null {
  if (item.status === 'lapsed') return 'credential_lapsed';
  if (item.status === 'restricted') return 'credential_restricted';
  if (item.status === 'expired') return 'credential_expired';
  if (item.expires_at && item.expires_at <= dueAt) return 'credential_expired';
  return null;
}

function sourcesOf(items: readonly CredentialItem[]): AttestationSource[] {
  const found = new Set<AttestationSource>();
  for (const item of items) found.add(item.source);
  return [...found];
}

export function readSharedView(
  state: CredentialingState,
  reviewerId: string,
  asOf: string,
): SharedCredentialView | null {
  const record = readRecord(state, reviewerId);
  if (!record) return null;
  const openItems = record.items.filter((item) => !blocksAt(item, asOf));
  const expiries = record.items
    .map((item) => item.expires_at)
    .filter((value): value is string => Boolean(value))
    .sort();
  return {
    reviewer_id: record.reviewer_id,
    active: record.items.length > 0 && openItems.length === record.items.length,
    specialty_codes: [...new Set(openItems.map((item) => item.specialty_code).filter((value): value is string => Boolean(value)))],
    licensed_states: [
      ...new Set(
        openItems
          .filter((item) => item.kind === 'license' && item.state_code)
          .map((item) => item.state_code as string),
      ),
    ],
    board_certified: openItems.some((item) => item.kind === 'board_certification'),
    expires_at: expiries[0] ?? null,
    sources: sourcesOf(record.items),
    item_ids: record.items.map((item) => item.id),
  };
}

export function putCredentialItem(
  state: CredentialingState,
  input: CredentialItemInput,
  at: string,
): CredentialMutation<SharedCredentialRecord> {
  if (!isIsoStamp(at)) return deny(state, 'clock_invalid');
  const refusal = itemInputRefusal(input);
  if (refusal) {
    return deny(
      audit(state, {
        type: 'credential_write_refused',
        at,
        reviewer_id: auditableActor(typeof input.reviewer_id === 'string' ? input.reviewer_id : null),
        line: null,
        approver_id: null,
        code: refusal,
        source: null,
        item_kind: null,
      }),
      refusal,
    );
  }

  const item: CredentialItem = {
    id: input.item_id,
    kind: input.kind,
    label: input.label,
    state_code: input.state_code,
    specialty_code: input.specialty_code,
    status: input.status,
    expires_at: input.expires_at,
    source: input.source,
    vendor_ref: input.vendor_ref,
    attested_at: at,
  };
  const existing = readRecord(state, input.reviewer_id);
  const items = existing
    ? [...existing.items.filter((row) => row.id !== item.id), item]
    : [item];
  const record: SharedCredentialRecord = {
    reviewer_id: input.reviewer_id,
    display_token: input.display_token,
    items,
    created_at: existing?.created_at ?? at,
    updated_at: at,
  };
  const records = existing
    ? state.records.map((row) => (row.reviewer_id === record.reviewer_id ? record : row))
    : [...state.records, record];
  return {
    ok: true,
    state: audit(
      { records, activations: state.activations, audit: state.audit },
      {
        type: 'credential_item_recorded',
        at,
        reviewer_id: record.reviewer_id,
        line: null,
        approver_id: null,
        code: 'item_recorded',
        source: item.source,
        item_kind: item.kind,
      },
    ),
    value: record,
  };
}

function readActivation(state: CredentialingState, reviewerId: string): IroActivation | null {
  return state.activations.find((row) => row.reviewer_id === reviewerId) ?? null;
}

export function recordIroApproval(
  state: CredentialingState,
  input: { reviewer_id: string; approver_id: string },
  at: string,
): CredentialMutation<IroActivation> {
  if (!isIsoStamp(at)) return deny(state, 'clock_invalid');
  const approverId = input.approver_id.trim().toLowerCase();
  const base = {
    type: 'iro_activation_decision' as const,
    at,
    reviewer_id: auditableActor(input.reviewer_id),
    line: 'IRO' as const,
    approver_id: auditableActor(approverId),
    source: null,
    item_kind: null,
  };

  let code: string | null = null;
  if (!approverId) code = 'approver_required';
  else if (!readRecord(state, input.reviewer_id)) code = 'credential_record_missing';
  else if (approverId === input.reviewer_id.trim().toLowerCase()) code = 'self_approval';
  else if (!IRO_ACTIVATION_APPROVERS.some((role) => role.toLowerCase() === approverId)) {
    code = 'approver_not_on_iro_panel';
  } else if (readActivation(state, input.reviewer_id)?.approvals.some((row) => row.approver_id === approverId)) {
    code = 'duplicate_approver';
  }

  if (code) {
    return deny(audit(state, { ...base, code }), code);
  }

  const prior = readActivation(state, input.reviewer_id);
  const activation: IroActivation = {
    reviewer_id: input.reviewer_id,
    line: 'IRO',
    approvals: [...(prior?.approvals ?? []), { approver_id: approverId, recorded_at: at }],
  };
  const activations = prior
    ? state.activations.map((row) => (row.reviewer_id === activation.reviewer_id ? activation : row))
    : [...state.activations, activation];
  return {
    ok: true,
    state: audit(
      { records: state.records, activations, audit: state.audit },
      { ...base, code: 'recorded' },
    ),
    value: activation,
  };
}

export function missingIroApprovers(activation: IroActivation | null): string[] {
  const recorded = new Set((activation?.approvals ?? []).map((row) => row.approver_id));
  return IRO_ACTIVATION_APPROVERS.filter((role) => !recorded.has(role.toLowerCase()));
}

export function iroActivationComplete(activation: IroActivation | null): boolean {
  const ids = activation?.approvals.map((row) => row.approver_id) ?? [];
  return new Set(ids).size === IRO_ACTIVATION_APPROVERS.length && missingIroApprovers(activation).length === 0;
}

function denyAssignment(
  state: CredentialingState,
  input: { line: CredentialLine; reviewer_id: string; due_at: string },
  at: string,
  code: string,
  missing: readonly string[] = [],
): AssignmentEvaluation {
  return {
    ok: false,
    state: audit(state, {
      type: 'credential_assignment_denied',
      at,
      reviewer_id: auditableActor(input.reviewer_id),
      line: input.line,
      approver_id: null,
      code,
      source: null,
      item_kind: null,
    }),
    code,
    message: message(code),
    line: input.line,
    reviewer_id: input.reviewer_id,
    missing_approver_ids: missing,
  };
}

/**
 * One gate for IRO, Medical Review, and Sagility.
 * A lapsed item blocks every line. IRO also waits on its own four approvers.
 * Medical Review and Sagility keep pluggable activation and do not count approvers here.
 */
export function evaluateAssignment(
  state: CredentialingState,
  input: { line: CredentialLine; reviewer_id: string; due_at: string; state_code?: string | null },
  at: string,
): AssignmentEvaluation {
  if (!isIsoStamp(at) || !isIsoStamp(input.due_at)) {
    return denyAssignment(state, input, at, 'clock_invalid');
  }
  const record = readRecord(state, input.reviewer_id);
  if (!record || record.items.length === 0) {
    return denyAssignment(state, input, at, 'credential_record_missing');
  }
  for (const item of record.items) {
    const block = assignmentBlock(item, input.due_at);
    if (block) return denyAssignment(state, input, at, block);
  }
  if (input.state_code) {
    const licensed = record.items.some(
      (item) => item.kind === 'license' && item.state_code === input.state_code && assignmentBlock(item, input.due_at) === null,
    );
    if (!licensed) return denyAssignment(state, input, at, 'credential_state_not_licensed');
  }
  if (input.line === 'IRO') {
    const activation = readActivation(state, input.reviewer_id);
    const missing = missingIroApprovers(activation);
    if (missing.length > 0 || !iroActivationComplete(activation)) {
      return denyAssignment(state, input, at, 'iro_not_activated', missing);
    }
  }
  return {
    ok: true,
    state,
    code: 'assignable',
    line: input.line,
    reviewer_id: input.reviewer_id,
    activation: input.line === 'IRO' ? 'iro_panel' : 'delegated',
    sources: sourcesOf(record.items),
  };
}
