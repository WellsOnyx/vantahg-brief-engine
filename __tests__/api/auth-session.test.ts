import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const authAdapter = {
  getSessionUser: vi.fn(),
};

vi.mock('@/lib/adapters/auth', () => ({
  getAuthAdapter: () => authAdapter,
}));

vi.mock('@/lib/supabase', () => ({
  getServiceClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: { role: 'reviewer' }, error: null }),
        }),
      }),
    }),
  }),
}));

describe('GET /api/auth/session', () => {
  beforeEach(() => {
    vi.resetModules();
    authAdapter.getSessionUser.mockReset();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('reports supabase backend and null user when flag is off and no session', async () => {
    vi.stubEnv('ENABLE_AWS_AUTH', '');
    authAdapter.getSessionUser.mockResolvedValue(null);
    const { GET } = await import('@/app/api/auth/session/route');
    const res = await GET(new Request('http://localhost:3000/api/auth/session') as never);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ backend: 'supabase', user: null });
  });

  it('returns the Cognito session user when ENABLE_AWS_AUTH=true', async () => {
    vi.stubEnv('ENABLE_AWS_AUTH', 'true');
    authAdapter.getSessionUser.mockResolvedValue({
      id: '11111111-1111-1111-1111-111111111111',
      email: 'rn@vantaum.test',
      role: 'reviewer',
    });
    const { GET } = await import('@/app/api/auth/session/route');
    const res = await GET(new Request('http://localhost:3000/api/auth/session') as never);
    const body = await res.json();
    expect(body.backend).toBe('cognito');
    expect(body.user).toMatchObject({
      email: 'rn@vantaum.test',
      role: 'reviewer',
    });
  });
});
