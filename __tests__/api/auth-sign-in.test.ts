import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('@/lib/rate-limit-middleware', () => ({
  applyRateLimit: vi.fn().mockResolvedValue(null),
}));

vi.mock('@/lib/audit', () => ({
  logSecurityEvent: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/security', () => ({
  getRequestContext: vi.fn().mockReturnValue({ ip: 'test', userAgent: 'test' }),
  redactEmail: (e: string) => e,
}));

vi.mock('@/lib/log', () => ({
  withRequest: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

const authAdapter = {
  signInWithPassword: vi.fn(),
  getSessionUser: vi.fn(),
  createUserWithMagicLink: vi.fn(),
  getUserByEmail: vi.fn(),
};

vi.mock('@/lib/adapters/auth', () => ({
  getAuthAdapter: () => authAdapter,
}));

vi.mock('@/lib/supabase', () => ({
  getServiceClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: { role: 'client' }, error: null }),
        }),
      }),
    }),
  }),
  hasSupabaseConfig: () => true,
}));

function post(body: unknown) {
  return new Request('http://localhost:3000/api/auth/sign-in', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/auth/sign-in', () => {
  beforeEach(() => {
    vi.resetModules();
    authAdapter.signInWithPassword.mockReset();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns 503 backend=supabase when ENABLE_AWS_AUTH is off — even with pool ids', async () => {
    vi.stubEnv('ENABLE_AWS_AUTH', 'false');
    vi.stubEnv('COGNITO_USER_POOL_ID', 'us-east-1_CjZbn5TD4');
    vi.stubEnv('COGNITO_CLIENT_ID', '4v19mdtmaa8ubns3d6bsi4t2i7');
    const { POST } = await import('@/app/api/auth/sign-in/route');
    const res = await POST(post({ email: 'a@b.test', password: 'x' }) as never);
    expect(res.status).toBe(503);
    const data = await res.json();
    expect(data.backend).toBe('supabase');
    expect(data.error).toBe('use_supabase');
    expect(authAdapter.signInWithPassword).not.toHaveBeenCalled();
  });

  it('uses the Cognito adapter when ENABLE_AWS_AUTH=true and sets vantaum_session', async () => {
    vi.stubEnv('ENABLE_AWS_AUTH', 'true');
    authAdapter.signInWithPassword.mockResolvedValue({
      ok: true,
      cookie: {
        id_token: 'id',
        access_token: 'acc',
        expires_at: Date.now() + 3600_000,
      },
    });
    const { POST } = await import('@/app/api/auth/sign-in/route');
    const res = await POST(
      post({ email: 'client@tpa.test', password: 'correct-horse' }) as never,
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.backend).toBe('cognito');
    expect(data.next).toBe('/client');
    expect(authAdapter.signInWithPassword).toHaveBeenCalledWith({
      email: 'client@tpa.test',
      password: 'correct-horse',
    });
    const setCookie = res.headers.get('set-cookie') ?? '';
    expect(setCookie).toMatch(/vantaum_session=/);
  });

  it('does not fall through to supabase when Cognito is flagged but misconfigured', async () => {
    vi.stubEnv('ENABLE_AWS_AUTH', 'true');
    authAdapter.signInWithPassword.mockResolvedValue({
      ok: false,
      code: 'unavailable',
      message: 'COGNITO_USER_POOL_ID missing',
    });
    const { POST } = await import('@/app/api/auth/sign-in/route');
    const res = await POST(post({ email: 'a@b.test', password: 'x' }) as never);
    expect(res.status).toBe(503);
    const data = await res.json();
    expect(data.backend).toBe('cognito');
    expect(data.error).toBe('auth_unavailable');
  });

  it('returns the same 401 for bad credentials (no user enumeration)', async () => {
    vi.stubEnv('ENABLE_AWS_AUTH', 'true');
    authAdapter.signInWithPassword.mockResolvedValue({
      ok: false,
      code: 'invalid_credentials',
      message: 'NotAuthorizedException',
    });
    const { POST } = await import('@/app/api/auth/sign-in/route');
    const res = await POST(post({ email: 'a@b.test', password: 'wrong' }) as never);
    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toBe('invalid_credentials');
    expect(data.backend).toBe('cognito');
  });
});
