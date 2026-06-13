import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

/**
 * Tests for the concierge ping center surface:
 *   GET  /api/concierge/pings        — unified intake feed (demo)
 *   POST /api/concierge/touchpoints  — log the relationship call
 */

vi.mock('@/lib/rate-limit-middleware', () => ({
  applyRateLimit: vi.fn().mockResolvedValue(null),
}));

vi.mock('@/lib/audit', () => ({
  logAuditEvent: vi.fn().mockResolvedValue(undefined),
  logSecurityEvent: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/security', () => ({
  getRequestContext: vi.fn().mockReturnValue({ ip: 'test', userAgent: 'test' }),
}));

function clearSupabaseEnv() {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
  vi.stubEnv('SUPABASE_URL', '');
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '');
}

describe('GET /api/concierge/pings', () => {
  beforeEach(() => vi.resetModules());
  afterEach(() => vi.unstubAllEnvs());

  it('returns a demo feed spanning every entry point, most overdue first', async () => {
    clearSupabaseEnv();
    vi.stubEnv('NODE_ENV', 'development');
    const { GET } = await import('@/app/api/concierge/pings/route');
    const res = await GET(new Request('https://app.vantaum.com/api/concierge/pings') as never);
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.pings.length).toBeGreaterThan(0);

    // The intake fan-in story: multiple channels visible in one feed.
    const channels = new Set(body.pings.map((p: { intake_channel: string }) => p.intake_channel));
    expect(channels.size).toBeGreaterThanOrEqual(4);

    // Sorted by urgency: minutes_to_target non-decreasing.
    const minutes = body.pings.map((p: { minutes_to_target: number }) => p.minutes_to_target);
    expect(minutes).toEqual([...minutes].sort((a: number, b: number) => a - b));

    // Each ping carries the call-prep line the concierge opens with.
    for (const p of body.pings) {
      expect(p.prep.level).toBeTruthy();
      expect(typeof p.prep.line).toBe('string');
      expect(p.channel_label).toBeTruthy();
      expect(p.callback_due_at).toBeTruthy();
    }
  });
});

describe('POST /api/concierge/touchpoints', () => {
  beforeEach(() => vi.resetModules());
  afterEach(() => vi.unstubAllEnvs());

  function makePost(body: unknown) {
    return new Request('https://app.vantaum.com/api/concierge/touchpoints', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }) as never;
  }

  it('400s without a case_id', async () => {
    clearSupabaseEnv();
    vi.stubEnv('NODE_ENV', 'development');
    const { POST } = await import('@/app/api/concierge/touchpoints/route');
    const res = await POST(makePost({ outcome: 'reached' }));
    expect(res.status).toBe(400);
  });

  it('400s on an unknown outcome', async () => {
    clearSupabaseEnv();
    vi.stubEnv('NODE_ENV', 'development');
    const { POST } = await import('@/app/api/concierge/touchpoints/route');
    const res = await POST(makePost({ case_id: 'case-1', outcome: 'hung_up_angry' }));
    expect(res.status).toBe(400);
  });

  it('400s on an unknown channel', async () => {
    clearSupabaseEnv();
    vi.stubEnv('NODE_ENV', 'development');
    const { POST } = await import('@/app/api/concierge/touchpoints/route');
    const res = await POST(makePost({ case_id: 'case-1', outcome: 'reached', channel: 'carrier_pigeon' }));
    expect(res.status).toBe(400);
  });

  it('logs a demo touchpoint with X-Demo-Mode and first-contact default', async () => {
    clearSupabaseEnv();
    vi.stubEnv('NODE_ENV', 'development');
    const { POST } = await import('@/app/api/concierge/touchpoints/route');
    const res = await POST(makePost({ case_id: 'case-1', outcome: 'voicemail', notes: 'left vm' }));
    expect(res.status).toBe(201);
    expect(res.headers.get('X-Demo-Mode')).toBe('true');
    const body = await res.json();
    expect(body.logged).toBe(true);
    expect(body.demo).toBe(true);
    expect(body.touchpoint.outcome).toBe('voicemail');
    expect(body.touchpoint.is_first_contact).toBe(true);
  });
});
