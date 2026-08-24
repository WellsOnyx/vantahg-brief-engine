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
}

const body = {
  patient_name: 'Test Patient',
  procedure_codes: ['27447'],
};

describe('POST /api/external/submit — empty keys are not a public write', () => {
  beforeEach(() => {
    vi.resetModules();
    clearSupabaseEnv();
    vi.stubEnv('EXTERNAL_API_KEYS', '');
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns 401 in production when EXTERNAL_API_KEYS is empty', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const { POST } = await import('@/app/api/external/submit/route');
    const res = await POST(
      new Request('https://app.vantaum.com/api/external/submit', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': 'anything' },
        body: JSON.stringify(body),
      }) as never,
    );
    expect(res.status).toBe(401);
  });

  it('returns 401 in production when the x-api-key header is missing', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const { POST } = await import('@/app/api/external/submit/route');
    const res = await POST(
      new Request('https://app.vantaum.com/api/external/submit', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      }) as never,
    );
    expect(res.status).toBe(401);
  });

  it('still accepts a local/dev demo submission without keys', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    const { POST } = await import('@/app/api/external/submit/route');
    const res = await POST(
      new Request('http://localhost:3000/api/external/submit', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      }) as never,
    );
    expect(res.status).toBe(201);
  });
});
