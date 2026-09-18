import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SYNTHETIC_CLIENT_ID } from '@/lib/intake/constants';
import { REPORT_CSV_COLUMNS, parseCsvHeader } from '@/lib/reporting';

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

function req(url: string, opts: { role?: string; clientId?: string } = {}) {
  const headers: Record<string, string> = {};
  if (opts.role) headers['x-vantaum-role'] = opts.role;
  if (opts.clientId) headers['x-vantaum-client-id'] = opts.clientId;
  return new Request(url, { headers }) as never;
}

describe('reports API', () => {
  beforeEach(async () => {
    const { resetCaseSpineService } = await import('@/lib/case-spine');
    const { resetMemoryBillableEventLedger } = await import('@/lib/billing/events');
    const { resetMemoryStatementStore } = await import('@/lib/billing/statement');
    const { resetMemoryFanoutStore } = await import('@/lib/fanout/store');
    const { resetMemoryCxNoteStore } = await import('@/lib/cx');
    resetCaseSpineService();
    resetMemoryBillableEventLedger();
    resetMemoryStatementStore();
    resetMemoryFanoutStore();
    resetMemoryCxNoteStore();
  });

  it('returns five reports and signed volume matches the ledger', async () => {
    const { GET } = await import('@/app/api/reports/route');
    const res = await GET(
      req(`http://localhost:3000/api/reports?seed=synthetic&client_id=${SYNTHETIC_CLIENT_ID}`),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.kinds).toEqual(['volume', 'turnaround', 'outcomes', 'deny_reasons', 'sla']);
    expect(body.volume.ledger_match).toBe(true);
    expect(body.signed_cases).toBe(body.ledger_signed);
    expect(body.signed_cases).toBeGreaterThan(0);
    expect(body.deny_reasons.rows.length).toBeGreaterThan(0);
  });

  it('CSV export uses the contracted columns', async () => {
    const { GET } = await import('@/app/api/reports/[kind]/route');
    for (const kind of Object.keys(REPORT_CSV_COLUMNS) as Array<keyof typeof REPORT_CSV_COLUMNS>) {
      const res = await GET(
        req(`http://localhost:3000/api/reports/${kind}?seed=synthetic&format=csv&client_id=${SYNTHETIC_CLIENT_ID}`),
        { params: Promise.resolve({ kind }) },
      );
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toContain('text/csv');
      const csv = await res.text();
      expect(parseCsvHeader(csv)).toEqual([...REPORT_CSV_COLUMNS[kind]]);
    }
  });

  it('denies a client the reports surface for another tenant only by binding', async () => {
    const { GET } = await import('@/app/api/reports/route');
    await GET(req('http://localhost:3000/api/reports?seed=synthetic'));
    const res = await GET(
      req(`http://localhost:3000/api/reports?client_id=${SYNTHETIC_CLIENT_ID}`, {
        role: 'client',
        clientId: '22222222-2222-2222-2222-222222222222',
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.client_id).toBe('22222222-2222-2222-2222-222222222222');
    expect(body.signed_cases).toBe(0);
  });
});
