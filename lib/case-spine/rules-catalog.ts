import type { AuthRule } from './types';

/**
 * Versioned R01–R16 catalog from docs/customer-ready/03-auth-workflow-rules.md.
 *
 * This is the seed for `auth_rules` and the in-memory fallback. Evaluation
 * reads enabled/version/effects from this table (or a store override) — it
 * does not hardcode "vibes" in the service.
 */
export const AUTH_RULES_VERSION = 1;

export const AUTH_RULES_V1: readonly AuthRule[] = [
  {
    rule_id: 'R01',
    version: 1,
    enabled: true,
    sort_order: 10,
    when_text:
      'Payload missing required fields (member id ref, DOS/procedure or Rx, requesting provider, clinicals pointer)',
    then_text: 'intake_incomplete; create request_clinicals task; notify CX + client portal',
    sla_clock: 'paused',
    effects: {
      set_state: 'intake_incomplete',
      set_sla_clock: 'paused',
      add_task: 'request_clinicals',
      notify: ['cx', 'client_portal'],
    },
  },
  {
    rule_id: 'R02',
    version: 1,
    enabled: true,
    sort_order: 20,
    when_text: 'Clinicals received after R01',
    then_text: 'Resume clock; → routed',
    sla_clock: 'running',
    effects: { set_state: 'routed', set_sla_clock: 'running' },
  },
  {
    rule_id: 'R03',
    version: 1,
    enabled: true,
    sort_order: 30,
    when_text: 'Benefit type = pharmacy/drug (config)',
    then_text: 'Route lane=pharmacy',
    sla_clock: 'running',
    effects: { set_lane: 'pharmacy' },
  },
  {
    rule_id: 'R04',
    version: 1,
    enabled: true,
    sort_order: 40,
    when_text: 'Benefit type = medical',
    then_text: 'Route lane=medical',
    sla_clock: 'running',
    effects: { set_lane: 'medical' },
  },
  {
    rule_id: 'R05',
    version: 1,
    enabled: true,
    sort_order: 50,
    when_text: 'Duplicate of open case (same client keys)',
    then_text: 'Link duplicate; do not double-bill; notify CX',
    sla_clock: 'n_a',
    effects: { link_duplicate: true, notify: ['cx'] },
  },
  {
    rule_id: 'R06',
    version: 1,
    enabled: true,
    sort_order: 60,
    when_text: 'Urgent flag per client config',
    then_text: 'Set sla_hours_urgent; priority boost in MD queue',
    sla_clock: 'urgent',
    effects: { set_priority: 'urgent', set_sla_clock: 'urgent' },
  },
  {
    rule_id: 'R07',
    version: 1,
    enabled: true,
    sort_order: 70,
    when_text: 'Criteria engine: clear meet',
    then_text: 'Draft approve brief → md_queue (MD confirm required at go-live)',
    sla_clock: 'running',
    effects: { set_state: 'md_queue', set_sla_clock: 'running' },
  },
  {
    rule_id: 'R08',
    version: 1,
    enabled: true,
    sort_order: 80,
    when_text: 'Criteria engine: clear fail',
    then_text: 'Draft deny brief + alt if any → md_queue',
    sla_clock: 'running',
    effects: { set_state: 'md_queue', set_sla_clock: 'running' },
  },
  {
    rule_id: 'R09',
    version: 1,
    enabled: true,
    sort_order: 90,
    when_text: 'Criteria engine: gray / insufficient evidence',
    then_text: 'Draft pend or gray brief → md_queue; optional clinical request',
    sla_clock: 'running',
    effects: { set_state: 'md_queue', set_sla_clock: 'running' },
  },
  {
    rule_id: 'R10',
    version: 1,
    enabled: true,
    sort_order: 100,
    when_text: 'No MD action within 50% SLA',
    then_text: 'Escalation L1: CX ping reviewer',
    sla_clock: 'running',
    effects: { notify: ['cx'], add_task: 'escalation_l1' },
  },
  {
    rule_id: 'R11',
    version: 1,
    enabled: true,
    sort_order: 110,
    when_text: 'No MD action within 80% SLA',
    then_text: 'Escalation L2: CX + client contact (status only)',
    sla_clock: 'running',
    effects: { notify: ['cx', 'client_status'], add_task: 'escalation_l2' },
  },
  {
    rule_id: 'R12',
    version: 1,
    enabled: true,
    sort_order: 120,
    when_text: 'SLA breach',
    then_text: 'Escalation L3: CX owner + ops; mark sla_missed',
    sla_clock: 'breached',
    effects: {
      set_sla_status: 'missed',
      set_sla_clock: 'breached',
      notify: ['cx_owner', 'ops'],
      add_task: 'escalation_l3',
    },
  },
  {
    rule_id: 'R13',
    version: 1,
    enabled: true,
    sort_order: 130,
    when_text: 'MD signs',
    then_text: '→ determined; enqueue fan-out; create billable event',
    sla_clock: 'stopped',
    effects: {
      set_state: 'determined',
      set_sla_clock: 'stopped',
      enqueue_fanout: true,
      create_billable_event: true,
    },
  },
  {
    rule_id: 'R14',
    version: 1,
    enabled: true,
    sort_order: 140,
    when_text: 'Inbound is first-level appeal',
    then_text: 'Attach prior auth case id; type=first_level_appeal; load prior package → briefing',
    sla_clock: 'new_clock',
    effects: { set_state: 'briefing', start_new_clock: true },
  },
  {
    rule_id: 'R15',
    version: 1,
    enabled: true,
    sort_order: 150,
    when_text: 'Client cancels / withdraws',
    then_text: '→ cancelled/withdrawn; no billable if before brief start',
    sla_clock: 'stopped',
    effects: { set_sla_clock: 'stopped' },
  },
  {
    rule_id: 'R16',
    version: 1,
    enabled: true,
    sort_order: 160,
    when_text: 'CM-relevant outcome flags (see 09)',
    then_text: 'Attach flags on determination; enqueue CM handoff',
    sla_clock: 'n_a',
    effects: { attach_cm_flags: true },
  },
];

export function cloneRulesCatalog(source: readonly AuthRule[] = AUTH_RULES_V1): AuthRule[] {
  return source.map((rule) => ({
    ...rule,
    effects: {
      ...rule.effects,
      notify: rule.effects.notify ? [...rule.effects.notify] : undefined,
    },
  }));
}
