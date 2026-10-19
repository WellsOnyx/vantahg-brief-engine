import { describe, expect, it, vi } from 'vitest';
import {
  ATTESTATION_SOURCES,
  CREDENTIAL_LINES,
  CREDENTIALING_RUNTIME,
  IRO_ACTIVATION_APPROVERS,
  MEDICAL_REVIEW_ACTIVATION,
  SAGILITY_ACTIVATION,
  emptyCredentialing,
  evaluateAssignment,
  iroCredentialingFromShared,
  putCredentialItem,
  readRecord,
  readSharedView,
  recordIroApproval,
  type CredentialItemInput,
  type CredentialLine,
  type CredentialingState,
} from '@/lib/credentialing';
import { decideAssistTouch } from '@/lib/idr-assist';
import { evaluateUmBriefEngineAccess } from '@/lib/entitlements/um-brief-engine';
import { applyIroAction, createIroCase, type IroActor, type IroDeps } from '@/lib/iro';
import { stubMailingAdapter, stubStorageAdapter } from '@/lib/iro/adapters/stubs';
import { DEFAULT_IRO_ACCESS_POLICY } from '@/lib/iro/config/access-policy';
import { IRO_FEE_SCHEDULES } from '@/lib/iro/config/fee-schedule';
import { STATE_SETTINGS_REGISTRY } from '@/lib/iro/config/state-settings';
import { URAC_IRO_BASELINE } from '@/lib/iro/config/urac-baseline';
import { assignmentBlockedByCredential, CREDENTIAL_STATUS_FIELDS, isPanelActivated } from '@/lib/iro/credentialing';
import { LINES_OF_BUSINESS, searchLine, type FirewallAuditEvent, type LineActor, type LineScopedRecord } from '@/lib/lines';
import { assertChecklistOperational } from '@/lib/onboarding/checklist';

const AT = '2026-10-19T15:00:00.000Z';
const DUE = '2026-10-31T14:00:00.000Z';
const REVIEWER = 'syn-rev-1';

function item(partial: Partial<CredentialItemInput> & Pick<CredentialItemInput, 'item_id' | 'kind' | 'source'>): CredentialItemInput {
  const vendor = partial.source === 'vendor_attested';
  return {
    reviewer_id: REVIEWER,
    display_token: 'SYN-REV-1',
    label: 'SYN-ITEM',
    state_code: partial.kind === 'license' ? 'OH' : null,
    specialty_code: partial.kind === 'board_certification' ? 'SYN-SPEC-01' : null,
    status: 'active',
    expires_at: '2027-06-01T00:00:00.000Z',
    vendor_ref: vendor ? 'SYN-VENDOR-UNSELECTED' : null,
    ...partial,
  };
}

function seedGood(state = emptyCredentialing()): CredentialingState {
  const license = putCredentialItem(
    state,
    item({ item_id: 'syn-item-license', kind: 'license', source: 'vanta_verified', label: 'SYN-LIC-OH' }),
    AT,
  );
  if (!license.ok) throw new Error(license.code);
  const board = putCredentialItem(
    license.state,
    item({
      item_id: 'syn-item-board',
      kind: 'board_certification',
      source: 'vendor_attested',
      label: 'SYN-BOARD',
      specialty_code: 'SYN-SPEC-01',
    }),
    AT,
  );
  if (!board.ok) throw new Error(board.code);
  return board.state;
}

function activateIro(state: CredentialingState): CredentialingState {
  let current = state;
  for (const approver_id of IRO_ACTIVATION_APPROVERS) {
    const recorded = recordIroApproval(current, { reviewer_id: REVIEWER, approver_id }, AT);
    if (!recorded.ok) throw new Error(recorded.code);
    current = recorded.state;
  }
  return current;
}

function assign(state: CredentialingState, line: CredentialLine, reviewer = REVIEWER) {
  return evaluateAssignment(state, { line, reviewer_id: reviewer, due_at: DUE, state_code: 'OH' }, AT);
}

describe('shared credentialing', () => {
  it('keeps one record and both attestation sources, with decision (f) still open', () => {
    const state = seedGood();
    expect(CREDENTIALING_RUNTIME).toEqual({ vendor: null, live_call: false, source_decision: 'open' });
    expect(ATTESTATION_SOURCES).toEqual(['vanta_verified', 'vendor_attested']);
    expect(state.records).toHaveLength(1);
    expect(readRecord(state, REVIEWER)?.items.map((row) => row.source).sort()).toEqual([
      'vanta_verified',
      'vendor_attested',
    ]);

    const before = readSharedView(state, REVIEWER, AT);
    expect(before?.item_ids.sort()).toEqual(['syn-item-board', 'syn-item-license']);
    expect(before?.sources.sort()).toEqual(['vanta_verified', 'vendor_attested']);

    const again = putCredentialItem(
      state,
      item({ item_id: 'syn-item-license', kind: 'license', source: 'vendor_attested', label: 'SYN-LIC-OH' }),
      AT,
    );
    expect(again.ok).toBe(true);
    if (!again.ok) return;
    expect(again.state.records).toHaveLength(1);
    expect(again.value.items).toHaveLength(2);
    expect(again.value.items.find((row) => row.id === 'syn-item-license')?.source).toBe('vendor_attested');
    expect(readSharedView(again.state, REVIEWER, AT)?.item_ids.sort()).toEqual([
      'syn-item-board',
      'syn-item-license',
    ]);
    for (const line of CREDENTIAL_LINES) {
      expect(readRecord(again.state, REVIEWER)?.reviewer_id).toBe(REVIEWER);
      expect(line === 'IRO' || line === 'MEDICAL_REVIEW' || line === 'SAGILITY').toBe(true);
    }
  });

  it('refuses a per-line copy, a case payload, and a direct identifier', () => {
    const refused = putCredentialItem(
      emptyCredentialing(),
      {
        ...item({ item_id: 'syn-item-license', kind: 'license', source: 'vanta_verified' }),
        case_id: 'iro-syn-oh-0001',
        license_number: 'SECRET-LIC',
        patient_name: 'Synthetic Patient',
      } as CredentialItemInput,
      AT,
    );
    expect(refused.ok).toBe(false);
    if (refused.ok) return;
    expect(refused.code).toBe('phi_or_case_refused');
    expect(refused.state.records).toHaveLength(0);
    expect(JSON.stringify(refused.state.audit)).not.toMatch(/SECRET-LIC|Synthetic Patient|iro-syn-oh-0001/);
    expect(refused.state.audit[0]).toMatchObject({ type: 'credential_write_refused', code: 'phi_or_case_refused' });
  });

  it('does not assume a source when the caller omits a recognized one', () => {
    const refused = putCredentialItem(
      emptyCredentialing(),
      item({ item_id: 'syn-item-license', kind: 'license', source: 'delegated' as 'vanta_verified' }),
      AT,
    );
    expect(refused.ok).toBe(false);
    if (refused.ok) return;
    expect(refused.code).toBe('source_unrecognized');
    expect(refused.state.records).toHaveLength(0);
  });

  it('blocks every consumer when one item lapses, including a fully activated IRO panel', () => {
    const ready = activateIro(seedGood());
    for (const line of CREDENTIAL_LINES) {
      expect(assign(ready, line).ok).toBe(true);
    }

    const lapsed = putCredentialItem(
      ready,
      item({
        item_id: 'syn-item-license',
        kind: 'license',
        source: 'vanta_verified',
        label: 'SYN-LIC-OH',
        status: 'lapsed',
      }),
      AT,
    );
    expect(lapsed.ok).toBe(true);
    if (!lapsed.ok) return;
    let current = lapsed.state;
    for (const line of CREDENTIAL_LINES) {
      const decision = evaluateAssignment(
        current,
        { line, reviewer_id: REVIEWER, due_at: DUE, state_code: 'OH' },
        AT,
      );
      expect(decision.ok).toBe(false);
      if (decision.ok) return;
      expect(decision.code).toBe('credential_lapsed');
      current = decision.state;
    }
    expect(
      current.audit
        .filter((event) => event.code === 'credential_lapsed')
        .map((event) => event.line)
        .sort(),
    ).toEqual([...CREDENTIAL_LINES].sort());
  });

  it('blocks every consumer when an item expires on or before the due date', () => {
    const expired = putCredentialItem(
      activateIro(seedGood()),
      item({
        item_id: 'syn-item-board',
        kind: 'board_certification',
        source: 'vendor_attested',
        label: 'SYN-BOARD',
        specialty_code: 'SYN-SPEC-01',
        status: 'active',
        expires_at: DUE,
      }),
      AT,
    );
    expect(expired.ok).toBe(true);
    if (!expired.ok) return;
    for (const line of CREDENTIAL_LINES) {
      const decision = assign(expired.state, line);
      expect(decision.ok).toBe(false);
      if (decision.ok) return;
      expect(decision.code).toBe('credential_expired');
    }
  });

  it('requires four distinct IRO approvers, refuses self-approval, and audits the decision', () => {
    expect(IRO_ACTIVATION_APPROVERS).toEqual(['santana', 'jonah', 'jonathan', 'johana']);
    expect(IRO_ACTIVATION_APPROVERS).toEqual(DEFAULT_IRO_ACCESS_POLICY.panel_approvers);
    const state = seedGood();

    const self = recordIroApproval(state, { reviewer_id: REVIEWER, approver_id: REVIEWER }, AT);
    expect(self.ok).toBe(false);
    if (self.ok) return;
    expect(self.code).toBe('self_approval');
    expect(self.state.audit.at(-1)).toMatchObject({
      type: 'iro_activation_decision',
      code: 'self_approval',
      line: 'IRO',
      approver_id: REVIEWER,
    });

    const outsider = recordIroApproval(state, { reviewer_id: REVIEWER, approver_id: 'sam' }, AT);
    expect(outsider.ok).toBe(false);
    if (outsider.ok) return;
    expect(outsider.code).toBe('approver_not_on_iro_panel');
    expect(outsider.state.audit.at(-1)?.approver_id).toBeNull();

    const first = recordIroApproval(state, { reviewer_id: REVIEWER, approver_id: 'santana' }, AT);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const duplicate = recordIroApproval(first.state, { reviewer_id: REVIEWER, approver_id: 'Santana' }, AT);
    expect(duplicate.ok).toBe(false);
    if (duplicate.ok) return;
    expect(duplicate.code).toBe('duplicate_approver');

    let current = first.state;
    for (const approver_id of ['jonah', 'jonathan']) {
      const recorded = recordIroApproval(current, { reviewer_id: REVIEWER, approver_id }, AT);
      expect(recorded.ok).toBe(true);
      if (!recorded.ok) return;
      current = recorded.state;
    }
    const early = assign(current, 'IRO');
    expect(early.ok).toBe(false);
    if (early.ok) return;
    expect(early.code).toBe('iro_not_activated');
    expect(early.missing_approver_ids).toEqual(['johana']);
    expect(assign(current, 'MEDICAL_REVIEW').ok).toBe(true);
    expect(assign(current, 'SAGILITY').ok).toBe(true);

    const last = recordIroApproval(current, { reviewer_id: REVIEWER, approver_id: 'johana' }, AT);
    expect(last.ok).toBe(true);
    if (!last.ok) return;
    const allowed = assign(last.state, 'IRO');
    expect(allowed.ok).toBe(true);
    if (!allowed.ok) return;
    expect(allowed.activation).toBe('iro_panel');
    expect(last.state.activations).toHaveLength(1);
    expect(last.value.approvals.map((row) => row.approver_id)).toEqual([
      'santana',
      'jonah',
      'jonathan',
      'johana',
    ]);
  });

  it('leaves Medical Review and Sagility activation counts unset', () => {
    expect(MEDICAL_REVIEW_ACTIVATION.required_approver_count).toBeNull();
    expect(MEDICAL_REVIEW_ACTIVATION.rule_ref).toBe('lib/assignment-engine.ts');
    expect(SAGILITY_ACTIVATION.required_approver_count).toBeNull();
    expect(SAGILITY_ACTIVATION.rule_ref).toBeNull();

    const state = seedGood();
    const med = assign(state, 'MEDICAL_REVIEW');
    const sagility = assign(state, 'SAGILITY');
    expect(med.ok && med.activation).toBe('delegated');
    expect(sagility.ok && sagility.activation).toBe('delegated');
    expect(state.activations).toHaveLength(0);
  });

  it('keeps case lines walled off from the shared record', () => {
    expect(LINES_OF_BUSINESS).toEqual(['IDR', 'IRO', 'MEDICAL_REVIEW']);
    expect(CREDENTIAL_LINES).toContain('SAGILITY');
    const state = seedGood();
    const view = readSharedView(state, REVIEWER, AT);
    expect(view && 'case_id' in view).toBe(false);
    expect(view && 'vendor_ref' in view).toBe(false);
    expect(JSON.stringify(view)).not.toMatch(/case_body|patient_name|license_number/);

    const audit: FirewallAuditEvent[] = [];
    const rows: LineScopedRecord[] = [
      { id: 'idr-syn-1', case_id: 'idr-syn-1', company: 'VANTA_HG', line_of_business: 'IDR', kind: 'case' },
      { id: 'iro-syn-1', case_id: 'iro-syn-1', company: 'VANTA_HG', line_of_business: 'IRO', kind: 'case' },
      { id: 'mr-syn-1', case_id: 'mr-syn-1', company: 'VANTA_HG', line_of_business: 'MEDICAL_REVIEW', kind: 'case' },
    ];
    const iroOnly: LineActor = {
      id: 'syn-coord',
      companies: ['VANTA_HG'],
      lines: ['IRO'],
      case_restricted: false,
      assigned_case_ids: [],
      line_wide: false,
    };
    expect(searchLine(iroOnly, rows, { line: 'MEDICAL_REVIEW' }, { audit, now: () => AT })).toMatchObject({
      ok: false,
      code: 'cross_line',
      rows: [],
    });
    expect(searchLine(iroOnly, rows, { line: 'IDR' }, { audit, now: () => AT }).ok).toBe(false);
    const own = searchLine(iroOnly, rows, { line: 'IRO' }, { audit, now: () => AT });
    expect(own.ok).toBe(true);
    if (own.ok) expect(own.rows.map((row) => row.id)).toEqual(['iro-syn-1']);
    expect(JSON.stringify(state)).not.toMatch(/idr-syn-1|mr-syn-1/);
  });

  it('projects the shared record into the IRO assigner and blocks a lapsed reviewer there too', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const ready = activateIro(seedGood());
    const asOf = AT;
    const service = iroCredentialingFromShared(ready, asOf);
    const status = service.readStatus(REVIEWER);
    expect(status && Object.keys(status).sort()).toEqual([...CREDENTIAL_STATUS_FIELDS].sort());
    expect(JSON.stringify(status)).not.toMatch(/SYN-VENDOR|SYN-LIC|vendor_ref/);
    expect(status?.lines_of_business).toEqual(['IRO', 'MEDICAL_REVIEW']);
    expect(assignmentBlockedByCredential(status, DUE)).toEqual({ blocked: false });
    expect(isPanelActivated(service.readPanelActivation(REVIEWER), IRO_ACTIVATION_APPROVERS)).toBe(true);

    const lapsedWrite = putCredentialItem(
      ready,
      item({
        item_id: 'syn-item-license',
        kind: 'license',
        source: 'vanta_verified',
        label: 'SYN-LIC-OH',
        status: 'lapsed',
      }),
      AT,
    );
    expect(lapsedWrite.ok).toBe(true);
    if (!lapsedWrite.ok) return;
    const lapsedService = iroCredentialingFromShared(lapsedWrite.state, asOf);
    const lapsedStatus = lapsedService.readStatus(REVIEWER);
    expect(assignmentBlockedByCredential(lapsedStatus, DUE).blocked).toBe(true);

    const audit: FirewallAuditEvent[] = [];
    const deps: IroDeps = {
      now: () => AT,
      settings: STATE_SETTINGS_REGISTRY.versions,
      fees: IRO_FEE_SCHEDULES,
      urac: URAC_IRO_BASELINE,
      policy: DEFAULT_IRO_ACCESS_POLICY,
      credentials: lapsedService,
      mailing: stubMailingAdapter(() => AT),
      storage: stubStorageAdapter(),
      audit,
      contract: null,
    };
    const coordinator: IroActor = {
      id: 'syn-coord',
      role: 'iro_coordinator',
      companies: ['VANTA_HG'],
      lines: ['IRO'],
      case_restricted: false,
      assigned_case_ids: [],
      line_wide: false,
      selector: 'vanta',
      clearance_role: null,
    };
    const created = createIroCase(
      {
        id: 'iro-syn-cred-1',
        state_code: 'OH',
        receipts: {
          carrier_receipt_at: '2026-10-01T14:00:00.000Z',
          state_receipt_at: '2026-10-02T16:00:00.000Z',
          vanta_receipt_at: '2026-10-01T18:30:00.000Z',
        },
      },
      coordinator,
      deps,
    );
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    let kase = created.case;
    const take = (action: Parameters<typeof applyIroAction>[1]) => {
      const result = applyIroAction(kase, action, coordinator, deps);
      kase = result.case;
      return result;
    };
    expect(take({
      type: 'log_intake',
      timezone: 'America/New_York',
      arrival_channel: 'synthetic_upload',
      referring_entity_ref: 'SYN-PLAN-OH',
      original_request_ref: 'SYN-REQ-CRED-1',
    }).ok).toBe(true);
    expect(take({
      type: 'classify',
      category: 'medical_necessity',
      expedited: false,
      review_question: 'SYN-Q-CRED-001',
    }).ok).toBe(true);
    expect(take({ type: 'set_pathway_deadline' }).ok).toBe(true);
    expect(take({
      type: 'record_conflict_check',
      possible: false,
      parties: ['SYN-PLAN-OH'],
      prior_line_flags: [],
    }).ok).toBe(true);
    expect(take({ type: 'accept_case', benefit_exclusion: false }).ok).toBe(true);
    expect(take({
      type: 'log_records',
      documents: [{ ref: 'syn-doc-1', pages: 4, readable: true }],
      missing: false,
    }).ok).toBe(true);
    expect(take({ type: 'generate_referral' }).ok).toBe(true);
    const assigned = take({ type: 'assign_reviewer', reviewer_id: REVIEWER });
    expect(assigned.ok).toBe(false);
    if (assigned.ok) return;
    expect(assigned.code).toBe('credential_inactive');
    expect(kase.line_of_business).toBe('IRO');
    expect(kase.reviewer_id).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();

    expect(decideAssistTouch({ label: 'Submit' })).toMatchObject({ mayTouch: false, submitted: false });
    expect(
      evaluateUmBriefEngineAccess({ vanta_med_review_contract: true, med_review_provider: 'third_party' }).allowed,
    ).toBe(false);
    expect(assertChecklistOperational().ok).toBe(true);
  });
});
