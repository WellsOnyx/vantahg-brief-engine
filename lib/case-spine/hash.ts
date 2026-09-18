import { createHash } from 'crypto';
import type { CanonicalCase, RuleEvalContext, TransitionInput } from './types';

/** SHA-256 of a non-PHI decision payload. Never hash raw member names/DOB. */
export function payloadHash(value: unknown): string {
  const json = stableStringify(value);
  return createHash('sha256').update(json, 'utf8').digest('hex');
}

export function hashTransitionPayload(
  c: CanonicalCase,
  to_state: string,
  extra?: TransitionInput,
): string {
  return payloadHash({
    case_id: c.case_id,
    client_id: c.client_id,
    type: c.type,
    from_state: c.state,
    to_state,
    determination: extra?.determination ?? c.determination,
    sla_clock: c.sla_clock,
    sla_status: c.sla_status,
  });
}

export function hashRulePayload(c: CanonicalCase, ctx: RuleEvalContext, ruleId: string): string {
  return payloadHash({
    case_id: c.case_id,
    state: c.state,
    rule_id: ruleId,
    benefit_type: ctx.benefit_type ?? c.intake.benefit_type ?? null,
    urgent: ctx.urgent ?? (c.priority === 'urgent' || c.priority === 'expedited'),
    criteria_result: ctx.criteria_result ?? null,
    md_signed: ctx.md_signed ?? false,
    inbound_is_appeal: ctx.inbound_is_appeal ?? c.type === 'first_level_appeal',
    sla_elapsed_ratio: ctx.sla_elapsed_ratio ?? null,
    has_clinicals: Boolean(c.intake.clinicals_pointer || c.packet_storage_keys.length),
    has_member_ref: Boolean(c.intake.member_ref),
  });
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(',')}}`;
}
