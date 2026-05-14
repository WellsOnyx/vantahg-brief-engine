import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

/**
 * Tests for GET /api/provider/me.
 *
 * Backs the provider portal dashboard. Access requires a
 * practice_users row linking the authenticated user to a practice.
 * If the user has no link, the API returns 403 with a message
 * pointing them at their TPA admin.
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
}

describe('GET /api/provider/me', () => {
  beforeEach(() => {
    vi.resetModules();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns the deterministic demo shape in demo mode', async () => {
    clearSupabaseEnv();
    const { GET } = await import('@/app/api/provider/me/route');
    const res = await GET(new Request('http://localhost:3000/api/provider/me') as never);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.practice.name).toBe('Suncoast Orthopedic');
    expect(body.tpa.name).toBe('Acme TPA');
    expect(body.role).toBe('admin');
  });

  it('returns 401 with no user session', async () => {
    setRealEnv();
    ssrStub.auth.getUser = vi.fn(async () => ({ data: { user: null }, error: null }));
    const { GET } = await import('@/app/api/provider/me/route');
    const res = await GET(new Request('http://localhost:3000/api/provider/me') as never);
    expect(res.status).toBe(401);
  });

  it('returns 403 when user has no practice_users link', async () => {
    setRealEnv();
    ssrStub.auth.getUser = vi.fn(async () => ({
      data: { user: { id: 'u-1', email: 'doctor@example.com' } },
      error: null,
    }));
    supabaseStub.from = vi.fn(((table: string) => {
      if (table === 'practice_users') {
        return {
          select: () => ({
            eq: () => ({
              order: () => ({
                limit: () => ({
                  maybeSingle: async () => ({ data: null, error: null }),
                }),
              }),
            }),
          }),
        };
      }
      return {};
    }) as AnyFn);

    const { GET } = await import('@/app/api/provider/me/route');
    const res = await GET(new Request('http://localhost:3000/api/provider/me') as never);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toMatch(/not linked to a practice/i);
  });
});
