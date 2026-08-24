import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('@/lib/audit', () => ({
  logAuditEvent: vi.fn().mockResolvedValue(undefined),
  logSecurityEvent: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/security', () => ({
  getRequestContext: vi.fn().mockReturnValue({ ip: 'test', userAgent: 'test' }),
}));

vi.mock('@/lib/rate-limit-middleware', () => ({
  applyRateLimit: vi.fn().mockResolvedValue(null),
}));

function clearSupabaseEnv() {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
  vi.stubEnv('SUPABASE_URL', '');
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', '');
}

describe('GET /api/intake/efax — fail-closed auth', () => {
  beforeEach(() => {
    vi.resetModules();
    clearSupabaseEnv();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns 401 in production demo mode (unauthenticated PHI leak closed)', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const { GET } = await import('@/app/api/intake/efax/route');
    const res = await GET(
      new Request('https://app.vantaum.com/api/intake/efax') as never,
    );
    expect(res.status).toBe(401);
  });

  it('returns 401 in production demo mode even with the preview cookie', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const { GET } = await import('@/app/api/intake/efax/route');
    const res = await GET(
      new Request('https://app.vantaum.com/api/intake/efax', {
        headers: { cookie: 'demo_access=granted' },
      }) as never,
    );
    expect(res.status).toBe(401);
  });

  it('serves demo queue in local/dev demo mode', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    const { GET } = await import('@/app/api/intake/efax/route');
    const res = await GET(
      new Request('http://localhost:3000/api/intake/efax') as never,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBeGreaterThan(0);
  });
});
