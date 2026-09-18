import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SYNTHETIC_CLIENT_ID } from '@/lib/intake/constants';

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
  client_id: SYNTHETIC_CLIENT_ID,
  packet_storage_keys: ['s3://synth/packet/stmt.pdf'],
  intake: {
    external_id: 'ext-synth-stmt',
    member_ref: 'memb_synth_stmt',
    requesting_provider: 'prov_synth_stmt',
    service_or_rx: 'CPT-73721',
    place_of_service: 'office',
    urgency: 'standard',
    clinicals_pointer: 's3://synth/packet/stmt.pdf',
    received_at: '2026-09-18T12:00:00.000Z',
    benefit_type: 'medical',
  },
};

describe('billing statement API', () => {
  beforeEach(async () => {
    const { resetMemoryStatementStore } = await import('@/lib/billing/statement');
    const { resetCaseSpineService } = await import('@/lib/case-spine');
    resetMemoryStatementStore();
    resetCaseSpineService();
  });

  it('generates a statement that lists open events for the test client', async () => {
    const { POST: create } = await import('@/app/api/case-spine/route');
    const createdRes = await create(
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
    await sign(
      new Request(`http://localhost:3000/api/case-spine/${caseId}/sign`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ determination: 'approve', rationale: 'Synthetic statement case.' }),
      }) as never,
      { params: Promise.resolve({ id: caseId }) },
    );

    const { GET: listEvents } = await import('@/app/api/billing/events/route');
    const eventsRes = await listEvents(
      new Request(`http://localhost:3000/api/billing/events?client_id=${SYNTHETIC_CLIENT_ID}`) as never,
    );
    const eventsBody = await eventsRes.json();
    expect(eventsBody.events.length).toBeGreaterThanOrEqual(1);
    expect(eventsBody.events[0].case_id).toBe(caseId);
    expect(eventsBody.events[0].status).toBe('open');

    const { POST } = await import('@/app/api/billing/statements/route');
    const stmtRes = await POST(
      new Request('http://localhost:3000/api/billing/statements', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ client_id: SYNTHETIC_CLIENT_ID }),
      }) as never,
    );
    expect(stmtRes.status).toBe(201);
    const stmt = await stmtRes.json();
    expect(stmt.statement.events.length).toBeGreaterThanOrEqual(1);
    expect(stmt.statement.events.some((e: { case_id: string }) => e.case_id === caseId)).toBe(true);
    expect(stmt.statement.html).toContain('prior_auth');
  });
});
