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

function req(url: string, opts: { role?: string } = {}) {
  const headers: Record<string, string> = {};
  if (opts.role) headers['x-vantaum-role'] = opts.role;
  return new Request(url, { headers }) as never;
}

describe('ops scoreboard API', () => {
  beforeEach(async () => {
    const { resetCaseSpineService } = await import('@/lib/case-spine');
    const { resetMemoryFanoutStore } = await import('@/lib/fanout/store');
    const { resetMemoryCxNoteStore } = await import('@/lib/cx');
    resetCaseSpineService();
    resetMemoryFanoutStore();
    resetMemoryCxNoteStore();
  });

  it('shows fan-out fail rate, stuck-case count, and R10–R12 escalations to CX', async () => {
    const { GET } = await import('@/app/api/ops/scoreboard/route');
    const res = await GET(
      req(`http://localhost:3000/api/ops/scoreboard?seed=synthetic&client_id=${SYNTHETIC_CLIENT_ID}`, {
        role: 'concierge',
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.view).toBe('ops');
    expect(body.fanout.failed).toBeGreaterThan(0);
    expect(body.fanout.fail_rate).toBeGreaterThan(0);
    expect(body.fanout.fail_rate).toBeLessThanOrEqual(1);
    expect(body.stuck.count).toBeGreaterThanOrEqual(2);
    expect(body.stuck.awaiting_clinicals).toBeGreaterThan(0);
    expect(body.stuck.fanout_failed).toBeGreaterThan(0);
    expect(body.escalations.l3).toBeGreaterThan(0);
    expect(body.escalations.total).toBeGreaterThan(0);
    expect(body.fanout.open_cx_tasks).toBeGreaterThan(0);
    expect(Object.keys(body).sort()).toEqual(
      ['client_id', 'demo', 'escalations', 'fanout', 'stuck', 'view'].sort(),
    );
    expect(JSON.stringify(body)).not.toMatch(/memb_|patient|ssn|date_of_birth|clinicals_pointer/i);
  });

  it('shows the same aggregates to admin', async () => {
    const { GET } = await import('@/app/api/ops/scoreboard/route');
    const res = await GET(
      req(`http://localhost:3000/api/ops/scoreboard?seed=synthetic&client_id=${SYNTHETIC_CLIENT_ID}`, {
        role: 'admin',
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.stuck.count).toBeGreaterThan(0);
    expect(body.fanout.fail_rate).toBeGreaterThan(0);
  });

  it('hides the scoreboard from clients', async () => {
    const { GET } = await import('@/app/api/ops/scoreboard/route');
    const res = await GET(
      req('http://localhost:3000/api/ops/scoreboard', { role: 'client' }),
    );
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.surface).toBe('ops_scoreboard');
  });
});
