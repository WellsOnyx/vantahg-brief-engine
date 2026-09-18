import { hashRulePayload } from './hash';
import { isIntakeComplete, missingRequiredFields, intakeFromCase } from './required-fields';
import { canTransition } from './state-machine';
import type {
  AuditEvent,
  AuthRule,
  AuthRuleId,
  CanonicalCase,
  RuleEvalContext,
  RuleEvaluation,
  SlaClock,
} from './types';

export interface RuleMatch {
  evaluation: RuleEvaluation;
  audit: AuditEvent;
  next: CanonicalCase;
}

function ruleApplies(rule: AuthRule, c: CanonicalCase, ctx: RuleEvalContext): boolean {
  const intake = intakeFromCase(c);
  const benefit = ctx.benefit_type ?? intake.benefit_type ?? null;
    const urgent = ctx.urgent ?? (c.priority === 'urgent' || c.priority === 'expedited');

  switch (rule.rule_id) {
    case 'R01':
      return (
        c.state === 'received' &&
        !isIntakeComplete(intake) &&
        ctx.clinicals_received !== true
      );
    case 'R02':
      return (
        c.state === 'intake_incomplete' &&
        (ctx.clinicals_received === true || isIntakeComplete(intake))
      );
    case 'R03':
      return benefit === 'pharmacy' || benefit === 'drug';
    case 'R04':
      return benefit === 'medical';
    case 'R05':
      return ctx.is_duplicate === true;
    case 'R06':
      return urgent;
    case 'R07':
      return ctx.criteria_result === 'meet' && canTransition(c.state, 'md_queue');
    case 'R08':
      return ctx.criteria_result === 'fail' && canTransition(c.state, 'md_queue');
    case 'R09':
      return ctx.criteria_result === 'gray' && canTransition(c.state, 'md_queue');
    case 'R10':
      return c.state === 'md_queue' && (ctx.sla_elapsed_ratio ?? 0) >= 0.5 && (ctx.sla_elapsed_ratio ?? 0) < 0.8;
    case 'R11':
      return c.state === 'md_queue' && (ctx.sla_elapsed_ratio ?? 0) >= 0.8 && (ctx.sla_elapsed_ratio ?? 0) < 1;
    case 'R12':
      return (ctx.sla_elapsed_ratio ?? 0) >= 1 && c.sla_clock !== 'stopped';
    case 'R13':
      return ctx.md_signed === true && (c.state === 'md_queue' || c.state === 'determined');
    case 'R14':
      return (
        (ctx.inbound_is_appeal === true || c.type === 'first_level_appeal') &&
        c.state === 'received'
      );
    case 'R15':
      return ctx.client_cancel === true || ctx.client_withdraw === true;
    case 'R16':
      return Boolean(ctx.cm_flags?.length) && (c.state === 'determined' || ctx.md_signed === true);
    default:
      return false;
  }
}

function applyEffects(
  c: CanonicalCase,
  rule: AuthRule,
  ctx: RuleEvalContext,
  now: Date,
): CanonicalCase {
  const next: CanonicalCase = {
    ...c,
    packet_storage_keys: [...c.packet_storage_keys],
    cm_flags: [...c.cm_flags],
    open_tasks: [...c.open_tasks],
    intake: { ...c.intake },
  };
  const { effects } = rule;

  if (effects.set_state && (canTransition(next.state, effects.set_state) || next.state === effects.set_state)) {
    if (canTransition(next.state, effects.set_state)) {
      next.state = effects.set_state;
    }
  }

  if (effects.set_lane) next.lane = effects.set_lane;
  if (effects.set_priority) next.priority = effects.set_priority;
  if (effects.set_sla_status) next.sla_status = effects.set_sla_status;

  if (effects.set_sla_clock) {
    next.sla_clock = effects.set_sla_clock;
    if (effects.set_sla_clock === 'paused') {
      next.sla_paused_at = next.sla_paused_at ?? now.toISOString();
    }
    if (effects.set_sla_clock === 'running' && c.sla_paused_at) {
      const pausedMs = now.getTime() - new Date(c.sla_paused_at).getTime();
      if (next.sla_due_at && pausedMs > 0) {
        next.sla_due_at = new Date(new Date(next.sla_due_at).getTime() + pausedMs).toISOString();
      }
      next.sla_paused_at = null;
    }
    if (effects.set_sla_clock === 'stopped' || effects.set_sla_clock === 'breached') {
      next.sla_paused_at = null;
    }
  }

  if (effects.add_task && !next.open_tasks.includes(effects.add_task)) {
    next.open_tasks.push(effects.add_task);
  }

  if (effects.link_duplicate && ctx.duplicate_of_case_id) {
    next.duplicate_of_case_id = ctx.duplicate_of_case_id;
  }

  if (effects.enqueue_fanout) {
    next.fanout_status = 'pending';
  }

  if (effects.create_billable_event && !next.billable_event_id) {
    next.billable_event_id = `bill_${next.case_id}`;
  }

  if (effects.attach_cm_flags && ctx.cm_flags?.length) {
    const merged = new Set<CanonicalCase['cm_flags'][number]>([...next.cm_flags, ...ctx.cm_flags]);
    next.cm_flags = [...merged];
  }

  if (effects.start_new_clock) {
    next.sla_clock = 'new_clock';
    next.sla_status = 'ok';
    next.sla_paused_at = null;
  }

  if (rule.rule_id === 'R02' && next.open_tasks.includes('request_clinicals')) {
    next.open_tasks = next.open_tasks.filter((t) => t !== 'request_clinicals');
  }

  if (rule.rule_id === 'R06' && ctx.client_config?.sla_hours_urgent && next.received_at) {
    next.sla_due_at = new Date(
      new Date(next.received_at).getTime() + ctx.client_config.sla_hours_urgent * 3600_000,
    ).toISOString();
  }

  if (rule.rule_id === 'R13') {
    next.determined_at = now.toISOString();
    if (ctx.signer_id) next.signer_id = ctx.signer_id;
  }

  if (rule.rule_id === 'R14') {
    next.type = 'first_level_appeal';
    if (ctx.parent_case_id) next.parent_case_id = ctx.parent_case_id;
  }

  if (rule.rule_id === 'R15') {
    next.state = ctx.client_withdraw ? 'withdrawn' : 'cancelled_by_client';
  }

  return next;
}

function makeAudit(
  c: CanonicalCase,
  next: CanonicalCase,
  rule: AuthRule,
  actor: string,
  now: Date,
  ctx: RuleEvalContext,
  matched: boolean,
): AuditEvent {
  const missing = missingRequiredFields(intakeFromCase(c));
  const note = matched
    ? `rule ${rule.rule_id} matched: ${rule.then_text}${
        rule.rule_id === 'R01' && missing.length ? ` (missing=${missing.join(',')})` : ''
      }`
    : `rule ${rule.rule_id} evaluated, no match`;
  return {
    event_id: `ae_${rule.rule_id}_${c.case_id}_${now.getTime()}`,
    case_id: c.case_id,
    at: now.toISOString(),
    actor,
    rule_id: rule.rule_id,
    from_state: c.state,
    to_state: next.state,
    note,
    payload_hash: hashRulePayload(c, ctx, rule.rule_id),
  };
}

/**
 * Evaluate enabled rules in sort_order. Every evaluation writes an audit
 * event (match or skip-disabled). Disabled rules are recorded, not applied.
 */
export function evaluateRules(
  c: CanonicalCase,
  rules: readonly AuthRule[],
  ctx: RuleEvalContext,
  actor = 'system',
  now = new Date(),
): { case: CanonicalCase; evaluations: RuleEvaluation[]; audits: AuditEvent[] } {
  const ordered = [...rules].sort((a, b) => a.sort_order - b.sort_order);
  let current = c;
  const evaluations: RuleEvaluation[] = [];
  const audits: AuditEvent[] = [];

  for (const rule of ordered) {
    if (!rule.enabled) {
      const evaluation: RuleEvaluation = {
        rule_id: rule.rule_id,
        matched: false,
        skipped_disabled: true,
        version: rule.version,
        sla_clock: rule.sla_clock,
        note: `rule ${rule.rule_id} disabled in config`,
      };
      evaluations.push(evaluation);
      audits.push({
        event_id: `ae_${rule.rule_id}_${c.case_id}_skip_${now.getTime()}`,
        case_id: current.case_id,
        at: now.toISOString(),
        actor,
        rule_id: rule.rule_id,
        from_state: current.state,
        to_state: current.state,
        note: evaluation.note,
        payload_hash: hashRulePayload(current, ctx, rule.rule_id),
      });
      continue;
    }

    const matched = ruleApplies(rule, current, ctx);
    const next = matched ? applyEffects(current, rule, ctx, now) : current;
    const evaluation: RuleEvaluation = {
      rule_id: rule.rule_id,
      matched,
      skipped_disabled: false,
      version: rule.version,
      sla_clock: (next.sla_clock ?? rule.sla_clock) as SlaClock,
      note: matched ? rule.then_text : `no match for ${rule.rule_id}`,
    };
    evaluations.push(evaluation);
    audits.push(makeAudit(current, next, rule, actor, now, ctx, matched));
    current = next;
  }

  return { case: current, evaluations, audits };
}

export function findRule(rules: readonly AuthRule[], ruleId: AuthRuleId): AuthRule | undefined {
  return rules.find((r) => r.rule_id === ruleId);
}
