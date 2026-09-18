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
  packet_storage_keys: ['s3://synth/packet/portal.pdf'],
  intake: {
    external_id: 'ext-synth-portal',
    member_ref: 'memb_synth_portal',
    requesting_provider: 'prov_synth_portal',
    service_or_rx: 'CPT-73721',
    place_of_service: 'office',
    urgency: 'standard',
    clinicals_pointer: 's3://synth/packet/portal.pdf',
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
  await transition(
    new Request(`http://localhost:3000/api/case-spine/${caseId}/transition`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ to_state: 'intake_validated' }),
    }) as never,
    { params: Promise.resolve({ id: caseId }) },
  );
  await transition(
    new Request(`http://localhost:3000/api/case-spine/${caseId}/transition`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ to_state: 'routed' }),
    }) as never,
    { params: Promise.resolve({ id: caseId }) },
  );
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
  await sign(
    new Request(`http://localhost:3000/api/case-spine/${caseId}/sign`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ determination: 'approve', rationale: 'Synthetic portal sign.' }),
    }) as never,
    { params: Promise.resolve({ id: caseId }) },
  );
  return caseId;
}

describe('portal determinations (4.1)', () => {
  beforeEach(async () => {
    const { resetCaseSpineService } = await import('@/lib/case-spine');
    resetCaseSpineService();
  });

  it('lists signed determination + download package link', async () => {
    const caseId = await signCase();
    const { GET } = await import('@/app/api/portal/determinations/route');
    const res = await GET(new Request('http://localhost:3000/api/portal/determinations') as never);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.determinations.length).toBeGreaterThanOrEqual(1);
    const row = body.determinations.find((d: { case_id: string }) => d.case_id === caseId);
    expect(row.determination).toBe('approve');
    expect(row.download_url).toContain(`/api/portal/determinations/${caseId}/package`);
    expect(row.letter_available).toBe(true);

    const { GET: getPkg } = await import('@/app/api/portal/determinations/[id]/package/route');
    const pkgRes = await getPkg(
      new Request(`http://localhost:3000/api/portal/determinations/${caseId}/package?format=json`) as never,
      { params: Promise.resolve({ id: caseId }) },
    );
    expect(pkgRes.status).toBe(200);
    const pkg = await pkgRes.json();
    expect(pkg.package.letter_html).toContain('VantaUM determination');
    expect(pkg.package.immutable).toBe(true);
  });
});
