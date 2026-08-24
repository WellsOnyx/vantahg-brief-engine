import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('@/lib/audit', () => ({
  logSecurityEvent: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/security', () => ({
  getRequestContext: vi.fn().mockReturnValue({ ip: 'test', userAgent: 'test' }),
}));

function clearSupabaseEnv() {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
  vi.stubEnv('SUPABASE_URL', '');
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '');
}

describe('authenticatePartner — production demo fail-closed', () => {
  beforeEach(() => {
    vi.resetModules();
    clearSupabaseEnv();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('does not mint a demo partner in production demo mode', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const { authenticatePartner } = await import('@/lib/partner/auth');
    const principal = await authenticatePartner(
      new Request('https://app.vantaum.com/api/partner/v1/cases', {
        headers: { 'x-api-key': 'vum_live_anything' },
      }),
    );
    expect(principal).toBeNull();
  });

  it('still returns the demo partner in local/dev demo mode', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    const { authenticatePartner } = await import('@/lib/partner/auth');
    const principal = await authenticatePartner(
      new Request('http://localhost:3000/api/partner/v1/cases', {
        headers: { 'x-api-key': 'vum_live_anything' },
      }),
    );
    expect(principal?.name).toMatch(/Demo partner/);
  });
});
