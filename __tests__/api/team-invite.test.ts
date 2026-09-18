import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

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

vi.mock('@/lib/auth-guard', () => ({
  requireRole: vi.fn(async () => ({
    user: { id: 'admin-1', email: 'admin@vantaum.test', role: 'admin' },
  })),
}));

vi.mock('@/lib/demo-mode', () => ({
  isDemoMode: () => process.env.FORCE_DEMO === 'true',
}));

const inviteUserByEmail = vi.fn();
const upsert = vi.fn();
const supabaseStub = {
  auth: { admin: { inviteUserByEmail } },
  from: vi.fn(() => ({
    update: () => ({ eq: async () => ({ error: null }) }),
    upsert,
  })),
};

const authAdapter = {
  createUserWithMagicLink: vi.fn(),
  getSessionUser: vi.fn(),
};

vi.mock('@/lib/supabase', () => ({
  getServiceClient: () => supabaseStub,
}));

vi.mock('@/lib/adapters/auth', () => ({
  getAuthAdapter: () => authAdapter,
}));

function post(body: unknown) {
  return new Request('http://localhost:3000/api/team/invite', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const inviteBody = {
  email: 'clinician@vantaum.test',
  name: 'Pat Reviewer',
  role: 'reviewer',
};

describe('POST /api/team/invite', () => {
  beforeEach(() => {
    vi.resetModules();
    inviteUserByEmail.mockReset();
    authAdapter.createUserWithMagicLink.mockReset();
    upsert.mockReset();
    upsert.mockResolvedValue({ error: null });
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('uses Cognito adapter (not supabase.auth.admin) when ENABLE_AWS_AUTH=true', async () => {
    vi.stubEnv('ENABLE_AWS_AUTH', 'true');
    authAdapter.createUserWithMagicLink.mockResolvedValue({
      ok: true,
      userId: '22222222-2222-2222-2222-222222222222',
      magicLink: '(delivered via SES to clinician@vantaum.test)',
      preExisting: false,
    });
    const { POST } = await import('@/app/api/team/invite/route');
    const res = await POST(post(inviteBody) as never);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.backend).toBe('cognito');
    expect(authAdapter.createUserWithMagicLink).toHaveBeenCalled();
    expect(inviteUserByEmail).not.toHaveBeenCalled();
    expect(upsert).toHaveBeenCalled();
  });

  it('keeps inviteUserByEmail on the hybrid path', async () => {
    vi.stubEnv('ENABLE_AWS_AUTH', 'false');
    inviteUserByEmail.mockResolvedValue({
      data: { user: { id: '33333333-3333-3333-3333-333333333333' } },
      error: null,
    });
    const { POST } = await import('@/app/api/team/invite/route');
    const res = await POST(post(inviteBody) as never);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(inviteUserByEmail).toHaveBeenCalled();
    expect(authAdapter.createUserWithMagicLink).not.toHaveBeenCalled();
  });
});
