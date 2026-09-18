import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('@/lib/supabase-server', () => ({
  createServerClient: async () => ({
    auth: { signOut: vi.fn().mockResolvedValue({ error: null }) },
  }),
}));

describe('POST /api/auth/sign-out', () => {
  beforeEach(() => {
    vi.resetModules();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('clears vantaum_session on the Cognito path', async () => {
    vi.stubEnv('ENABLE_AWS_AUTH', 'true');
    const { POST } = await import('@/app/api/auth/sign-out/route');
    const res = await POST(new Request('http://localhost:3000/api/auth/sign-out', { method: 'POST' }) as never);
    expect(res.status).toBe(200);
    const setCookie = res.headers.get('set-cookie') ?? '';
    expect(setCookie).toMatch(/vantaum_session=/);
    expect(setCookie).toMatch(/Max-Age=0/i);
  });
});
