import { describe, expect, it } from 'vitest';
import {
  CaseSpineService,
  MemoryCaseSpineStore,
  applyListFilters,
  canAccessCaseAudit,
  canAccessClientView,
  canAccessClinicalPacket,
  canAccessCxNotes,
  canAccessCxView,
  canAccessMedReviewView,
  canMutateFanout,
  isEscalationCase,
  isStuckCase,
  redactCaseForViewer,
} from '@/lib/case-spine';
import { OTHER_SYNTHETIC_CLIENT_ID, SYNTHETIC_CLIENT_ID } from '@/lib/intake/constants';

const NOW = new Date('2026-09-18T12:00:00.000Z');
const INTAKE = {
  external_id: 'ext-synth-rbac',
  member_ref: 'memb_synth_rbac',
  requesting_provider: 'prov_synth_rbac',
  service_or_rx: 'CPT-73721',
  place_of_service: 'office',
  urgency: 'standard' as const,
  clinicals_pointer: 's3://synth/packet/rbac.pdf',
  received_at: NOW.toISOString(),
  benefit_type: 'medical' as const,
};

function service() {
  return new CaseSpineService(new MemoryCaseSpineStore(), () => NOW);
}

describe('Phase 5 RBAC', () => {
  it('denies a client viewer another tenant case', async () => {
    const created = await service().createCase({
      client_id: SYNTHETIC_CLIENT_ID,
      packet_storage_keys: ['s3://synth/packet/rbac.pdf'],
      intake: INTAKE,
    });
    const visible = applyListFilters([created.case], {
      id: 'client-b',
      role: 'client',
      client_id: OTHER_SYNTHETIC_CLIENT_ID,
    });
    expect(visible).toHaveLength(0);
  });

  it('ignores a forged client_id filter from a client viewer', async () => {
    const mine = await service().createCase({
      client_id: OTHER_SYNTHETIC_CLIENT_ID,
      intake: { ...INTAKE, member_ref: 'memb_synth_other' },
    });
    const theirs = await service().createCase({
      client_id: SYNTHETIC_CLIENT_ID,
      intake: INTAKE,
    });
    const visible = applyListFilters([mine.case, theirs.case], {
      id: 'client-b',
      role: 'client',
      client_id: OTHER_SYNTHETIC_CLIENT_ID,
    }, { client_id: SYNTHETIC_CLIENT_ID });
    expect(visible.map((c) => c.client_id)).toEqual([OTHER_SYNTHETIC_CLIENT_ID]);
  });

  it('client redaction drops CX-only tasks and packet keys', async () => {
    const created = await service().createCase({
      client_id: SYNTHETIC_CLIENT_ID,
      packet_storage_keys: ['s3://synth/packet/rbac.pdf'],
      intake: INTAKE,
    });
    const withTasks = {
      ...created.case,
      open_tasks: ['request_clinicals', 'resolve_fanout', 'escalation_l1'],
    };
    const client = redactCaseForViewer({ id: 'c', role: 'client', client_id: SYNTHETIC_CLIENT_ID }, withTasks);
    expect(client.open_tasks).toEqual(['request_clinicals']);
    expect(client.packet_storage_keys).toEqual(['[present]']);
    expect(client.intake.member_ref).toBeUndefined();

    const cx = redactCaseForViewer({ id: 'cx', role: 'cx' }, withTasks);
    expect(cx.packet_storage_keys).toEqual([]);
    expect(cx.open_tasks).toContain('resolve_fanout');
    expect(cx.intake.member_ref).toBe('[ref]');
  });

  it('CX list filters stuck and SLA', async () => {
    const svc = service();
    const stuck = await svc.createCase({
      client_id: SYNTHETIC_CLIENT_ID,
      intake: { member_ref: 'memb_synth_stuck' },
    });
    expect(stuck.case.state).toBe('intake_incomplete');
    expect(isStuckCase(stuck.case)).toBe(true);

    const open = await svc.createCase({
      client_id: SYNTHETIC_CLIENT_ID,
      intake: INTAKE,
    });
    const missed = {
      ...open.case,
      sla_status: 'missed' as const,
      open_tasks: ['escalation_l3'],
    };
    expect(isEscalationCase(missed)).toBe(true);

    const cx = { id: 'cx', role: 'cx' as const };
    const stuckOnly = applyListFilters([stuck.case, open.case, missed], cx, { stuck: true });
    expect(stuckOnly.every((c) => isStuckCase(c) || c.case_id === stuck.case.case_id)).toBe(true);
    expect(stuckOnly.some((c) => c.case_id === stuck.case.case_id)).toBe(true);
    expect(stuckOnly.some((c) => c.case_id === open.case.case_id)).toBe(false);

    const slaMissed = applyListFilters([stuck.case, open.case, missed], cx, { sla_status: 'missed' });
    expect(slaMissed).toHaveLength(1);
    expect(slaMissed[0].case_id).toBe(missed.case_id);
  });

  it('role gates keep Client / CX / MD off the wrong PHI surfaces', () => {
    const client = { id: 'c', role: 'client' as const, client_id: SYNTHETIC_CLIENT_ID };
    const cx = { id: 'cx', role: 'cx' as const };
    const md = { id: 'md', role: 'med_review' as const };

    expect(canAccessClientView(client)).toBe(true);
    expect(canAccessClientView(cx)).toBe(false);
    expect(canAccessClientView(md)).toBe(false);

    expect(canAccessCxView(client)).toBe(false);
    expect(canAccessCxNotes(client)).toBe(false);
    expect(canAccessCxView(cx)).toBe(true);
    expect(canAccessCxNotes(md)).toBe(false);
    expect(canAccessCxView(md)).toBe(false);

    expect(canAccessClinicalPacket(client)).toBe(false);
    expect(canAccessClinicalPacket(cx)).toBe(false);
    expect(canAccessClinicalPacket(md)).toBe(true);
    expect(canAccessMedReviewView(client)).toBe(false);
    expect(canAccessMedReviewView(cx)).toBe(false);
    expect(canAccessMedReviewView(md)).toBe(true);

    expect(canAccessCaseAudit(client)).toBe(false);
    expect(canAccessCaseAudit(cx)).toBe(true);
    expect(canAccessCaseAudit(md)).toBe(true);

    expect(canMutateFanout(client)).toBe(false);
    expect(canMutateFanout(cx)).toBe(true);
    expect(canMutateFanout(md)).toBe(true);
  });
});
