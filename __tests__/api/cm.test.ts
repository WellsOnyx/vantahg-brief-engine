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

function req(url: string) {
  return new Request(url) as never;
}

describe('CM queue + CSV API', () => {
  beforeEach(async () => {
    const { resetCaseSpineService } = await import('@/lib/case-spine');
    const { resetMemoryFanoutStore } = await import('@/lib/fanout/store');
    const { resetMemoryCxNoteStore } = await import('@/lib/cx');
    const { resetCmHandoffService } = await import('@/lib/cm');
    resetCaseSpineService();
    resetMemoryFanoutStore();
    resetMemoryCxNoteStore();
    resetCmHandoffService();
  });

  it('lists only flagged determinations and never the unflagged approve', async () => {
    const { GET } = await import('@/app/api/cm/queue/route');
    const res = await GET(
      req(`http://localhost:3000/api/cm/queue?seed=synthetic&client_id=${SYNTHETIC_CLIENT_ID}`),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.items.length).toBeGreaterThan(0);
    expect(body.items.every((item: { flags: string[] }) => item.flags.length > 0)).toBe(true);
    const blob = JSON.stringify(body);
    expect(blob).not.toMatch(/approve-clean|ext-synth-p6-approve-clean/);
    expect(blob).toMatch(/high_cost/);
  });

  it('daily CSV stub is flagged-only', async () => {
    const { GET } = await import('@/app/api/cm/csv/route');
    const jsonRes = await GET(
      req(`http://localhost:3000/api/cm/csv?seed=synthetic&format=json&client_id=${SYNTHETIC_CLIENT_ID}`),
    );
    expect(jsonRes.status).toBe(200);
    const body = await jsonRes.json();
    expect(body.stub).toBe(true);
    expect(body.columns).toEqual([
      'case_id',
      'external_id',
      'flags',
      'determination',
      'determined_at',
      'secure_summary_url',
    ]);
    expect(body.items.every((item: { flags: string[] }) => item.flags.length > 0)).toBe(true);
    expect(JSON.stringify(body)).not.toMatch(/approve-clean|ext-synth-p6-approve-clean/);

    const csvRes = await GET(
      req(`http://localhost:3000/api/cm/csv?seed=synthetic&client_id=${SYNTHETIC_CLIENT_ID}`),
    );
    expect(csvRes.status).toBe(200);
    const csv = await csvRes.text();
    expect(csv.split('\n')[0]).toBe(body.columns.join(','));
    expect(csv).toMatch(/high_cost/);
    expect(csv).not.toMatch(/approve-clean|ext-synth-p6-approve-clean/);
  });
});
