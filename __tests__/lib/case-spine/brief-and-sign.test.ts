import { describe, it, expect, beforeEach } from 'vitest';
import {
  BriefRequiredError,
  CaseSpineService,
  IllegalSignError,
  MemoryCaseSpineStore,
  PackageImmutableError,
  sortMdQueue,
} from '@/lib/case-spine';

const NOW = new Date('2026-09-18T12:00:00.000Z');
const CLIENT = '11111111-1111-1111-1111-111111111111';

const COMPLETE_INTAKE = {
  external_id: 'ext-synth-brief-001',
  member_ref: 'memb_synth_brief',
  requesting_provider: 'prov_synth_brief',
  service_or_rx: 'CPT-73721',
  place_of_service: 'office',
  urgency: 'standard' as const,
  clinicals_pointer: 's3://synth/packet/brief.pdf',
  received_at: NOW.toISOString(),
  benefit_type: 'medical' as const,
};

function service() {
  return new CaseSpineService(new MemoryCaseSpineStore(), () => NOW);
}

async function toBriefing(svc: CaseSpineService, caseId: string) {
  await svc.transitionCase(caseId, { to_state: 'intake_validated' }, 'csr');
  await svc.transitionCase(caseId, { to_state: 'routed' }, 'csr');
  await svc.transitionCase(caseId, { to_state: 'briefing' }, 'csr');
}

describe('sortMdQueue (SLA then priority)', () => {
  it('orders earliest sla_due_at first, then expedited before urgent before standard', () => {
    const ordered = sortMdQueue([
      { sla_due_at: '2026-09-19T12:00:00.000Z', priority: 'standard' as const, case_id: 'late-standard' },
      { sla_due_at: '2026-09-18T18:00:00.000Z', priority: 'standard' as const, case_id: 'soon-standard' },
      { sla_due_at: '2026-09-18T18:00:00.000Z', priority: 'expedited' as const, case_id: 'soon-expedited' },
      { sla_due_at: '2026-09-18T18:00:00.000Z', priority: 'urgent' as const, case_id: 'soon-urgent' },
    ]);
    expect(ordered.map((c) => c.case_id)).toEqual([
      'soon-expedited',
      'soon-urgent',
      'soon-standard',
      'late-standard',
    ]);
  });
});

describe('brief required before md_queue and sign', () => {
  it('rejects transition to md_queue without a brief', async () => {
    const svc = service();
    const created = await svc.createCase({ client_id: CLIENT, intake: COMPLETE_INTAKE });
    await toBriefing(svc, created.case.case_id);
    await expect(
      svc.transitionCase(created.case.case_id, { to_state: 'md_queue' }),
    ).rejects.toBeInstanceOf(BriefRequiredError);
    const again = await svc.getCase(created.case.case_id);
    expect(again.state).toBe('briefing');
    expect(again.brief_id).toBeNull();
  });

  it('rejects sign without a brief (md_queue row missing brief_id)', async () => {
    const store = new MemoryCaseSpineStore();
    const svc = new CaseSpineService(store, () => NOW);
    const created = await svc.createCase({ client_id: CLIENT, intake: COMPLETE_INTAKE });
    await toBriefing(svc, created.case.case_id);
    const current = await svc.getCase(created.case.case_id);
    await store.updateCase({ ...current, state: 'md_queue', brief_id: null });

    await expect(
      svc.signDetermination(
        created.case.case_id,
        { determination: 'approve', rationale: 'synthetic sign' },
        'md_synth',
      ),
    ).rejects.toMatchObject({ code: 'brief_required' });
  });

  it('attaches a synthetic brief then allows md_queue', async () => {
    const svc = service();
    const created = await svc.createCase({
      client_id: CLIENT,
      packet_storage_keys: ['s3://synth/packet/brief.pdf'],
      intake: COMPLETE_INTAKE,
    });
    await svc.transitionCase(created.case.case_id, { to_state: 'intake_validated' });
    await svc.transitionCase(created.case.case_id, { to_state: 'routed' });
    const attached = await svc.attachBrief(
      created.case.case_id,
      { criteria_result: 'meet', enqueue_md: true },
      'system',
    );
    expect(attached.brief.source).toBe('synthetic');
    expect(attached.brief.content_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(attached.case.brief_id).toBe(attached.brief.brief_id);
    expect(attached.case.state).toBe('md_queue');
  });
});

describe('R07–R09 attach brief before md_queue; no silent approve', () => {
  it('criteria meet drafts approve brief and queues MD — does not determine', async () => {
    const svc = service();
    const created = await svc.createCase({ client_id: CLIENT, intake: COMPLETE_INTAKE });
    await toBriefing(svc, created.case.case_id);
    const evaluated = await svc.evaluateCase(
      created.case.case_id,
      { criteria_result: 'meet' },
      'system',
    );
    expect(evaluated.case.brief_id).toBeTruthy();
    expect(evaluated.case.state).toBe('md_queue');
    expect(evaluated.case.determination).toBeNull();
    expect(evaluated.evaluations.find((e) => e.rule_id === 'R07')?.matched).toBe(true);
    expect(evaluated.evaluations.find((e) => e.rule_id === 'R13')?.matched).toBe(false);
  });
});

describe('MD sign writes immutable package + determined + audit', () => {
  it('successful sign → determined, R13 audit, fan-out and billable stubs', async () => {
    const svc = service();
    const created = await svc.createCase({
      client_id: CLIENT,
      packet_storage_keys: ['s3://synth/packet/brief.pdf'],
      intake: COMPLETE_INTAKE,
    });
    await svc.transitionCase(created.case.case_id, { to_state: 'intake_validated' });
    await svc.transitionCase(created.case.case_id, { to_state: 'routed' });
    await svc.attachBrief(created.case.case_id, { criteria_result: 'fail', enqueue_md: true });

    const signed = await svc.signDetermination(
      created.case.case_id,
      { determination: 'deny', rationale: 'Synthetic deny — criteria not met on tokenized packet.' },
      'md_synth_1',
    );

    expect(signed.case.state).toBe('determined');
    expect(signed.case.determination).toBe('deny');
    expect(signed.case.signer_id).toBe('md_synth_1');
    expect(signed.case.determined_at).toBe(NOW.toISOString());
    expect(signed.case.sla_clock).toBe('stopped');
    expect(signed.case.fanout_status).toBe('pending');
    expect(signed.case.fanout_stub?.targets).toContain('F5_billing');
    expect(signed.case.billable_event_id).toBeTruthy();
    expect(signed.case.billable_event_stub?.event).toBe('determination.signed');
    expect(signed.package.storage_key).toBe(`determinations/${created.case.case_id}/1/`);
    expect(signed.package.immutable).toBe(true);
    expect(signed.package.content_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(signed.package.rationale).toContain('Synthetic deny');

    const r13 = signed.audit.filter((e) => e.rule_id === 'R13' && e.note.includes('matched'));
    expect(r13.length).toBeGreaterThanOrEqual(1);
    expect(r13[0].to_state).toBe('determined');
    expect(r13[0].payload_hash).toMatch(/^[a-f0-9]{64}$/);

    const trail = await svc.listAudit(created.case.case_id);
    expect(trail.some((e) => e.note.includes('brief attached'))).toBe(true);
    expect(trail.some((e) => e.rule_id === 'R13')).toBe(true);
  });

  it('refuses a second write of the same package version', async () => {
    const store = new MemoryCaseSpineStore();
    const svc = new CaseSpineService(store, () => NOW);
    const created = await svc.createCase({ client_id: CLIENT, intake: COMPLETE_INTAKE });
    await svc.transitionCase(created.case.case_id, { to_state: 'intake_validated' });
    await svc.transitionCase(created.case.case_id, { to_state: 'routed' });
    await svc.attachBrief(created.case.case_id, { criteria_result: 'meet', enqueue_md: true });
    const first = await svc.signDetermination(
      created.case.case_id,
      { determination: 'approve', rationale: 'first sign' },
      'md_synth_1',
    );
    await expect(store.insertPackage(first.package)).rejects.toBeInstanceOf(PackageImmutableError);
    await expect(
      svc.signDetermination(
        created.case.case_id,
        { determination: 'approve', rationale: 'second sign' },
        'md_synth_1',
      ),
    ).rejects.toBeInstanceOf(IllegalSignError);
  });

  it('listMdQueue returns SLA-then-priority order', async () => {
    const svc = service();
    await svc.seedSyntheticMdQueue('system');
    const queue = await svc.listMdQueue({ id: 'md', role: 'med_review' });
    expect(queue.length).toBeGreaterThanOrEqual(3);
    expect(queue.every((c) => c.state === 'md_queue' && c.brief_id)).toBe(true);
    const resorted = sortMdQueue(queue);
    expect(queue.map((c) => c.case_id)).toEqual(resorted.map((c) => c.case_id));
  });
});
