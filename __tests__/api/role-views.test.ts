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

describe('Phase 5 role views + RBAC', () => {
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

  it('denies a client the other tenant case on list and get', async () => {
    const seeded = await seed();
    expect(seeded.case_ids.length).toBeGreaterThan(0);

    const { GET: list } = await import('@/app/api/case-spine/route');
    const listed = await list(
      req('http://localhost:3000/api/case-spine?client_id=' + SYNTHETIC_CLIENT_ID, {
        role: 'client',
        clientId: OTHER_SYNTHETIC_CLIENT_ID,
      }),
    );
    const body = await listed.json();
    expect(listed.status).toBe(200);
    expect(body.view).toBe('client');
    expect(body.cases.every((c: { client_id: string }) => c.client_id === OTHER_SYNTHETIC_CLIENT_ID)).toBe(true);
    expect(body.cases.some((c: { client_id: string }) => c.client_id === SYNTHETIC_CLIENT_ID)).toBe(false);

    const synthCase = (await list(req('http://localhost:3000/api/case-spine'))).json();
    const all = await synthCase;
    const foreign = all.cases.find((c: { client_id: string }) => c.client_id === SYNTHETIC_CLIENT_ID);
    expect(foreign).toBeTruthy();

    const { GET: getOne } = await import('@/app/api/case-spine/[id]/route');
    const denied = await getOne(
      req(`http://localhost:3000/api/case-spine/${foreign.case_id}`, {
        role: 'client',
        clientId: OTHER_SYNTHETIC_CLIENT_ID,
      }),
      { params: Promise.resolve({ id: foreign.case_id }) },
    );
    expect(denied.status).toBe(404);
  });

  it('client cannot see CX notes or the CX lens', async () => {
    await seed();
    const { GET: notes } = await import('@/app/api/cx/notes/route');
    const notesRes = await notes(
      req('http://localhost:3000/api/cx/notes', { role: 'client', clientId: SYNTHETIC_CLIENT_ID }),
    );
    expect(notesRes.status).toBe(403);
    const notesBody = await notesRes.json();
    expect(notesBody.surface).toBe('cx_notes');

    const { GET: cx } = await import('@/app/api/views/cx/route');
    const cxRes = await cx(
      req('http://localhost:3000/api/views/cx', { role: 'client', clientId: SYNTHETIC_CLIENT_ID }),
    );
    expect(cxRes.status).toBe(403);

    const { GET: client } = await import('@/app/api/views/client/route');
    const clientRes = await client(
      req('http://localhost:3000/api/views/client', { role: 'client', clientId: SYNTHETIC_CLIENT_ID }),
    );
    expect(clientRes.status).toBe(200);
    const lens = await clientRes.json();
    expect(lens.view).toBe('client');
    expect(lens.notes).toBeUndefined();
    expect(lens.cx_notes).toBeUndefined();
    expect(lens.hypercare).toBeUndefined();
    expect(JSON.stringify(lens)).not.toMatch(/fruit basket|hypercare standup|resolve_fanout before Thursday/i);
  });

  it('CX list filters stuck and SLA missed', async () => {
    await seed();
    const { GET } = await import('@/app/api/views/cx/route');
    const stuckRes = await GET(req('http://localhost:3000/api/views/cx?stuck=1', { role: 'concierge' }));
    expect(stuckRes.status).toBe(200);
    const stuck = await stuckRes.json();
    expect(stuck.view).toBe('cx');
    expect(stuck.stuck.length).toBeGreaterThan(0);
    expect(stuck.cases.every((c: { state: string; open_tasks: string[] }) => {
      return (
        ['intake_incomplete', 'awaiting_clinicals', 'fanout_failed'].includes(c.state) ||
        c.open_tasks.includes('request_clinicals') ||
        c.open_tasks.includes('resolve_fanout')
      );
    })).toBe(true);
    expect(stuck.resolve_fanout.length).toBeGreaterThan(0);
    expect(stuck.notes.length).toBeGreaterThan(0);

    const slaRes = await GET(req('http://localhost:3000/api/views/cx?sla_status=missed', { role: 'concierge' }));
    const sla = await slaRes.json();
    expect(sla.cases.length).toBeGreaterThan(0);
    expect(sla.cases.every((c: { sla_status: string }) => c.sla_status === 'missed')).toBe(true);
    expect(sla.escalations.length).toBeGreaterThan(0);
  });

  it('client cannot open the clinical brief surface', async () => {
    await seed();
    const { GET: list } = await import('@/app/api/case-spine/route');
    const listed = await list(req('http://localhost:3000/api/case-spine'));
    const body = await listed.json();
    const any = body.cases[0];
    const { GET: brief } = await import('@/app/api/case-spine/[id]/brief/route');
    const denied = await brief(
      req(`http://localhost:3000/api/case-spine/${any.case_id}/brief`, {
        role: 'client',
        clientId: SYNTHETIC_CLIENT_ID,
      }),
      { params: Promise.resolve({ id: any.case_id }) },
    );
    expect(denied.status).toBe(403);
    const deniedBody = await denied.json();
    expect(deniedBody.surface).toBe('clinical_brief');
  });
});
