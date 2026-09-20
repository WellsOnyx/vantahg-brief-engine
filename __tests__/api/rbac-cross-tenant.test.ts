import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OTHER_SYNTHETIC_CLIENT_ID, SYNTHETIC_CLIENT_ID } from '@/lib/intake/constants';

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

function req(
  url: string,
  opts: { role?: string; clientId?: string; method?: string; body?: unknown } = {},
) {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (opts.role) headers['x-vantaum-role'] = opts.role;
  if (opts.clientId) headers['x-vantaum-client-id'] = opts.clientId;
  return new Request(url, {
    method: opts.method ?? 'GET',
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  }) as never;
}

async function seed() {
  const { seedSyntheticRoleViews } = await import('@/lib/views/seed');
  return seedSyntheticRoleViews('test');
}

async function listAllCases() {
  const { GET } = await import('@/app/api/case-spine/route');
  const res = await GET(req('http://localhost:3000/api/case-spine'));
  const body = await res.json();
  return body.cases as Array<{
    case_id: string;
    client_id: string;
    state: string;
    packet_storage_keys: string[];
    intake: { member_ref?: string | null };
  }>;
}

function tenantA(cases: Awaited<ReturnType<typeof listAllCases>>) {
  const found = cases.find((c) => c.client_id === SYNTHETIC_CLIENT_ID);
  expect(found).toBeTruthy();
  return found!;
}

describe('Phase 5.3 RBAC — cross-tenant + wrong PHI surfaces', () => {
  beforeEach(async () => {
    const { resetCaseSpineService } = await import('@/lib/case-spine');
    const { resetMemoryCxNoteStore } = await import('@/lib/cx');
    const { resetMemoryFanoutStore } = await import('@/lib/fanout/store');
    const { resetMemoryStatementStore } = await import('@/lib/billing/statement');
    resetCaseSpineService();
    resetMemoryCxNoteStore();
    resetMemoryFanoutStore();
    resetMemoryStatementStore();
  });

  it('client of tenant B cannot read tenant A case, portal package, or forged client lens', async () => {
    await seed();
    const foreign = tenantA(await listAllCases());
    const clientB = { role: 'client', clientId: OTHER_SYNTHETIC_CLIENT_ID };

    const { GET: getOne } = await import('@/app/api/case-spine/[id]/route');
    const caseRes = await getOne(
      req(`http://localhost:3000/api/case-spine/${foreign.case_id}`, clientB),
      { params: Promise.resolve({ id: foreign.case_id }) },
    );
    expect(caseRes.status).toBe(404);

    const { GET: portalPkg } = await import('@/app/api/portal/determinations/[id]/package/route');
    const pkgRes = await portalPkg(
      req(`http://localhost:3000/api/portal/determinations/${foreign.case_id}/package?format=json`, clientB),
      { params: Promise.resolve({ id: foreign.case_id }) },
    );
    expect(pkgRes.status).toBe(404);

    const { GET: portalList } = await import('@/app/api/portal/determinations/route');
    const listed = await portalList(
      req(`http://localhost:3000/api/portal/determinations?client_id=${SYNTHETIC_CLIENT_ID}`, clientB),
    );
    expect(listed.status).toBe(200);
    const portal = await listed.json();
    expect(portal.determinations.every((d: { client_id?: string; case_id: string }) => d.case_id !== foreign.case_id)).toBe(true);

    const { GET: clientLens } = await import('@/app/api/views/client/route');
    const lensRes = await clientLens(
      req(`http://localhost:3000/api/views/client?client_id=${SYNTHETIC_CLIENT_ID}`, clientB),
    );
    expect(lensRes.status).toBe(200);
    const lens = await lensRes.json();
    expect(lens.client_id).toBe(OTHER_SYNTHETIC_CLIENT_ID);
    const blob = JSON.stringify(lens);
    expect(blob).not.toContain(SYNTHETIC_CLIENT_ID);
    expect(blob).not.toMatch(/memb_synth_p5_|s3:\/\/synth\/packet/);
  });

  it('client cannot open CX, med-review, or clinical PHI surfaces', async () => {
    await seed();
    const foreign = tenantA(await listAllCases());
    const clientA = { role: 'client', clientId: SYNTHETIC_CLIENT_ID };

    const { GET: cxNotes } = await import('@/app/api/cx/notes/route');
    const notesRes = await cxNotes(req('http://localhost:3000/api/cx/notes', clientA));
    expect(notesRes.status).toBe(403);
    expect((await notesRes.json()).surface).toBe('cx_notes');

    const { GET: cxView } = await import('@/app/api/views/cx/route');
    expect((await cxView(req('http://localhost:3000/api/views/cx', clientA))).status).toBe(403);

    const { GET: mdQueue } = await import('@/app/api/case-spine/md-queue/route');
    const queueRes = await mdQueue(req('http://localhost:3000/api/case-spine/md-queue', clientA));
    expect(queueRes.status).toBe(403);
    expect((await queueRes.json()).surface).toBe('med_review');

    const { GET: brief } = await import('@/app/api/case-spine/[id]/brief/route');
    const briefRes = await brief(
      req(`http://localhost:3000/api/case-spine/${foreign.case_id}/brief`, clientA),
      { params: Promise.resolve({ id: foreign.case_id }) },
    );
    expect(briefRes.status).toBe(403);
    expect((await briefRes.json()).surface).toBe('clinical_brief');

    const { GET: pkg } = await import('@/app/api/case-spine/[id]/package/route');
    const pkgRes = await pkg(
      req(`http://localhost:3000/api/case-spine/${foreign.case_id}/package`, clientA),
      { params: Promise.resolve({ id: foreign.case_id }) },
    );
    expect(pkgRes.status).toBe(403);
    expect((await pkgRes.json()).surface).toBe('clinical_package');

    const { POST: attach } = await import('@/app/api/case-spine/[id]/brief/route');
    const attachRes = await attach(
      req(`http://localhost:3000/api/case-spine/${foreign.case_id}/brief`, {
        ...clientA,
        method: 'POST',
        body: { criteria_result: 'meet' },
      }),
      { params: Promise.resolve({ id: foreign.case_id }) },
    );
    expect(attachRes.status).toBe(403);
    expect((await attachRes.json()).surface).toBe('clinical_brief');

    const { POST: sign } = await import('@/app/api/case-spine/[id]/sign/route');
    const signRes = await sign(
      req(`http://localhost:3000/api/case-spine/${foreign.case_id}/sign`, {
        ...clientA,
        method: 'POST',
        body: { determination: 'approve', rationale: 'Client must not sign.' },
      }),
      { params: Promise.resolve({ id: foreign.case_id }) },
    );
    expect(signRes.status).toBe(403);
    expect((await signRes.json()).surface).toBe('med_review');

    const { GET: audit } = await import('@/app/api/case-spine/[id]/audit/route');
    const auditRes = await audit(
      req(`http://localhost:3000/api/case-spine/${foreign.case_id}/audit`, clientA),
      { params: Promise.resolve({ id: foreign.case_id }) },
    );
    expect(auditRes.status).toBe(403);
    expect((await auditRes.json()).surface).toBe('audit');

    const { POST: fanout } = await import('@/app/api/case-spine/[id]/fanout/route');
    const fanoutRes = await fanout(
      req(`http://localhost:3000/api/case-spine/${foreign.case_id}/fanout`, {
        ...clientA,
        method: 'POST',
      }),
      { params: Promise.resolve({ id: foreign.case_id }) },
    );
    expect(fanoutRes.status).toBe(403);
    expect((await fanoutRes.json()).surface).toBe('fanout');
  });

  it('client of tenant B gets 404 on tenant A fan-out status', async () => {
    await seed();
    const foreign = tenantA(await listAllCases());
    const { GET } = await import('@/app/api/case-spine/[id]/fanout/route');
    const res = await GET(
      req(`http://localhost:3000/api/case-spine/${foreign.case_id}/fanout`, {
        role: 'client',
        clientId: OTHER_SYNTHETIC_CLIENT_ID,
      }),
      { params: Promise.resolve({ id: foreign.case_id }) },
    );
    expect(res.status).toBe(404);
  });

  it('CX cannot open med-review or clinical packet surfaces', async () => {
    await seed();
    const foreign = tenantA(await listAllCases());
    const cx = { role: 'concierge' };

    const { GET: mdQueue } = await import('@/app/api/case-spine/md-queue/route');
    const queueRes = await mdQueue(req('http://localhost:3000/api/case-spine/md-queue', cx));
    expect(queueRes.status).toBe(403);
    expect((await queueRes.json()).surface).toBe('med_review');

    const { GET: brief } = await import('@/app/api/case-spine/[id]/brief/route');
    const briefRes = await brief(
      req(`http://localhost:3000/api/case-spine/${foreign.case_id}/brief`, cx),
      { params: Promise.resolve({ id: foreign.case_id }) },
    );
    expect(briefRes.status).toBe(403);
    expect((await briefRes.json()).surface).toBe('clinical_brief');

    const { GET: pkg } = await import('@/app/api/case-spine/[id]/package/route');
    const pkgRes = await pkg(
      req(`http://localhost:3000/api/case-spine/${foreign.case_id}/package`, cx),
      { params: Promise.resolve({ id: foreign.case_id }) },
    );
    expect(pkgRes.status).toBe(403);
    expect((await pkgRes.json()).surface).toBe('clinical_package');

    const { POST: sign } = await import('@/app/api/case-spine/[id]/sign/route');
    const signRes = await sign(
      req(`http://localhost:3000/api/case-spine/${foreign.case_id}/sign`, {
        ...cx,
        method: 'POST',
        body: { determination: 'approve', rationale: 'CX must not sign.' },
      }),
      { params: Promise.resolve({ id: foreign.case_id }) },
    );
    expect(signRes.status).toBe(403);
    expect((await signRes.json()).surface).toBe('med_review');

    const { GET: getOne } = await import('@/app/api/case-spine/[id]/route');
    const caseRes = await getOne(
      req(`http://localhost:3000/api/case-spine/${foreign.case_id}`, cx),
      { params: Promise.resolve({ id: foreign.case_id }) },
    );
    expect(caseRes.status).toBe(200);
    const body = await caseRes.json();
    expect(body.case.packet_storage_keys).toEqual([]);
    expect(body.case.intake.member_ref === null || body.case.intake.member_ref === '[ref]').toBe(true);
    expect(JSON.stringify(body)).not.toMatch(/s3:\/\/synth\/packet/);
  });

  it('MD cannot open CX notes or the CX lens', async () => {
    await seed();
    const md = { role: 'reviewer' };

    const { GET: notes } = await import('@/app/api/cx/notes/route');
    const notesRes = await notes(req('http://localhost:3000/api/cx/notes', md));
    expect(notesRes.status).toBe(403);
    expect((await notesRes.json()).surface).toBe('cx_notes');

    const { GET: cx } = await import('@/app/api/views/cx/route');
    const cxRes = await cx(req('http://localhost:3000/api/views/cx', md));
    expect(cxRes.status).toBe(403);

    const { GET: client } = await import('@/app/api/views/client/route');
    const clientRes = await client(req('http://localhost:3000/api/views/client', md));
    expect(clientRes.status).toBe(403);
    expect((await clientRes.json()).surface).toBe('client');
  });
});
