import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase', () => ({
  hasSupabaseConfig: () => false,
  getSupabase: () => ({}),
  getServiceClient: () => ({}),
  supabase: {},
}));

vi.mock('@/lib/supabase-server', () => ({
  createServerClient: async () => ({
    auth: {
      getUser: async () => ({ data: { user: null }, error: null }),
    },
    from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: null, error: null }) }) }) }),
  }),
}));

const INTAKE = {
  client_id: '11111111-1111-1111-1111-111111111111',
  packet_storage_keys: ['s3://synth/packet/api.pdf'],
  intake: {
    external_id: 'ext-synth-sign-api',
    member_ref: 'memb_synth_sign_api',
    requesting_provider: 'prov_synth_sign_api',
    service_or_rx: 'Rx-SYNTH-SIGN',
    place_of_service: 'office',
    urgency: 'standard',
    clinicals_pointer: 's3://synth/packet/api.pdf',
    received_at: '2026-09-18T12:00:00.000Z',
    benefit_type: 'medical',
  },
};

async function createAndQueue() {
  const { POST } = await import('@/app/api/case-spine/route');
  const createdRes = await POST(
    new Request('http://localhost:3000/api/case-spine', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(INTAKE),
    }) as never,
  );
  const created = await createdRes.json();
  const { POST: transition } = await import('@/app/api/case-spine/[id]/transition/route');
  await transition(
    new Request(`http://localhost:3000/api/case-spine/${created.case.case_id}/transition`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ to_state: 'intake_validated' }),
    }) as never,
    { params: Promise.resolve({ id: created.case.case_id }) },
  );
  await transition(
    new Request(`http://localhost:3000/api/case-spine/${created.case.case_id}/transition`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ to_state: 'routed' }),
    }) as never,
    { params: Promise.resolve({ id: created.case.case_id }) },
  );
  return created.case.case_id as string;
}

describe('Phase 3 brief + sign APIs', () => {
  beforeEach(async () => {
    const { resetCaseSpineService } = await import('@/lib/case-spine');
    resetCaseSpineService();
  });

  it('rejects md_queue transition without a brief (409 brief_required)', async () => {
    const caseId = await createAndQueue();
    const { POST: transition } = await import('@/app/api/case-spine/[id]/transition/route');
    await transition(
      new Request(`http://localhost:3000/api/case-spine/${caseId}/transition`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ to_state: 'briefing' }),
      }) as never,
      { params: Promise.resolve({ id: caseId }) },
    );
    const res = await transition(
      new Request(`http://localhost:3000/api/case-spine/${caseId}/transition`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ to_state: 'md_queue' }),
      }) as never,
      { params: Promise.resolve({ id: caseId }) },
    );
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe('brief_required');
  });

  it('rejects sign without a brief', async () => {
    const caseId = await createAndQueue();
    const { POST: sign } = await import('@/app/api/case-spine/[id]/sign/route');
    const res = await sign(
      new Request(`http://localhost:3000/api/case-spine/${caseId}/sign`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ determination: 'approve', rationale: 'should fail' }),
      }) as never,
      { params: Promise.resolve({ id: caseId }) },
    );
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe('not_in_md_queue');
  });

  it('attach brief + sign → determined and audit trail', async () => {
    const caseId = await createAndQueue();
    const { POST: attach } = await import('@/app/api/case-spine/[id]/brief/route');
    const attachedRes = await attach(
      new Request(`http://localhost:3000/api/case-spine/${caseId}/brief`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ criteria_result: 'meet', enqueue_md: true }),
      }) as never,
      { params: Promise.resolve({ id: caseId }) },
    );
    expect(attachedRes.status).toBe(201);
    const attached = await attachedRes.json();
    expect(attached.case.state).toBe('md_queue');
    expect(attached.brief.brief_id).toBeTruthy();

    const { POST: sign } = await import('@/app/api/case-spine/[id]/sign/route');
    const signedRes = await sign(
      new Request(`http://localhost:3000/api/case-spine/${caseId}/sign`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          determination: 'approve',
          rationale: 'Synthetic MD confirm of draft approve brief.',
        }),
      }) as never,
      { params: Promise.resolve({ id: caseId }) },
    );
    expect(signedRes.status).toBe(200);
    const signed = await signedRes.json();
    expect(signed.case.state).toBe('determined');
    expect(signed.case.fanout_status).toBe('pending');
    expect(signed.case.billable_event_id).toBeTruthy();
    expect(signed.package.storage_key).toContain(`determinations/${caseId}/1/`);
    expect(signed.audit.some((e: { rule_id: string | null }) => e.rule_id === 'R13')).toBe(true);

    const { GET: getAudit } = await import('@/app/api/case-spine/[id]/audit/route');
    const auditRes = await getAudit(
      new Request(`http://localhost:3000/api/case-spine/${caseId}/audit`) as never,
      { params: Promise.resolve({ id: caseId }) },
    );
    const auditBody = await auditRes.json();
    expect(auditBody.events.some((e: { to_state: string }) => e.to_state === 'determined')).toBe(true);
  });

  it('md-queue seed is sorted by SLA then priority', async () => {
    const { POST } = await import('@/app/api/case-spine/md-queue/route');
    const res = await POST(
      new Request('http://localhost:3000/api/case-spine/md-queue', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ seed: true }),
      }) as never,
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.cases.length).toBeGreaterThanOrEqual(3);
    const dues = body.cases.map((c: { sla_due_at: string; priority: string }) => c.sla_due_at);
    const sortedDues = [...dues].sort();
    expect(dues).toEqual(sortedDues);
    const firstDue = body.cases[0].sla_due_at;
    const sameDue = body.cases.filter((c: { sla_due_at: string }) => c.sla_due_at === firstDue);
    if (sameDue.length > 1) {
      const rank: Record<string, number> = { expedited: 0, urgent: 1, standard: 2 };
      const ranks = sameDue.map((c: { priority: string }) => rank[c.priority]);
      expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
    }
  });
});
