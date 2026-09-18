import { describe, it, expect, beforeEach } from 'vitest';
import {
  AUTH_RULES_V1,
  AUTH_RULE_IDS,
  CaseSpineService,
  IllegalTransitionError,
  MemoryCaseSpineStore,
  applyListFilters,
  evaluateRules,
  missingRequiredFields,
} from '@/lib/case-spine';

const NOW = new Date('2026-09-18T12:00:00.000Z');
const CLIENT = '11111111-1111-1111-1111-111111111111';

const COMPLETE_INTAKE = {
  external_id: 'ext-synth-001',
  member_ref: 'memb_synth_001',
  requesting_provider: 'prov_synth_001',
  service_or_rx: 'CPT-73721',
  place_of_service: 'office',
  urgency: 'standard' as const,
  clinicals_pointer: 's3://synth/packet/001.pdf',
  received_at: NOW.toISOString(),
  benefit_type: 'medical' as const,
};

function service() {
  return new CaseSpineService(new MemoryCaseSpineStore(), () => NOW);
}

describe('R01–R16 catalog is versioned data', () => {
  it('ships all sixteen rules at version 1, enabled', () => {
    expect(AUTH_RULES_V1.map((r) => r.rule_id)).toEqual([...AUTH_RULE_IDS]);
    expect(AUTH_RULES_V1.every((r) => r.version === 1 && r.enabled)).toBe(true);
  });
});

describe('R01 incomplete intake pauses SLA', () => {
  it('marks missing required fields', () => {
    expect(missingRequiredFields({ member_ref: 'memb_synth_001' })).toContain('clinicals_pointer');
    expect(missingRequiredFields(COMPLETE_INTAKE)).toEqual([]);
  });

  it('create with incomplete payload → intake_incomplete + sla_clock paused + request_clinicals', async () => {
    const svc = service();
    const result = await svc.createCase(
      {
        client_id: CLIENT,
        intake: { member_ref: 'memb_synth_001', benefit_type: 'medical' },
      },
      'system',
    );

    expect(result.case.state).toBe('intake_incomplete');
    expect(result.case.sla_clock).toBe('paused');
    expect(result.case.sla_paused_at).toBe(NOW.toISOString());
    expect(result.case.open_tasks).toContain('request_clinicals');

    const r01 = result.evaluations.find((e) => e.rule_id === 'R01');
    expect(r01?.matched).toBe(true);
    expect(r01?.skipped_disabled).toBe(false);

    const trail = result.audit.filter((e) => e.rule_id === 'R01');
    expect(trail).toHaveLength(1);
    expect(trail[0].to_state).toBe('intake_incomplete');
    expect(trail[0].note).toContain('missing=');
    expect(trail[0].payload_hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('toggling R01 off leaves incomplete intake in received (clock running)', async () => {
    const store = new MemoryCaseSpineStore();
    const svc = new CaseSpineService(store, () => NOW);
    await svc.setRuleEnabled('R01', false, 'admin');

    const result = await svc.createCase({
      client_id: CLIENT,
      intake: { member_ref: 'memb_synth_001' },
    });

    expect(result.case.state).toBe('received');
    expect(result.case.sla_clock).toBe('running');
    expect(result.case.open_tasks).not.toContain('request_clinicals');
    const r01 = result.evaluations.find((e) => e.rule_id === 'R01');
    expect(r01?.skipped_disabled).toBe(true);
    expect(r01?.matched).toBe(false);
  });

  it('complete intake does not match R01 and can route via R04', async () => {
    const result = await service().createCase({
      client_id: CLIENT,
      intake: COMPLETE_INTAKE,
    });
    expect(result.evaluations.find((e) => e.rule_id === 'R01')?.matched).toBe(false);
    expect(result.case.state).toBe('received');
    expect(result.case.lane).toBe('medical');
    expect(result.case.sla_clock).toBe('running');
  });
});

describe('transitions write audit_events', () => {
  it('legal transition records from_state → to_state', async () => {
    const svc = service();
    const created = await svc.createCase({
      client_id: CLIENT,
      intake: COMPLETE_INTAKE,
    });
    const moved = await svc.transitionCase(
      created.case.case_id,
      { to_state: 'intake_validated', note: 'csr validated synthetic packet' },
      'user_synth_csr',
    );
    expect(moved.case.state).toBe('intake_validated');
    expect(moved.audit.from_state).toBe('received');
    expect(moved.audit.to_state).toBe('intake_validated');
    expect(moved.audit.actor).toBe('user_synth_csr');
    expect(moved.audit.payload_hash).toMatch(/^[a-f0-9]{64}$/);

    const trail = await svc.listAudit(created.case.case_id);
    expect(trail.some((e) => e.to_state === 'received' && e.note === 'case created')).toBe(true);
    expect(trail.some((e) => e.from_state === 'received' && e.to_state === 'intake_validated')).toBe(true);
  });

  it('illegal transition is rejected and does not mutate state', async () => {
    const svc = service();
    const created = await svc.createCase({
      client_id: CLIENT,
      intake: COMPLETE_INTAKE,
    });
    await expect(
      svc.transitionCase(created.case.case_id, { to_state: 'determined' }),
    ).rejects.toBeInstanceOf(IllegalTransitionError);

    const again = await svc.getCase(created.case.case_id);
    expect(again.state).toBe('received');
  });

  it('R02 clinicals-received resumes the clock and routes', async () => {
    const svc = service();
    const created = await svc.createCase({
      client_id: CLIENT,
      intake: { member_ref: 'memb_synth_001', benefit_type: 'medical' },
    });
    expect(created.case.sla_clock).toBe('paused');

    const later = new Date('2026-09-18T14:00:00.000Z');
    const resumed = evaluateRules(
      created.case,
      await svc.listRules(),
      {
        clinicals_received: true,
        benefit_type: 'medical',
      },
      'system',
      later,
    );
    const r02 = resumed.evaluations.find((e) => e.rule_id === 'R02');
    expect(r02?.matched).toBe(true);
    expect(resumed.case.state).toBe('routed');
    expect(resumed.case.sla_clock).toBe('running');
    expect(resumed.case.sla_paused_at).toBeNull();
    // two hours paused → due date pushed by 2h
    const due = new Date(resumed.case.sla_due_at!).getTime();
    const originalDue = new Date(created.case.sla_due_at!).getTime();
    expect(due - originalDue).toBe(2 * 3600_000);
  });
});

describe('role filters (stub RBAC)', () => {
  it('client viewer cannot see another tenant case', async () => {
    const created = await service().createCase({
      client_id: CLIENT,
      intake: COMPLETE_INTAKE,
    });
    const visible = applyListFilters([created.case], {
      id: 'client-user',
      role: 'client',
      client_id: '22222222-2222-2222-2222-222222222222',
    });
    expect(visible).toHaveLength(0);
  });

  it('CX view redacts packet keys', async () => {
    const created = await service().createCase({
      client_id: CLIENT,
      packet_storage_keys: ['s3://synth/packet/001.pdf'],
      intake: COMPLETE_INTAKE,
    });
    const [cx] = applyListFilters([created.case], { id: 'cx', role: 'cx' });
    expect(cx.packet_storage_keys).toEqual([]);
    const [md] = applyListFilters([created.case], { id: 'md', role: 'med_review' });
    expect(md.packet_storage_keys).toEqual(['s3://synth/packet/001.pdf']);
  });
});
