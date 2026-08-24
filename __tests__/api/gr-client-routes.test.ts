import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

/**
 * Outbound Gravity Rail routes: missing GRAVITY_RAIL_API_KEY in production
 * is 503 (not a fake workspace). Server-only — these routes never mint ws-* ids.
 */

vi.mock('@/lib/auth-guard', () => ({
  requireAuth: vi.fn().mockResolvedValue({ user: { id: 'u1', role: 'admin' } }),
}));

vi.mock('@/lib/rate-limit-middleware', () => ({
  applyRateLimit: vi.fn().mockResolvedValue(null),
}));

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv('NODE_ENV', 'production');
  vi.stubEnv('GRAVITY_RAIL_API_KEY', '');
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe('GET /api/gr/workspaces — missing API key', () => {
  it('returns 503 not_configured in production (no fake workspace)', async () => {
    const { resetGravityRailClientForTests } = await import('@/lib/gravity-rails');
    resetGravityRailClientForTests();
    const { GET } = await import('@/app/api/gr/workspaces/route');
    const req = new Request('https://app.vantaum.com/api/gr/workspaces') as never;
    const res = await GET(req);
    expect(res.status).toBe(503);
    const json = await res.json();
    expect(json.code).toBe('not_configured');
    expect(JSON.stringify(json)).not.toMatch(/ws-\d+/);
  });
});
