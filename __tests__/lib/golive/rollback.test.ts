import { describe, expect, it } from 'vitest';
import { blankUmPricing } from '@/lib/billing/um-price-card';
import type { CanonicalCase } from '@/lib/case-spine';
import { evaluateLiveHypercare, slaMissRate } from '@/lib/golive';
import { MemoryGoLiveStore } from '@/lib/golive/store';

function liveCase(id: string, sla: 'ok' | 'missed'): CanonicalCase {
  return {
    case_id: id,
    case_number: `VUM-${id}`,
    client_id: '11111111-1111-1111-1111-111111111111',
    external_id: id,
    type: 'prior_auth',
    state: 'fanout_complete',
    lane: 'medical',
    priority: 'standard',
    sla_due_at: '2026-09-18T00:00:00.000Z',
    sla_status: sla,
    sla_clock: 'stopped',
    sla_paused_at: null,
    received_at: `2026-09-18T00:00:${id.slice(-2)}.000Z`,
    determined_at: '2026-09-18T01:00:00.000Z',
    determination: 'approve',
    signer_id: 'md_synth',
    brief_id: 'brief',
    packet_storage_keys: [],
    parent_case_id: null,
    billable_event_id: null,
    fanout_status: 'complete',
    cm_flags: [],
    audit_cursor: 1,
    open_tasks: [],
    duplicate_of_case_id: null,
    intake: { external_id: id, member_ref: `memb_${id}` },
    signed_rationale: 'synth',
    deny_reason_code: null,
    determination_package_version: 1,
    determination_package_key: 'pkg',
    fanout_stub: null,
    billable_event_stub: null,
    ...blankUmPricing(),
  };
}

describe('Phase 7.4 live hypercare SLA rollback', () => {
  it('computes miss rate and holds when under threshold', () => {
    const cases = [liveCase('ok01', 'ok'), liveCase('ok02', 'ok'), liveCase('ms01', 'missed')];
    const ev = evaluateLiveHypercare({
      client_id: cases[0].client_id,
      cases,
      threshold: 0.5,
      now: new Date('2026-09-18T20:00:00.000Z'),
    });
    expect(ev.sample_size).toBe(3);
    expect(ev.miss_rate).toBe(slaMissRate(1, 3));
    expect(ev.breached).toBe(false);
    expect(ev.action).toBe('hold');
  });

  it('writes rollback note when miss rate exceeds config threshold', () => {
    const cases = Array.from({ length: 10 }, (_, i) =>
      liveCase(`c${String(i).padStart(2, '0')}`, i < 4 ? 'missed' : 'ok'),
    );
    const ev = evaluateLiveHypercare({
      client_id: cases[0].client_id,
      cases,
      config: { sla_miss_rollback_threshold: 0.2 },
      now: new Date('2026-09-18T20:00:00.000Z'),
    });
    expect(ev.miss_rate).toBe(0.4);
    expect(ev.breached).toBe(true);
    expect(ev.action).toBe('rollback_to_shadow');
    expect(ev.note).toMatch(/Pause live intake, stay on shadow/);
    expect(ev.note).toMatch(/not a HIPAA attestation/i);

    const store = new MemoryGoLiveStore();
    store.appendLog({
      client_id: ev.client_id,
      at: ev.evaluated_at,
      actor: 'ops',
      kind: 'rollback',
      message: ev.note,
    });
    expect(store.hasKind(ev.client_id, 'rollback')).toBe(true);
    expect(store.listLog(ev.client_id)[0].kind).toBe('rollback');
  });
});
