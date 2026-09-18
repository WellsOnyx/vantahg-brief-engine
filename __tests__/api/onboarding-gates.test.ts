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

function req(url: string, opts: { role?: string; method?: string; body?: unknown } = {}) {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (opts.role) headers['x-vantaum-role'] = opts.role;
  return new Request(url, {
    method: opts.method ?? 'GET',
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  }) as never;
}

describe('Phase 7 onboarding / go-live APIs', () => {
  beforeEach(async () => {
    const { resetCaseSpineService } = await import('@/lib/case-spine');
    const { resetClientConfigService } = await import('@/lib/client-config');
    const { resetMemoryGoLiveStore } = await import('@/lib/golive');
    const { resetOnboardingProgressStore } = await import('@/lib/onboarding/progress');
    resetCaseSpineService();
    resetClientConfigService();
    resetMemoryGoLiveStore();
    resetOnboardingProgressStore();
  });

  it('returns A–E checklist and hides it from clients', async () => {
    const { GET } = await import('@/app/api/admin/onboarding/route');
    const ok = await GET(req('http://localhost:3000/api/admin/onboarding', { role: 'admin' }));
    expect(ok.status).toBe(200);
    const body = await ok.json();
    expect(body.hipaa_complete).toBe(false);
    expect(body.progress.items.map((i: { id: string }) => i.id)).toEqual(
      expect.arrayContaining(['A1', 'A2', 'B1', 'C1', 'D5', 'E1', 'E2', 'E4']),
    );
    expect(body.golive.threshold).toBeGreaterThan(0);

    const denied = await GET(req('http://localhost:3000/api/admin/onboarding', { role: 'client' }));
    expect(denied.status).toBe(403);
    expect((await denied.json()).surface).toBe('onboarding_gates');
  });

  it('runs the E1 synthetic pack', async () => {
    const { POST } = await import('@/app/api/golive/synthetic/route');
    const res = await POST(
      req('http://localhost:3000/api/golive/synthetic', {
        role: 'concierge',
        method: 'POST',
        body: { client_id: SYNTHETIC_CLIENT_ID },
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.passed).toBe(true);
    expect(body.count).toBeGreaterThanOrEqual(10);
    expect(body.missing_clinicals).toBeGreaterThanOrEqual(2);
    expect(body.gray_zone).toBeGreaterThanOrEqual(2);
  });

  it('runs the E2 shadow pack and reports zero member/provider final sends', async () => {
    const { POST } = await import('@/app/api/golive/shadow/route');
    const res = await POST(
      req('http://localhost:3000/api/golive/shadow', { role: 'admin', method: 'POST', body: {} }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.passed).toBe(true);
    expect(body.shadow_mode).toBe(true);
    expect(body.signed).toBeGreaterThanOrEqual(10);
    expect(body.member_provider_final_sends).toBe(0);
  });
});
