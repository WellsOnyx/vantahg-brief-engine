import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

/**
 * Tests for POST /api/cases/[id]/send-determination-email.
 *
 * Locks down the auth gate (401 in prod demo) and the demo-mode
 * happy path. Real-mode delivery branches are exercised in
 * __tests__/lib/notifications/determination-delivery.test.ts.
 */

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
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', '');
}

describe('POST /api/cases/[id]/send-determination-email', () => {
  beforeEach(() => {
    vi.resetModules();
    clearSupabaseEnv();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns 401 in production demo mode', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const mod = await import('@/app/api/cases/[id]/send-determination-email/route');
    const req = new Request('https://app.vantaum.com/api/cases/abc/send-determination-email', {
      method: 'POST',
      body: JSON.stringify({}),
      headers: { 'content-type': 'application/json' },
    });
    const res = await mod.POST(req as never, { params: Promise.resolve({ id: 'abc' }) });
    expect(res.status).toBe(401);
  });

  it('returns a demo stub success in non-prod demo mode', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    const mod = await import('@/app/api/cases/[id]/send-determination-email/route');
    const req = new Request('http://localhost:3000/api/cases/abc/send-determination-email', {
      method: 'POST',
      body: JSON.stringify({}),
      headers: { 'content-type': 'application/json' },
    });
    const res = await mod.POST(req as never, { params: Promise.resolve({ id: 'abc' }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.messageId).toMatch(/^demo-/);
    expect(res.headers.get('X-Demo-Mode')).toBe('true');
  });

  it('honors a { recipient } body in demo mode', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    const mod = await import('@/app/api/cases/[id]/send-determination-email/route');
    const req = new Request('http://localhost:3000/api/cases/abc/send-determination-email', {
      method: 'POST',
      body: JSON.stringify({ recipient: 'override@tpa.example.com' }),
      headers: { 'content-type': 'application/json' },
    });
    const res = await mod.POST(req as never, { params: Promise.resolve({ id: 'abc' }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.recipient_email).toBe('override@tpa.example.com');
  });
});
