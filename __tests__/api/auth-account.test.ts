import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('@/lib/rate-limit-middleware', () => ({
  applyRateLimit: vi.fn().mockResolvedValue(null),
}));

vi.mock('@/lib/audit', () => ({
  logSecurityEvent: vi.fn().mockResolvedValue(undefined),
  logAuditEvent: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/security', () => ({
  getRequestContext: vi.fn().mockReturnValue({ ip: 'test', userAgent: 'test' }),
  redactEmail: (e: string) => e,
}));

vi.mock('@/lib/log', () => ({
  withRequest: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

const authAdapter = {
  signUp: vi.fn(),
  confirmSignUp: vi.fn(),
  forgotPassword: vi.fn(),
  confirmForgotPassword: vi.fn(),
  continueSignInChallenge: vi.fn(),
  signInWithPassword: vi.fn(),
  refreshSession: vi.fn(),
  getSessionUser: vi.fn(),
  createUserWithMagicLink: vi.fn(),
  getUserByEmail: vi.fn(),
  resendConfirmation: vi.fn(),
  revokeSession: vi.fn(),
};

vi.mock('@/lib/adapters/auth', () => ({
  getAuthAdapter: () => authAdapter,
}));

function post(url: string, body: unknown) {
  return new Request(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('cognito account routes', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv('ENABLE_AWS_AUTH', 'true');
    for (const fn of Object.values(authAdapter)) fn.mockReset();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('rejects a weak password before calling Cognito', async () => {
    const { POST } = await import('@/app/api/auth/sign-up/route');
    const res = await POST(post('http://localhost/api/auth/sign-up', {
      email: 'client@tpa.test',
      password: 'short',
    }) as never);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('weak_password');
    expect(authAdapter.signUp).not.toHaveBeenCalled();
  });

  it('returns confirm_email without saying whether the address exists', async () => {
    authAdapter.signUp.mockResolvedValue({ ok: true, next: 'confirm_email' });
    const { POST } = await import('@/app/api/auth/sign-up/route');
    const res = await POST(post('http://localhost/api/auth/sign-up', {
      email: 'client@tpa.test',
      password: 'Good-Password-1',
      full_name: 'Pat Client',
    }) as never);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.next).toBe('confirm_email');
    expect(JSON.stringify(data)).not.toMatch(/already/i);
  });

  it('confirms the code and tells the user the org is still unbound', async () => {
    authAdapter.confirmSignUp.mockResolvedValue({ ok: true, next: 'confirmed' });
    const { POST } = await import('@/app/api/auth/confirm/route');
    const res = await POST(post('http://localhost/api/auth/confirm', {
      email: 'client@tpa.test',
      code: '123456',
    }) as never);
    expect(res.status).toBe(200);
    expect((await res.json()).message).toMatch(/organization/i);
  });

  it('forgot-password is the same response for any address', async () => {
    authAdapter.forgotPassword.mockResolvedValue({ ok: true, next: 'reset_sent' });
    const { POST } = await import('@/app/api/auth/forgot-password/route');
    const res = await POST(post('http://localhost/api/auth/forgot-password', {
      email: 'nobody@tpa.test',
    }) as never);
    expect(res.status).toBe(200);
    expect((await res.json()).message).toMatch(/If an account exists/i);
  });

  it('MFA challenge sets a session cookie only after the code succeeds', async () => {
    authAdapter.continueSignInChallenge.mockResolvedValue({
      ok: true,
      role: 'reviewer',
      cookie: {
        id_token: 'id',
        access_token: 'acc',
        refresh_token: 'ref',
        expires_at: Date.now() + 3600_000,
      },
    });
    const { POST } = await import('@/app/api/auth/challenge/route');
    const res = await POST(post('http://localhost/api/auth/challenge', {
      email: 'md@vantaum.test',
      session: 'sess',
      challenge: 'SOFTWARE_TOKEN_MFA',
      code: '123456',
    }) as never);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.next).toBe('/med-review');
    expect(res.headers.get('set-cookie') ?? '').toMatch(/vantaum_session=/);
  });

  it('sign-in surfaces an MFA challenge instead of a bad password', async () => {
    authAdapter.signInWithPassword.mockResolvedValue({
      ok: false,
      code: 'challenge',
      challenge: 'SMS_MFA',
      session: 'sess',
      username: 'md@vantaum.test',
      message: 'Enter the code we texted to your phone.',
    });
    const { POST } = await import('@/app/api/auth/sign-in/route');
    const res = await POST(post('http://localhost/api/auth/sign-in', {
      email: 'md@vantaum.test',
      password: 'Good-Password-1',
    }) as never);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.error).toBe('challenge');
    expect(data.challenge).toBe('SMS_MFA');
    expect(res.headers.get('set-cookie')).toBeNull();
  });
});
