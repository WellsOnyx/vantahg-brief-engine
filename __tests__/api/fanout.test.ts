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
  packet_storage_keys: ['s3://synth/packet/fanout-api.pdf'],
  intake: {
    external_id: 'ext-synth-fanout-api',
    member_ref: 'memb_synth_fanout_api',
    requesting_provider: 'prov_synth_fanout_api',
    service_or_rx: 'CPT-73721',
    place_of_service: 'office',
    urgency: 'standard',
    clinicals_pointer: 's3://synth/packet/fanout-api.pdf',
    received_at: '2026-09-18T12:00:00.000Z',
    benefit_type: 'medical',
  },
};

async function signCase() {
  const { POST } = await import('@/app/api/case-spine/route');
  const createdRes = await POST(
    new Request('http://localhost:3000/api/case-spine', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(INTAKE),
    }) as never,
  );
  const created = await createdRes.json();
  const caseId = created.case.case_id as string;
  const { POST: transition } = await import('@/app/api/case-spine/[id]/transition/route');
  for (const to_state of ['intake_validated', 'routed']) {
    await transition(
      new Request(`http://localhost:3000/api/case-spine/${caseId}/transition`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ to_state }),
      }) as never,
      { params: Promise.resolve({ id: caseId }) },
    );
  }
  const { POST: attach } = await import('@/app/api/case-spine/[id]/brief/route');
  await attach(
    new Request(`http://localhost:3000/api/case-spine/${caseId}/brief`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ criteria_result: 'meet', enqueue_md: true }),
    }) as never,
    { params: Promise.resolve({ id: caseId }) },
  );
  const { POST: sign } = await import('@/app/api/case-spine/[id]/sign/route');
  const signed = await sign(
    new Request(`http://localhost:3000/api/case-spine/${caseId}/sign`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ determination: 'approve', rationale: 'Synthetic API fan-out.' }),
    }) as never,
    { params: Promise.resolve({ id: caseId }) },
  );
  return { caseId, signed: await signed.json() };
}

describe('fan-out API', () => {
  beforeEach(async () => {
    const { resetMemoryFanoutStore } = await import('@/lib/fanout/store');
    const { resetFanoutService } = await import('@/lib/fanout/service');
    const { resetCaseSpineService } = await import('@/lib/case-spine');
    resetMemoryFanoutStore();
    resetFanoutService();
    resetCaseSpineService();
  });

  it('POST fanout completes when webhook is not configured', async () => {
    const { caseId, signed } = await signCase();
    expect(signed.case.fanout_status).toBe('pending');

    const { POST } = await import('@/app/api/case-spine/[id]/fanout/route');
    const res = await POST(
      new Request(`http://localhost:3000/api/case-spine/${caseId}/fanout`, { method: 'POST' }) as never,
      { params: Promise.resolve({ id: caseId }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.fanout.fanout_status).toBe('complete');
    expect(body.fanout.required_ok).toBe(true);
    expect(body.fanout.billable_event_ids.length).toBeGreaterThanOrEqual(1);
  });
});
