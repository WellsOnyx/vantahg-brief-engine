import { randomUUID } from 'crypto';
import {
  getMemoryBillableEventLedger,
  recordBillableEventsForSign,
  type BillableEventLedger,
} from '@/lib/billing/events';
import {
  buildSyntheticBriefContent,
  mintSpineBrief,
  resolveExistingBriefContent,
} from './briefs';
import { normalizeDenyReason } from './deny-reasons';
import { buildDeterminationPackage } from './determination-package';
import { hashTransitionPayload } from './hash';
import { sortMdQueue } from './md-queue';
import { applyListFilters } from './rbac';
import { evaluateRules } from './rules-engine';
import { assertTransition, canTransition } from './state-machine';
import type { CaseSpineStore } from './store';
import {
  BriefRequiredError,
  CaseNotFoundError,
  DEFAULT_CLIENT_CONFIG,
  DETERMINATIONS,
  IllegalSignError,
  type AttachBriefInput,
  type AuditEvent,
  type AuthRule,
  type AuthRuleId,
  type CanonicalCase,
  type CaseOpsPatch,
  type CreateCaseInput,
  type DeterminationPackage,
  type ListCasesFilters,
  type RuleEvalContext,
  type RuleEvaluation,
  type SignDeterminationInput,
  type SpineBrief,
  type SpineViewer,
  type TransitionInput,
} from './types';

export interface CreateCaseResult {
  case: CanonicalCase;
  evaluations: RuleEvaluation[];
  audit: AuditEvent[];
}

export interface TransitionResult {
  case: CanonicalCase;
  audit: AuditEvent;
}

export interface AttachBriefResult {
  case: CanonicalCase;
  brief: SpineBrief;
  audit: AuditEvent;
}

export interface SignDeterminationResult {
  case: CanonicalCase;
  package: DeterminationPackage;
  brief: SpineBrief;
  audit: AuditEvent[];
}

export class CaseSpineService {
  constructor(
    private readonly store: CaseSpineStore,
    private readonly now: () => Date = () => new Date(),
    private readonly billing: BillableEventLedger = getMemoryBillableEventLedger(),
  ) {}

  async createCase(input: CreateCaseInput, actor = 'system'): Promise<CreateCaseResult> {
    const now = this.now();
    const receivedAt = input.intake?.received_at || now.toISOString();
    const priority = input.priority ?? input.intake?.urgency ?? 'standard';
    const type = input.type ?? 'prior_auth';
    const slaHours =
      priority === 'urgent' || priority === 'expedited'
        ? input.client_config?.sla_hours_urgent ?? DEFAULT_CLIENT_CONFIG.sla_hours_urgent
        : input.client_config?.sla_hours_standard ?? DEFAULT_CLIENT_CONFIG.sla_hours_standard;

    const caseId = randomUUID();
    const created: CanonicalCase = {
      case_id: caseId,
      case_number: `VUM-SPINE-${caseId.slice(0, 8).toUpperCase()}`,
      client_id: input.client_id,
      external_id: input.external_id ?? input.intake?.external_id ?? null,
      type,
      state: 'received',
      lane: null,
      priority,
      sla_due_at: new Date(new Date(receivedAt).getTime() + slaHours * 3600_000).toISOString(),
      sla_status: 'ok',
      sla_clock: 'running',
      sla_paused_at: null,
      received_at: receivedAt,
      determined_at: null,
      determination: null,
      signer_id: null,
      brief_id: null,
      packet_storage_keys: input.packet_storage_keys ?? [],
      parent_case_id: input.parent_case_id ?? null,
      billable_event_id: null,
      fanout_status: 'not_started',
      cm_flags: [],
      audit_cursor: 0,
      open_tasks: [],
      duplicate_of_case_id: null,
      signed_rationale: null,
      deny_reason_code: null,
      determination_package_version: null,
      determination_package_key: null,
      fanout_stub: null,
      billable_event_stub: null,
      intake: {
        ...input.intake,
        external_id: input.external_id ?? input.intake?.external_id ?? null,
        urgency: input.intake?.urgency ?? priority,
        received_at: receivedAt,
        clinicals_pointer:
          input.intake?.clinicals_pointer ??
          (input.packet_storage_keys && input.packet_storage_keys[0]
            ? input.packet_storage_keys[0]
            : null),
      },
    };

    await this.store.insertCase(created);
    const createAudit = await this.writeAudit({
      event_id: randomUUID(),
      case_id: created.case_id,
      at: now.toISOString(),
      actor,
      rule_id: null,
      from_state: null,
      to_state: 'received',
      note: 'case created',
      payload_hash: hashTransitionPayload(created, 'received'),
    });

    const evalCtx: RuleEvalContext = {
      benefit_type: created.intake.benefit_type,
      urgent: priority === 'urgent' || priority === 'expedited',
      inbound_is_appeal: type === 'first_level_appeal',
      parent_case_id: created.parent_case_id ?? undefined,
      client_config: { client_id: input.client_id, ...DEFAULT_CLIENT_CONFIG, ...input.client_config },
    };

    const evaluated = await this.evaluateAndPersist(created, evalCtx, actor);
    return {
      case: evaluated.case,
      evaluations: evaluated.evaluations,
      audit: [createAudit, ...evaluated.audit],
    };
  }

  async transitionCase(
    caseId: string,
    input: TransitionInput,
    actor = 'system',
  ): Promise<TransitionResult> {
    const current = await this.requireCase(caseId);
    assertTransition(current.state, input.to_state);

    const now = this.now();
    const next: CanonicalCase = {
      ...current,
      state: input.to_state,
      packet_storage_keys: [...current.packet_storage_keys],
      cm_flags: input.cm_flags ? [...input.cm_flags] : [...current.cm_flags],
      open_tasks: [...current.open_tasks],
      intake: { ...current.intake },
    };

    if (input.determination !== undefined) next.determination = input.determination;
    if (input.signer_id !== undefined) next.signer_id = input.signer_id;
    if (input.brief_id !== undefined) next.brief_id = input.brief_id;
    if (input.billable_event_id !== undefined) next.billable_event_id = input.billable_event_id;
    if (input.fanout_status !== undefined) next.fanout_status = input.fanout_status;
    if (input.open_tasks !== undefined) next.open_tasks = [...input.open_tasks];

    if (input.to_state === 'md_queue' && !next.brief_id) {
      throw new BriefRequiredError(caseId, 'md_queue');
    }
    if (input.to_state === 'determined') {
      if (!next.brief_id) {
        throw new BriefRequiredError(caseId, 'determined');
      }
      if (!next.determination || !next.signer_id) {
        throw new IllegalSignError(
          'md_sign_required',
          'MD sign required: determination and signer_id must be set (no silent auto-approve)',
          caseId,
        );
      }
    }

    if (input.to_state === 'determined') {
      next.determined_at = now.toISOString();
      next.sla_clock = 'stopped';
      if (!next.fanout_status || next.fanout_status === 'not_started') {
        next.fanout_status = 'pending';
      }
    }
    if (input.to_state === 'cancelled_by_client' || input.to_state === 'withdrawn' || input.to_state === 'closed') {
      next.sla_clock = 'stopped';
    }
    if (input.to_state === 'intake_incomplete') {
      next.sla_clock = 'paused';
      next.sla_paused_at = now.toISOString();
    }
    if (input.to_state === 'routed' && current.sla_clock === 'paused' && current.sla_paused_at) {
      const pausedMs = now.getTime() - new Date(current.sla_paused_at).getTime();
      if (next.sla_due_at && pausedMs > 0) {
        next.sla_due_at = new Date(new Date(next.sla_due_at).getTime() + pausedMs).toISOString();
      }
      next.sla_clock = 'running';
      next.sla_paused_at = null;
    }

    next.audit_cursor = current.audit_cursor + 1;
    await this.store.updateCase(next);

    const audit = await this.writeAudit({
      event_id: randomUUID(),
      case_id: next.case_id,
      at: now.toISOString(),
      actor,
      rule_id: null,
      from_state: current.state,
      to_state: next.state,
      note: input.note ?? `transition ${current.state} → ${next.state}`,
      payload_hash: hashTransitionPayload(current, next.state, input),
    });

    return { case: next, audit };
  }

  async getCase(caseId: string, viewer?: SpineViewer): Promise<CanonicalCase> {
    const c = await this.requireCase(caseId);
    if (!viewer) return c;
    const [visible] = applyListFilters([c], viewer, {});
    if (!visible) throw new CaseNotFoundError(caseId);
    return visible;
  }

  async listCases(viewer: SpineViewer, filters: ListCasesFilters = {}): Promise<CanonicalCase[]> {
    const all = await this.store.listCases();
    const filtered = applyListFilters(all, viewer, filters);
    if (viewer.role === 'med_review' || filters.state === 'md_queue') {
      return sortMdQueue(filtered);
    }
    return filtered.sort((a, b) => b.received_at.localeCompare(a.received_at));
  }

  async listMdQueue(viewer: SpineViewer): Promise<CanonicalCase[]> {
    return this.listCases(viewer, { state: 'md_queue' });
  }

  async getBrief(caseId: string): Promise<SpineBrief | null> {
    const c = await this.requireCase(caseId);
    if (c.brief_id) {
      const byId = await this.store.getBrief(c.brief_id);
      if (byId) return byId;
    }
    return this.store.getBriefForCase(caseId);
  }

  async getDeterminationPackage(caseId: string, version?: number): Promise<DeterminationPackage | null> {
    await this.requireCase(caseId);
    return this.store.getPackage(caseId, version);
  }

  async attachBrief(
    caseId: string,
    input: AttachBriefInput = {},
    actor = 'system',
  ): Promise<AttachBriefResult> {
    const current = await this.requireCase(caseId);
    const now = this.now();
    const brief = await this.materializeBrief(current, input, now);

    let next: CanonicalCase = {
      ...current,
      brief_id: brief.brief_id,
      packet_storage_keys: [...current.packet_storage_keys],
      cm_flags: [...current.cm_flags],
      open_tasks: [...current.open_tasks],
      intake: { ...current.intake },
    };

    if (next.state === 'routed' && canTransition(next.state, 'briefing')) {
      next.state = 'briefing';
    }

    next.audit_cursor = current.audit_cursor + 1;
    await this.store.updateCase(next);

    const audit = await this.writeAudit({
      event_id: randomUUID(),
      case_id: next.case_id,
      at: now.toISOString(),
      actor,
      rule_id: null,
      from_state: current.state,
      to_state: next.state,
      note: `brief attached ${brief.brief_id} source=${brief.source}`,
      payload_hash: hashTransitionPayload(current, next.state, { to_state: next.state, brief_id: brief.brief_id }),
    });

    if (input.enqueue_md && next.state !== 'md_queue') {
      const queued = await this.transitionCase(
        next.case_id,
        { to_state: 'md_queue', brief_id: brief.brief_id, note: 'brief attached; enqueue md_queue' },
        actor,
      );
      return { case: queued.case, brief, audit: queued.audit };
    }

    return { case: next, brief, audit };
  }

  async signDetermination(
    caseId: string,
    input: SignDeterminationInput,
    actor: string,
  ): Promise<SignDeterminationResult> {
    const current = await this.requireCase(caseId);
    if (current.state !== 'md_queue') {
      throw new IllegalSignError(
        'not_in_md_queue',
        `Cannot sign from state ${current.state}; case must be in md_queue`,
        caseId,
      );
    }
    if (!current.brief_id) {
      throw new IllegalSignError('brief_required', `Cannot sign case ${caseId} without an attached brief`, caseId);
    }
    if (!(DETERMINATIONS as readonly string[]).includes(input.determination)) {
      throw new IllegalSignError('invalid_determination', 'determination must be approve|deny|pend|partial', caseId);
    }
    const rationale = (input.rationale ?? '').trim();
    if (!rationale) {
      throw new IllegalSignError('rationale_required', 'rationale is required to sign', caseId);
    }
    if (current.determination_package_version) {
      throw new IllegalSignError('already_signed', `Case ${caseId} already has an immutable determination package`, caseId);
    }

    const brief = await this.store.getBrief(current.brief_id);
    if (!brief) {
      throw new IllegalSignError('brief_required', `Attached brief ${current.brief_id} was not found`, caseId);
    }

    const now = this.now();
    const signedAt = now.toISOString();
    const denyReason = normalizeDenyReason({
      determination: input.determination,
      deny_reason_code: input.deny_reason_code,
      criteria_result: brief.criteria_result,
      cm_flags: input.cm_flags ?? current.cm_flags,
    });
    const billableEventId = randomUUID();
    const ledgerRows = await recordBillableEventsForSign(this.billing, {
      billable_event_id: billableEventId,
      case_id: current.case_id,
      client_id: current.client_id,
      type: current.type,
      priority: current.priority,
      occurred_at: signedAt,
    });
    const pkg = buildDeterminationPackage({
      case: current,
      brief,
      sign: { ...input, rationale },
      version: 1,
      signer_id: actor,
      signed_at: signedAt,
      billable_event_id: billableEventId,
      previous_version: null,
    });
    await this.store.insertPackage(pkg);

    const stamped: CanonicalCase = {
      ...current,
      determination: input.determination,
      signer_id: actor,
      signed_rationale: rationale,
      deny_reason_code: denyReason,
      determination_package_version: pkg.version,
      determination_package_key: pkg.storage_key,
      billable_event_id: billableEventId,
      cm_flags: input.cm_flags ? [...input.cm_flags] : [...current.cm_flags],
      fanout_stub: {
        enqueued_at: signedAt,
        status: 'pending',
        targets: ['F1_portal', 'F5_billing', 'F7_archive'],
      },
      billable_event_stub: {
        billable_event_id: ledgerRows[0]?.billable_event_id ?? billableEventId,
        event: 'determination.signed',
        enqueued_at: signedAt,
      },
    };
    await this.store.updateCase(stamped);

    const evaluated = await this.evaluateAndPersist(
      stamped,
      {
        md_signed: true,
        signer_id: actor,
        cm_flags: stamped.cm_flags,
      },
      actor,
    );

    let next = evaluated.case;
    const audit = [...evaluated.audit];
    if (next.state !== 'determined') {
      const moved = await this.transitionCase(
        caseId,
        {
          to_state: 'determined',
          determination: input.determination,
          signer_id: actor,
          brief_id: brief.brief_id,
          billable_event_id: billableEventId,
          fanout_status: 'pending',
          cm_flags: stamped.cm_flags,
          note: 'MD signed determination (R13 disabled; sign path still required)',
        },
        actor,
      );
      next = moved.case;
      audit.push(moved.audit);
    }

    const withStubs: CanonicalCase = {
      ...next,
      determination: input.determination,
      signer_id: actor,
      signed_rationale: rationale,
      deny_reason_code: denyReason,
      determination_package_version: pkg.version,
      determination_package_key: pkg.storage_key,
      billable_event_id: next.billable_event_id ?? billableEventId,
      fanout_status: next.fanout_status === 'not_started' ? 'pending' : next.fanout_status,
      fanout_stub: stamped.fanout_stub,
      billable_event_stub: {
        ...stamped.billable_event_stub!,
        billable_event_id: next.billable_event_id ?? billableEventId,
      },
    };
    await this.store.updateCase(withStubs);

    return { case: withStubs, package: pkg, brief, audit };
  }

  async applyOpsPatch(caseId: string, patch: CaseOpsPatch): Promise<CanonicalCase> {
    const current = await this.requireCase(caseId);
    const next: CanonicalCase = {
      ...current,
      packet_storage_keys: [...current.packet_storage_keys],
      cm_flags: [...current.cm_flags],
      open_tasks: patch.open_tasks ? [...patch.open_tasks] : [...current.open_tasks],
      intake: { ...current.intake },
      fanout_stub: patch.fanout_stub !== undefined ? patch.fanout_stub : current.fanout_stub,
      billable_event_stub:
        patch.billable_event_stub !== undefined ? patch.billable_event_stub : current.billable_event_stub,
      fanout_status: patch.fanout_status ?? current.fanout_status,
      billable_event_id:
        patch.billable_event_id !== undefined ? patch.billable_event_id : current.billable_event_id,
    };
    await this.store.updateCase(next);
    return next;
  }

  /**
   * Demo / test helper: three synthetic md_queue cases with distinct SLA + priority.
   * Tokenized refs only.
   */
  async seedSyntheticMdQueue(actor = 'system'): Promise<CanonicalCase[]> {
    const now = this.now();
    const seeds: Array<{
      suffix: string;
      priority: CanonicalCase['priority'];
      slaHours: number;
      criteria: NonNullable<AttachBriefInput['criteria_result']>;
    }> = [
      { suffix: 'sla-tight', priority: 'standard', slaHours: 6, criteria: 'gray' },
      { suffix: 'expedited', priority: 'expedited', slaHours: 24, criteria: 'meet' },
      { suffix: 'urgent', priority: 'urgent', slaHours: 24, criteria: 'fail' },
    ];

    const created: CanonicalCase[] = [];
    for (const seed of seeds) {
      const receivedAt = new Date(now.getTime() - 60_000).toISOString();
      const result = await this.createCase(
        {
          client_id: '11111111-1111-1111-1111-111111111111',
          external_id: `ext-synth-mdq-${seed.suffix}`,
          priority: seed.priority,
          packet_storage_keys: [`s3://synth/packet/${seed.suffix}.pdf`],
          client_config: { sla_hours_standard: seed.slaHours, sla_hours_urgent: seed.slaHours },
          intake: {
            external_id: `ext-synth-mdq-${seed.suffix}`,
            member_ref: `memb_synth_${seed.suffix}`,
            requesting_provider: `prov_synth_${seed.suffix}`,
            service_or_rx: `CPT-SYNTH-${seed.suffix.toUpperCase()}`,
            place_of_service: 'office',
            urgency: seed.priority,
            clinicals_pointer: `s3://synth/packet/${seed.suffix}.pdf`,
            received_at: receivedAt,
            benefit_type: 'medical',
          },
        },
        actor,
      );
      await this.transitionCase(result.case.case_id, { to_state: 'intake_validated' }, actor);
      await this.transitionCase(result.case.case_id, { to_state: 'routed' }, actor);
      const attached = await this.attachBrief(
        result.case.case_id,
        { criteria_result: seed.criteria, enqueue_md: true },
        actor,
      );
      created.push(attached.case);
    }
    return sortMdQueue(created);
  }

  async listAudit(caseId: string): Promise<AuditEvent[]> {
    await this.requireCase(caseId);
    return this.store.listAudit(caseId);
  }

  async listRules(): Promise<AuthRule[]> {
    return this.store.listRules();
  }

  async setRuleEnabled(ruleId: AuthRuleId, enabled: boolean, actor = 'system'): Promise<AuthRule> {
    const rule = await this.store.setRuleEnabled(ruleId, enabled);
    await this.writeAudit({
      event_id: randomUUID(),
      case_id: null,
      at: this.now().toISOString(),
      actor,
      rule_id: ruleId,
      from_state: null,
      to_state: null,
      note: `rule ${ruleId} ${enabled ? 'enabled' : 'disabled'} (v${rule.version})`,
      payload_hash: hashTransitionPayload(
        {
          case_id: 'config',
          client_id: 'config',
          type: 'prior_auth',
          state: 'received',
          sla_clock: 'n_a',
          sla_status: 'ok',
          determination: null,
        } as CanonicalCase,
        'received',
      ),
    });
    return rule;
  }

  async evaluateCase(
    caseId: string,
    ctx: RuleEvalContext = {},
    actor = 'system',
  ): Promise<{ case: CanonicalCase; evaluations: RuleEvaluation[]; audit: AuditEvent[] }> {
    let current = await this.requireCase(caseId);
    if (ctx.criteria_result && !current.brief_id && canTransition(current.state, 'md_queue')) {
      const attached = await this.attachBrief(
        caseId,
        { criteria_result: ctx.criteria_result },
        actor,
      );
      current = attached.case;
    }
    return this.evaluateAndPersist(current, ctx, actor);
  }

  private async evaluateAndPersist(
    current: CanonicalCase,
    ctx: RuleEvalContext,
    actor: string,
  ): Promise<{ case: CanonicalCase; evaluations: RuleEvaluation[]; audit: AuditEvent[] }> {
    const rules = await this.store.listRules();
    const result = evaluateRules(current, rules, ctx, actor, this.now());
    result.case.audit_cursor = current.audit_cursor + result.audits.length;
    await this.store.updateCase(result.case);
    const persisted: AuditEvent[] = [];
    for (const event of result.audits) {
      persisted.push(await this.writeAudit(event));
    }
    return { case: result.case, evaluations: result.evaluations, audit: persisted };
  }

  private async writeAudit(event: AuditEvent): Promise<AuditEvent> {
    return this.store.insertAudit({
      ...event,
      event_id: event.event_id || randomUUID(),
    });
  }

  private async requireCase(caseId: string): Promise<CanonicalCase> {
    const found = await this.store.getCase(caseId);
    if (!found) throw new CaseNotFoundError(caseId);
    return found;
  }

  private async materializeBrief(
    current: CanonicalCase,
    input: AttachBriefInput,
    now: Date,
  ): Promise<SpineBrief> {
    if (
      current.brief_id &&
      !input.brief_id &&
      !input.source_case_id &&
      !input.criteria_result
    ) {
      const existing = await this.store.getBrief(current.brief_id);
      if (existing) return existing;
    }

    const existingId = input.brief_id ?? input.source_case_id ?? null;
    if (input.brief_id) {
      const stored = await this.store.getBrief(input.brief_id);
      if (stored) return stored;
    }
    if (existingId) {
      const fromApi = await resolveExistingBriefContent(existingId);
      if (fromApi) {
        const brief = mintSpineBrief({
          case: current,
          content: fromApi.content,
          criteria_result: input.criteria_result ?? fromApi.criteria_result,
          source: 'existing_api',
          existing_brief_ref: existingId,
          brief_id: input.brief_id ?? undefined,
          now,
        });
        await this.store.insertBrief(brief);
        return brief;
      }
    }

    const criteria = input.criteria_result ?? 'gray';
    const brief = mintSpineBrief({
      case: current,
      content: buildSyntheticBriefContent(current, criteria),
      criteria_result: criteria,
      source: 'synthetic',
      brief_id: input.brief_id ?? undefined,
      now,
    });
    await this.store.insertBrief(brief);
    return brief;
  }
}
