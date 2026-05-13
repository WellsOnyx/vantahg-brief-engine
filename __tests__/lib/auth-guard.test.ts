import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

/**
 * Tests for lib/auth-guard.ts.
 *
 * Focus: the demo-mode bypass must NEVER hand out an admin session in
 * production. This was a live security bug — when the AWS secrets vault
 * was deployed with empty Supabase keys, isDemoMode() returned true and
 * requireAuth() unconditionally returned a mock admin user. Anyone hitting
 * /admin/* got admin.
 *
 * The fix: demo-mode auto-admin is gated on NODE_ENV !== 'production'.
 * In prod, demo-mode = 401. In dev/test, demo-mode = mock admin (so local
 * dev and the demo flows at conferences still work).
 */

vi.mock('@/lib/audit', () => ({
  logSecurityEvent: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/security', () => ({
  getRequestContext: vi.fn().mockReturnValue({ ip: 'test', userAgent: 'test' }),
}));

vi.mock('@/lib/supabase-server', () => ({
  createServerClient: vi.fn(),
}));

// Force demo mode by clearing Supabase env. hasSupabaseConfig() reads
// process.env directly, so unsetting these makes isDemoMode() === true.
function clearSupabaseEnv() {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
  vi.stubEnv('SUPABASE_URL', '');
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '');
}

describe('requireAuth — demo-mode bypass safety', () => {
  beforeEach(() => {
    vi.resetModules();
    clearSupabaseEnv();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns a mock admin in non-production when in demo mode (local dev / test)', async () => {
    vi.stubEnv('NODE_ENV', 'development');

    const { requireAuth } = await import('@/lib/auth-guard');
    const request = new Request('https://example.com/api/admin/signups');
    const result = await requireAuth(request);

    expect(result).toHaveProperty('user');
    if ('user' in result) {
      expect(result.user.role).toBe('admin');
      expect(result.user.email).toBe('demo@vantaum.com');
    }
  });

  it('returns 401 in production when in demo mode — DOES NOT mint admin', async () => {
    vi.stubEnv('NODE_ENV', 'production');

    const { requireAuth } = await import('@/lib/auth-guard');
    const request = new Request('https://app.vantaum.com/api/admin/signups');
    const result = await requireAuth(request);

    expect(result).not.toHaveProperty('user');
    if ('status' in result) {
      expect(result.status).toBe(401);
    }
  });

  it('returns 401 in production via requireRole in demo mode — even for admin role', async () => {
    vi.stubEnv('NODE_ENV', 'production');

    const { requireRole } = await import('@/lib/auth-guard');
    const request = new Request('https://app.vantaum.com/api/admin/signups');
    const result = await requireRole(request, ['admin']);

    expect(result).not.toHaveProperty('user');
    if ('status' in result) {
      expect(result.status).toBe(401);
    }
  });
});
