import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase', () => ({
  hasSupabaseConfig: () => false,
  getSupabase: () => ({}),
  getServiceClient: () => ({}),
  supabase: {},
}));

vi.mock('@/lib/supabase-server', () => ({
  createServerClient: async () => ({
    auth: { getUser: async () => ({ data: { user: null }, error: null }) },
  }),
}));

describe('VHG demo routes', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('hides the stop-loss API when the flag is off', async () => {
    vi.stubEnv('ENABLE_VHG_SCORE_DEMO', '');
    const { GET } = await import('@/app/api/vhg/stoploss/route');
    const response = await GET(new NextRequest('http://localhost/api/vhg/stoploss'));
    expect(response.status).toBe(404);
  });

  it('returns the entitled synthetic dashboard when the flag is on', async () => {
    vi.stubEnv('ENABLE_VHG_SCORE_DEMO', 'true');
    const { GET } = await import('@/app/api/vhg/stoploss/route');
    const response = await GET(new NextRequest('http://localhost/api/vhg/stoploss'));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.banner).toMatch(/Included at no charge with Vanta Med Review/);
    expect(body.totals.cases_reviewed).toBeGreaterThan(0);
  });

  it('returns a demo criteria result and VHG score for a med-review panel', async () => {
    vi.stubEnv('ENABLE_VHG_SCORE_DEMO', 'true');
    const { GET } = await import('@/app/api/vhg/panel/route');
    const response = await GET(new NextRequest('http://localhost/api/vhg/panel?caseId=vhg-mr-0101'));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.panel.criteria.label).toBe('criteria result (demo)');
    expect(body.panel.score.label).toBe('VHG Score');
    expect(body.panel.score.model_status).toBe('demo_not_validated');
    expect(body.panel.illustrative).toBe(false);
  });
});
