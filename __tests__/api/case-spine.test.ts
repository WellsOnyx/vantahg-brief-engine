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

describe('POST/GET /api/case-spine', () => {
  beforeEach(async () => {
    const { resetCaseSpineService } = await import('@/lib/case-spine');
    resetCaseSpineService();
  });

  it('creates a synthetic case and retrieves it', async () => {
    const { POST, GET } = await import('@/app/api/case-spine/route');
    const createReq = new Request('http://localhost:3000/api/case-spine', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        client_id: '11111111-1111-1111-1111-111111111111',
        intake: {
          external_id: 'ext-synth-api-1',
          member_ref: 'memb_synth_api',
          requesting_provider: 'prov_synth_api',
          service_or_rx: 'Rx-SYNTH-1',
          place_of_service: 'office',
          urgency: 'standard',
          clinicals_pointer: 's3://synth/api/1.pdf',
          received_at: '2026-09-18T12:00:00.000Z',
          benefit_type: 'medical',
        },
      }),
    });
    const createdRes = await POST(createReq as never);
    expect(createdRes.status).toBe(201);
    const created = await createdRes.json();
    expect(created.case.case_id).toBeTruthy();
    expect(created.case.state).toBe('received');
    expect(created.case.lane).toBe('medical');

    const { GET: getOne } = await import('@/app/api/case-spine/[id]/route');
    const one = await getOne(
      new Request(`http://localhost:3000/api/case-spine/${created.case.case_id}`) as never,
      { params: Promise.resolve({ id: created.case.case_id }) },
    );
    expect(one.status).toBe(200);
    const body = await one.json();
    expect(body.case.case_id).toBe(created.case.case_id);

    const list = await GET(new Request('http://localhost:3000/api/case-spine') as never);
    const listed = await list.json();
    expect(listed.cases.some((c: { case_id: string }) => c.case_id === created.case.case_id)).toBe(true);
  });

  it('rejects an illegal transition with 409', async () => {
    const { POST } = await import('@/app/api/case-spine/route');
    const createdRes = await POST(
      new Request('http://localhost:3000/api/case-spine', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          client_id: '11111111-1111-1111-1111-111111111111',
          intake: { member_ref: 'memb_synth_api' },
        }),
      }) as never,
    );
    const created = await createdRes.json();

    const { POST: transition } = await import('@/app/api/case-spine/[id]/transition/route');
    const res = await transition(
      new Request(`http://localhost:3000/api/case-spine/${created.case.case_id}/transition`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ to_state: 'determined' }),
      }) as never,
      { params: Promise.resolve({ id: created.case.case_id }) },
    );
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe('illegal_transition');
  });
});
