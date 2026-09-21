import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHmac } from 'crypto';

vi.mock('@/lib/supabase', () => ({
  hasSupabaseConfig: () => false,
  getSupabase: () => ({}),
  getServiceClient: () => ({}),
  supabase: {},
}));

vi.mock('@/lib/supabase-server', () => ({
  createServerClient: async () => ({
    auth: {
      getUser: async () => ({ data: { user: null }, error: null }),
    },
    from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: null, error: null }) }) }) }),
  }),
}));

vi.mock('@/lib/rate-limit-middleware', () => ({
  applyRateLimit: vi.fn().mockResolvedValue(null),
}));

vi.mock('@/lib/auth-guard', () => ({
  requireAuth: vi.fn().mockResolvedValue({
    user: { id: 'u1', email: 'cx@vantaum.example', role: 'admin' },
  }),
}));

const CLEAN = {
  account_id: 'acct_synth_route',
  contact_role: 'implementation_lead',
  scheduling_intent: { hypercare_standup: true },
  external_touchpoint_id: 'mtp_route_1',
};

function hex(body: string, secret: string): string {
  return createHmac('sha256', secret).update(body, 'utf8').digest('hex');
}

function post(raw: string, headers: Record<string, string> = {}) {
  return new Request('http://localhost:3000/api/muse/webhook', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: raw,
  }) as never;
}

describe('Muse API stubs', () => {
  beforeEach(async () => {
    vi.unstubAllEnvs();
    vi.stubEnv('MUSE_API_KEY', '');
    vi.stubEnv('MUSE_WEBHOOK_SECRET', '');
    vi.stubEnv('MUSE_WEBHOOK_SECRET_SECONDARY', '');
    vi.stubEnv('MUSE_CX_ENABLED', 'false');
    const { resetMemoryMuseStore } = await import('@/lib/muse');
    resetMemoryMuseStore();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('fails closed in production when no webhook secret is configured', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const { POST } = await import('@/app/api/muse/webhook/route');
    const res = await POST(post(JSON.stringify(CLEAN)));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'webhook_secret_not_configured' });
  });

  it('rejects a bad HMAC and stores nothing', async () => {
    vi.stubEnv('MUSE_WEBHOOK_SECRET', 'muse-test-secret');
    const { POST } = await import('@/app/api/muse/webhook/route');
    const raw = JSON.stringify(CLEAN);
    const res = await POST(post(raw, { 'x-muse-signature': 'deadbeef' }));
    expect(res.status).toBe(401);
    const { getMemoryMuseStore } = await import('@/lib/muse');
    expect(getMemoryMuseStore().list()).toHaveLength(0);
  });

  it('refuses PHI fields and does not store them', async () => {
    const { POST } = await import('@/app/api/muse/webhook/route');
    const raw = JSON.stringify({ ...CLEAN, patient_name: 'should-not-store', diagnosis: 'x' });
    const res = await POST(post(raw));
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toBe('phi_not_allowed');
    expect(body.code).toBe('phi_field');
    expect(body.field).toBe('patient_name');
    expect(JSON.stringify(body)).not.toContain('should-not-store');
    const { getMemoryMuseStore } = await import('@/lib/muse');
    expect(getMemoryMuseStore().list()).toHaveLength(0);
  });

  it('stores a clean payload once and replays the same touchpoint', async () => {
    vi.stubEnv('MUSE_WEBHOOK_SECRET', 'muse-test-secret');
    const { POST } = await import('@/app/api/muse/webhook/route');
    const raw = JSON.stringify(CLEAN);
    const headers = { 'x-muse-signature': hex(raw, 'muse-test-secret') };
    const created = await POST(post(raw, headers));
    expect(created.status).toBe(201);
    const createdBody = await created.json();
    expect(createdBody.live_call).toBe(false);
    expect(createdBody.idempotent).toBe(false);

    const replay = await POST(post(raw, headers));
    expect(replay.status).toBe(200);
    const replayBody = await replay.json();
    expect(replayBody.idempotent).toBe(true);
    expect(replayBody.touchpoint_id).toBe(createdBody.touchpoint_id);
  });

  it('returns 503 not_configured without an API key and never calls fetch', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const { GET } = await import('@/app/api/muse/status/route');
    const res = await GET(new Request('http://localhost:3000/api/muse/status') as never);
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: 'not_configured', live_call: false });
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('a set API key stays stub_only and still does not call fetch', async () => {
    vi.stubEnv('MUSE_API_KEY', 'slot-not-live');
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const { GET } = await import('@/app/api/muse/status/route');
    const res = await GET(new Request('http://localhost:3000/api/muse/status') as never);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ configured: true, live_call: false, code: 'stub_only' });
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('hides touchpoints until the CX flag and API key are both set', async () => {
    const { POST } = await import('@/app/api/muse/webhook/route');
    await POST(post(JSON.stringify(CLEAN)));
    const { GET } = await import('@/app/api/muse/touchpoints/route');
    const hidden = await GET(new Request('http://localhost:3000/api/muse/touchpoints') as never);
    expect(hidden.status).toBe(200);
    const hiddenBody = await hidden.json();
    expect(hiddenBody.entitled).toBe(false);
    expect(hiddenBody.touchpoints).toEqual([]);

    vi.stubEnv('MUSE_API_KEY', 'slot-not-live');
    vi.stubEnv('MUSE_CX_ENABLED', 'true');
    const shown = await GET(new Request('http://localhost:3000/api/muse/touchpoints') as never);
    const shownBody = await shown.json();
    expect(shownBody.entitled).toBe(true);
    expect(shownBody.live_call).toBe(false);
    expect(shownBody.touchpoints).toHaveLength(1);
    expect(shownBody.touchpoints[0].account_id).toBe('acct_synth_route');
    expect(JSON.stringify(shownBody)).not.toMatch(/patient|diagnosis|member_id/i);
  });

  it('forbids the client lens from the Muse panel', async () => {
    const { GET } = await import('@/app/api/muse/touchpoints/route');
    const res = await GET(
      new Request('http://localhost:3000/api/muse/touchpoints', {
        headers: { 'x-vantaum-role': 'client' },
      }) as never,
    );
    expect(res.status).toBe(403);
  });
});
