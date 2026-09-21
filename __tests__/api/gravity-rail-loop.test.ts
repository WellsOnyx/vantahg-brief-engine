import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHmac } from 'crypto';
import { SYNTHETIC_CLIENT_ID } from '@/lib/intake/constants';

/**
 * Gravity Rail loop on the case-spine intake path.
 * Synthetic tokens only. No live API key.
 */

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
  requireAuth: vi.fn().mockResolvedValue({ user: { id: 'u1', role: 'admin' } }),
}));

const COMPLETE = {
  synthetic: true,
  client_id: SYNTHETIC_CLIENT_ID,
  external_id: 'ext-synth-gr-loop-1',
  member_ref: 'memb_synth_gr_001',
  requesting_provider: 'prov_synth_001',
  service_or_rx: 'CPT-73721',
  place_of_service: 'office',
  urgency: 'standard',
  clinicals_pointer: 's3://synth/packet/gr-001.pdf',
  benefit_type: 'medical',
};

function hexHmac(body: string, secret: string): string {
  return createHmac('sha256', secret).update(body, 'utf8').digest('hex');
}

function post(raw: string, headers: Record<string, string> = {}) {
  return new Request('http://localhost:3000/api/intake/gravity-rail', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: raw,
  }) as never;
}

async function listedCaseIds(): Promise<string[]> {
  const { GET } = await import('@/app/api/case-spine/route');
  const list = await GET(new Request('http://localhost:3000/api/case-spine') as never);
  const body = await list.json();
  return (body.cases as Array<{ case_id: string }>).map((c) => c.case_id);
}

describe('Gravity Rail loop on case spine', () => {
  beforeEach(async () => {
    vi.unstubAllEnvs();
    vi.stubEnv('GRAVITY_RAIL_WEBHOOK_SECRET', '');
    vi.stubEnv('GR_WEBHOOK_SECRET', '');
    vi.stubEnv('GR_WEBHOOK_SECRET_SECONDARY', '');
    vi.stubEnv('GRAVITY_RAIL_API_KEY', '');
    const { resetCaseSpineService } = await import('@/lib/case-spine');
    const { resetClientConfigService } = await import('@/lib/client-config');
    const { resetGravityRailClientForTests } = await import('@/lib/gravity-rails');
    resetCaseSpineService();
    resetClientConfigService();
    resetGravityRailClientForTests();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('fails closed in production when no webhook secret is configured', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const { POST } = await import('@/app/api/intake/gravity-rail/route');
    const raw = JSON.stringify({ ...COMPLETE, external_id: 'gr-prod-nosecret' });
    const res = await POST(post(raw));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'webhook_secret_not_configured' });
    expect(await listedCaseIds()).toHaveLength(0);
  });

  it('rejects a bad HMAC when a secret is set and creates no case', async () => {
    vi.stubEnv('GRAVITY_RAIL_WEBHOOK_SECRET', 'gr-test-secret');
    const { POST } = await import('@/app/api/intake/gravity-rail/route');
    const raw = JSON.stringify({ ...COMPLETE, external_id: 'gr-bad-hmac' });
    const res = await POST(post(raw, { 'x-gravity-rail-signature': 'deadbeef' }));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe('Invalid webhook signature');
    expect(await listedCaseIds()).toHaveLength(0);
  });

  it('accepts GR_WEBHOOK_SECRET as an alias and the secondary rotation secret', async () => {
    vi.stubEnv('GR_WEBHOOK_SECRET', 'alias-secret');
    vi.stubEnv('GR_WEBHOOK_SECRET_SECONDARY', 'next-secret');
    const { POST } = await import('@/app/api/intake/gravity-rail/route');
    const raw = JSON.stringify({ ...COMPLETE, external_id: 'gr-alias-secret' });
    const res = await POST(
      post(raw, { 'x-gravity-rail-signature': hexHmac(raw, 'next-secret') }),
    );
    expect(res.status).toBe(201);
    expect((await res.json()).idempotent).toBe(false);
  });

  it('returns the same spine case on Idempotency-Key replay', async () => {
    const { POST } = await import('@/app/api/intake/gravity-rail/route');
    const raw = JSON.stringify({
      ...COMPLETE,
      external_id: 'payload-ext-should-lose',
      chat_id: 'chat-should-lose',
    });
    const headers = { 'Idempotency-Key': 'idem-synth-gr-1' };
    const first = await POST(post(raw, headers));
    expect(first.status).toBe(201);
    const created = await first.json();
    expect(created.idempotent).toBe(false);
    expect(created.case_id).toBeTruthy();

    const second = await POST(post(raw, headers));
    expect(second.status).toBe(200);
    const replay = await second.json();
    expect(replay).toMatchObject({
      success: true,
      idempotent: true,
      case_id: created.case_id,
      source: 'gravity_rail',
    });
    expect(JSON.stringify(replay)).not.toContain('memb_synth_gr_001');
    expect(await listedCaseIds()).toEqual([created.case_id]);
  });

  it('replays on chat_id when no Idempotency-Key is sent', async () => {
    const { POST } = await import('@/app/api/intake/gravity-rail/route');
    const raw = JSON.stringify({ ...COMPLETE, external_id: 'ext-ignored', chat_id: 424242 });
    const first = await POST(post(raw));
    expect(first.status).toBe(201);
    const created = await first.json();
    const second = await POST(post(raw));
    expect(second.status).toBe(200);
    expect((await second.json()).case_id).toBe(created.case_id);
    expect(await listedCaseIds()).toHaveLength(1);
  });

  it('dev/test with no secret still creates a synthetic case', async () => {
    vi.stubEnv('NODE_ENV', 'test');
    const { POST } = await import('@/app/api/intake/gravity-rail/route');
    const raw = JSON.stringify({ ...COMPLETE, external_id: 'gr-dev-allow' });
    const res = await POST(post(raw));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.state).toBe('received');
    expect(await listedCaseIds()).toContain(body.case_id);
  });
});

describe('GET /api/gr/workspaces — missing API key', () => {
  beforeEach(async () => {
    vi.unstubAllEnvs();
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('GRAVITY_RAIL_API_KEY', '');
    const { resetGravityRailClientForTests } = await import('@/lib/gravity-rails');
    resetGravityRailClientForTests();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns 503 not_configured and does not invent a workspace', async () => {
    const { GET } = await import('@/app/api/gr/workspaces/route');
    const res = await GET(new Request('https://app.vantaum.com/api/gr/workspaces') as never);
    expect(res.status).toBe(503);
    const json = await res.json();
    expect(json.code).toBe('not_configured');
    expect(JSON.stringify(json)).not.toMatch(/ws-\d+/);
  });
});
