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

describe('webhook fail-closed when secrets are unset', () => {
  beforeEach(() => {
    vi.resetModules();
    clearSupabaseEnv();
    vi.stubEnv('EFAX_WEBHOOK_SECRET', '');
    vi.stubEnv('WEBHOOK_SECRET', '');
    vi.stubEnv('EMAIL_WEBHOOK_SECRET', '');
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('POST /api/intake/efax 401s in production when EFAX_WEBHOOK_SECRET is unset', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const { POST } = await import('@/app/api/intake/efax/route');
    const res = await POST(
      new Request('https://app.vantaum.com/api/intake/efax', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ fax_id: 'x', ocr_text: 'hello' }),
      }) as never,
    );
    expect(res.status).toBe(401);
  });

  it('POST /api/webhooks 401s in production when WEBHOOK_SECRET is unset', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const { POST } = await import('@/app/api/webhooks/route');
    const res = await POST(
      new Request('https://app.vantaum.com/api/webhooks', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ event: 'ping' }),
      }) as never,
    );
    expect(res.status).toBe(401);
  });

  it('POST /api/intake/email 401s in production when EMAIL_WEBHOOK_SECRET is unset', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const { POST } = await import('@/app/api/intake/email/route');
    const form = new FormData();
    form.set('from', 'clinic@example.com');
    form.set('to', 'intake@vantaum.com');
    form.set('subject', 'auth request');
    form.set('text', 'patient test');
    const res = await POST(
      new Request('https://app.vantaum.com/api/intake/email', {
        method: 'POST',
        body: form,
      }) as never,
    );
    expect(res.status).toBe(401);
  });
});
