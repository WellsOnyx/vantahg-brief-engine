import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

/**
 * Tests for POST /api/tpa/practices/[id]/invite.
 *
 * The high-stakes case here is the cross-tenant guard. A TPA admin
 * for tenant A must NOT be able to invite a user into a practice
 * that belongs to tenant B. That bug class is the kind that lets
 * one TPA poach another TPA's provider relationships, and the route
 * blocks it by checking practice.client_id === inviter.tpa.id.
 *
 * If the guard ever regresses, these tests should be the alarm.
 */

vi.mock('@/lib/rate-limit-middleware', () => ({
  applyRateLimit: vi.fn().mockResolvedValue(null),
}));

vi.mock('@/lib/security', () => ({
  getRequestContext: vi.fn().mockReturnValue({ ip: 'test', userAgent: 'test' }),
}));

vi.mock('@/lib/audit', () => ({
  logAuditEvent: vi.fn().mockResolvedValue(undefined),
  logSecurityEvent: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/contracts/client-onboarding', () => ({
  provisionTpaUserAndMagicLink: vi.fn(),
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

function mockTenantALoggedIn(opts: {
  practiceClientId: string | null;
  practiceFound?: boolean;
}) {
  ssrStub.auth.getUser = vi.fn(async () => ({
    data: { user: { id: 'u-a', email: 'admin@tenant-a.example' } },
    error: null,
  }));
  supabaseStub.from = vi.fn(((table: string) => {
    if (table === 'clients') {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: { id: 'tpa-A' },
              error: null,
            }),
          }),
        }),
      };
    }
    if (table === 'practices') {
      return {
        select: () => ({
          eq: () => ({
            single: async () =>
              opts.practiceFound === false
                ? { data: null, error: { message: 'No rows' } }
                : {
                    data: {
                      id: 'practice-1',
                      name: 'Sneaky Practice',
                      client_id: opts.practiceClientId,
                    },
                    error: null,
                  },
          }),
        }),
      };
    }
    if (table === 'practice_users') {
      return {
        insert: async () => ({ error: null }),
      };
    }
    return {};
  }) as AnyFn);
}

function makeRequest(body: unknown) {
  return new Request('https://app.vantaum.com/api/tpa/practices/practice-1/invite', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

describe('POST /api/tpa/practices/[id]/invite', () => {
  beforeEach(() => {
    vi.resetModules();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns a demo success in demo mode', async () => {
    clearSupabaseEnv();
    const mod = await import('@/app/api/tpa/practices/[id]/invite/route');
    const res = await mod.POST(
      makeRequest({ email: 'invitee@example.com', role: 'staff' }) as never,
      { params: Promise.resolve({ id: 'practice-1' }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.demo).toBe(true);
  });

  it('returns 400 for an invalid email', async () => {
    clearSupabaseEnv();
    const mod = await import('@/app/api/tpa/practices/[id]/invite/route');
    const res = await mod.POST(
      makeRequest({ email: 'not-an-email', role: 'staff' }) as never,
      { params: Promise.resolve({ id: 'practice-1' }) },
    );
    expect(res.status).toBe(400);
  });

  it('returns 401 in real mode when no TPA is matched for the user', async () => {
    setRealEnv();
    ssrStub.auth.getUser = vi.fn(async () => ({
      data: { user: { id: 'u-z', email: 'nobody@example.com' } },
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

    const mod = await import('@/app/api/tpa/practices/[id]/invite/route');
    const res = await mod.POST(
      makeRequest({ email: 'invitee@example.com', role: 'staff' }) as never,
      { params: Promise.resolve({ id: 'practice-1' }) },
    );
    expect(res.status).toBe(401);
  });

  it('returns 404 when the practice does not exist', async () => {
    setRealEnv();
    mockTenantALoggedIn({ practiceClientId: 'tpa-A', practiceFound: false });
    const mod = await import('@/app/api/tpa/practices/[id]/invite/route');
    const res = await mod.POST(
      makeRequest({ email: 'invitee@example.com', role: 'staff' }) as never,
      { params: Promise.resolve({ id: 'practice-1' }) },
    );
    expect(res.status).toBe(404);
  });

  it('blocks cross-tenant invite — tenant A admin cannot invite into tenant B practice', async () => {
    setRealEnv();
    // Inviter belongs to tpa-A; practice belongs to tpa-B.
    mockTenantALoggedIn({ practiceClientId: 'tpa-B' });

    const { logAuditEvent } = await import('@/lib/audit');
    const mod = await import('@/app/api/tpa/practices/[id]/invite/route');
    const res = await mod.POST(
      makeRequest({ email: 'poached@example.com', role: 'staff' }) as never,
      { params: Promise.resolve({ id: 'practice-1' }) },
    );

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toMatch(/does not belong to your tenant/i);

    // The cross-tenant attempt is a security event — verify it's logged.
    const auditCalls = (logAuditEvent as unknown as { mock: { calls: unknown[][] } }).mock.calls;
    const securityCall = auditCalls.find(
      (c) => typeof c[1] === 'string' && (c[1] as string).startsWith('security:cross_tenant'),
    );
    expect(securityCall).toBeDefined();
  });
});
