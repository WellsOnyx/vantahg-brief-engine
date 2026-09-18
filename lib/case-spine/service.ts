import { randomUUID } from 'crypto';
import { hashTransitionPayload } from './hash';
import { applyListFilters } from './rbac';
import { evaluateRules } from './rules-engine';
import { assertTransition } from './state-machine';
import type { CaseSpineStore } from './store';
import {
  CaseNotFoundError,
  DEFAULT_CLIENT_CONFIG,
  type AuditEvent,
  type AuthRule,
  type AuthRuleId,
  type CanonicalCase,
  type CreateCaseInput,
  type ListCasesFilters,
  type RuleEvalContext,
  type RuleEvaluation,
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

export class CaseSpineService {
  constructor(
    private readonly store: CaseSpineStore,
    private readonly now: () => Date = () => new Date(),
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
    if (viewer.role === 'med_review') {
      return filtered.sort((a, b) => {
        const sla = (a.sla_due_at ?? '').localeCompare(b.sla_due_at ?? '');
        if (sla !== 0) return sla;
        const prio = priorityRank(a.priority) - priorityRank(b.priority);
        return prio;
      });
    }
    return filtered.sort((a, b) => b.received_at.localeCompare(a.received_at));
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
    const current = await this.requireCase(caseId);
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
}

function priorityRank(priority: CanonicalCase['priority']): number {
  if (priority === 'expedited') return 0;
  if (priority === 'urgent') return 1;
  return 2;
}
