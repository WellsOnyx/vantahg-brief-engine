import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

/**
 * Tests for GET /api/tpa/me.
 *
 * This endpoint backs the TPA portal dashboard. The contract the UI
 * depends on:
 *   - In demo mode: deterministic { tpa, practices, case_counts } shape
 *   - In real mode without a session: 401 (the portal redirects to /login)
 *   - In real mode with a session whose email has no matching client row: 403
 *     with a "Contact support" message
 */

vi.mock('@/lib/rate-limit-middleware', () => ({
  applyRateLimit: vi.fn().mockResolvedValue(null),
}));

vi.mock('@/lib/security', () => ({
  getRequestContext: vi.fn().mockReturnValue({ ip: 'test', userAgent: 'test' }),
}));

type AnyFn = (...args: unknown[]) => unknown;
const supabaseStub = { from: vi.fn() as AnyFn };
const ssrStub = {
  auth: { getUser: vi.fn() as AnyFn },
};

vi.mock('@/lib/supabase', () => ({
  getServiceClient: () => supabaseStub,
  hasSupabaseConfig: () => true,
}));

vi.mock('@/lib/supabase-server', () => ({
  createServerClient: async () => ssrStub,
}));

function clearSupabaseEnv() {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
  vi.stubEnv('SUPABASE_URL', '');
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '');
}

function setRealEnv() {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co');
  vi.stubEnv('SUPABASE_URL', 'https://example.supabase.co');
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-key');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'anon');
}

describe('GET /api/tpa/me', () => {
  beforeEach(() => {
    vi.resetModules();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns the deterministic demo shape in demo mode', async () => {
    clearSupabaseEnv();
    const { GET } = await import('@/app/api/tpa/me/route');
    const res = await GET(new Request('http://localhost:3000/api/tpa/me') as never);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.tpa.name).toBe('Acme TPA');
    expect(Array.isArray(body.practices)).toBe(true);
    expect(body.practices.length).toBeGreaterThan(0);
    expect(body.case_counts).toMatchObject({
      total: expect.any(Number),
      active: expect.any(Number),
      this_month: expect.any(Number),
    });
  });

  it('returns 401 when no user session in real mode', async () => {
    setRealEnv();
    ssrStub.auth.getUser = vi.fn(async () => ({ data: { user: null }, error: null }));
    const { GET } = await import('@/app/api/tpa/me/route');
    const res = await GET(new Request('http://localhost:3000/api/tpa/me') as never);
    expect(res.status).toBe(401);
  });

  it('returns 403 when the user email has no matching client row', async () => {
    setRealEnv();
    ssrStub.auth.getUser = vi.fn(async () => ({
      data: { user: { id: 'u-1', email: 'nobody@example.com' } },
      error: null,
    }));
    supabaseStub.from = vi.fn(((table: string) => {
      if (table === 'clients') {
        return {
          select: () => ({
            eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }),
          }),
        };
      }
      return {};
    }) as AnyFn);

    const { GET } = await import('@/app/api/tpa/me/route');
    const res = await GET(new Request('http://localhost:3000/api/tpa/me') as never);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toMatch(/no tpa tenant linked/i);
  });
});
