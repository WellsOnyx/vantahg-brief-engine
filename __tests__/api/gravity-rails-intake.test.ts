import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

/**
 * Gravity Rails inbound webhook — Block 1 "One Door". Closes the gap where
 * GR was outbound-only. Demo-mode skips HMAC so the channel is testable
 * without secrets; prod requires x-gr-signature.
 */

vi.mock('@/lib/rate-limit-middleware', () => ({ applyRateLimit: vi.fn().mockResolvedValue(null) }));
vi.mock('@/lib/audit', () => ({
  logAuditEvent: vi.fn().mockResolvedValue(undefined),
  logSecurityEvent: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/lib/security', () => ({ getRequestContext: vi.fn().mockReturnValue({ ip: 't', userAgent: 't' }) }));
vi.mock('@/lib/intake/confirmation', () => ({
  generateAuthorizationNumber: vi.fn().mockResolvedValue('AUTH-TEST-1'),
  logIntakeEvent: vi.fn().mockResolvedValue(undefined),
  hashPatientName: vi.fn().mockReturnValue('hash'),
  sendReceiptConfirmation: vi.fn().mockResolvedValue({ confirmation_sent: true }),
}));

function clearSupabaseEnv() {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
  vi.stubEnv('SUPABASE_URL', '');
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '');
}

// Real-mode = Supabase configured → isDemoMode() is false → HMAC enforced.
// (We don't reach the DB in these tests; they assert the auth gate before it.)
function setSupabaseEnv() {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://stub.supabase.co');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'stub-anon');
  vi.stubEnv('SUPABASE_URL', 'https://stub.supabase.co');
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'stub-service');
}

function post(body: unknown, headers: Record<string, string> = {}) {
  return new Request('https://app.vantaum.com/api/intake/gravity-rails', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  }) as never;
}

const VALID = { patient_name: 'Angela Thompson', procedure_codes: ['J1745'], gr_chat_id: 'c-123' };

describe('POST /api/intake/gravity-rails', () => {
  beforeEach(() => vi.resetModules());
  afterEach(() => vi.unstubAllEnvs());

  it('demo mode accepts a valid intake and returns a case (no HMAC required)', async () => {
    clearSupabaseEnv();
    vi.stubEnv('NODE_ENV', 'development');
    const { POST } = await import('@/app/api/intake/gravity-rails/route');
    const res = await POST(post(VALID));
    expect(res.status).toBe(201);
    expect(res.headers.get('X-Demo-Mode')).toBe('true');
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.demo).toBe(true);
    expect(body.authorization_number).toBe('AUTH-TEST-1');
    expect(body.case_number).toMatch(/^VUM-\d{4}-/);
  });

  it('400s on a payload missing required fields', async () => {
    clearSupabaseEnv();
    vi.stubEnv('NODE_ENV', 'development');
    const { POST } = await import('@/app/api/intake/gravity-rails/route');
    const res = await POST(post({ gr_chat_id: 'c-1' }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.details).toContain('patient_name is required');
  });

  it('400s on invalid JSON', async () => {
    clearSupabaseEnv();
    vi.stubEnv('NODE_ENV', 'development');
    const { POST } = await import('@/app/api/intake/gravity-rails/route');
    const res = await POST(
      new Request('https://app.vantaum.com/api/intake/gravity-rails', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{not json',
      }) as never,
    );
    expect(res.status).toBe(400);
  });

  it('prod without a configured secret returns 503 (not configured)', async () => {
    setSupabaseEnv();
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('GRAVITY_RAIL_WEBHOOK_SECRET', '');
    const { POST } = await import('@/app/api/intake/gravity-rails/route');
    const res = await POST(post(VALID));
    expect(res.status).toBe(503);
  });

  it('prod with a secret but no signature returns 401', async () => {
    setSupabaseEnv();
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('GRAVITY_RAIL_WEBHOOK_SECRET', 'shh');
    const { POST } = await import('@/app/api/intake/gravity-rails/route');
    const res = await POST(post(VALID));
    expect(res.status).toBe(401);
  });

  it('prod with a bad signature returns 401', async () => {
    setSupabaseEnv();
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('GRAVITY_RAIL_WEBHOOK_SECRET', 'shh');
    const { POST } = await import('@/app/api/intake/gravity-rails/route');
    const res = await POST(post(VALID, { 'x-gr-signature': 'deadbeef' }));
    expect(res.status).toBe(401);
  });
});
