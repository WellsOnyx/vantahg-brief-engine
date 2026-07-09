import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { signIntakeRequest, computeLegacySignature } from '@/lib/intake/gr-contract';

/**
 * Auth-gate tests for POST /api/gr/webhook under Canonical Intake Contract
 * v1.1: the endpoint and GR_WEBHOOK_SECRET stay stable (the external face
 * GR already has), but verification is upgraded to timestamp-bound
 * signatures with a replay window and dual-secret rotation, with the v1
 * legacy scheme accepted during the transition window.
 *
 * Runs in demo mode so the route acknowledges the contract without
 * persistence — these tests target the signature gate only.
 */

vi.mock('@/lib/demo-mode', () => ({
  isDemoMode: () => true,
}));

vi.mock('@/lib/audit', () => ({
  logAuditEvent: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/rate-limit-middleware', () => ({
  applyRateLimit: vi.fn().mockResolvedValue(null),
}));

vi.mock('@/lib/intake/persistence-guard', () => ({
  intakePersistenceGuard: () => null,
}));

vi.mock('@/lib/supabase', () => ({
  getServiceClient: vi.fn(),
}));

vi.mock('@/lib/intake/finalize-case', () => ({
  finalizeIntakeCase: vi.fn().mockResolvedValue({ finalized: true }),
}));

const BODY = JSON.stringify({
  event: 'chat.handoff',
  chat_id: 990001,
  workspace_id: 'ws_test_1',
  title: 'MRI lumbar prior auth',
});

function post(rawBody: string, headers: Record<string, string> = {}) {
  return new Request('https://app.vantaum.com/api/gr/webhook', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: rawBody,
  }) as never;
}

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv('GR_WEBHOOK_SECRET', 'handoff-secret');
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe('POST /api/gr/webhook — v1.1 signature gate', () => {
  it('accepts a v1.1 timestamp-bound signature', async () => {
    const { POST } = await import('@/app/api/gr/webhook/route');
    const { timestamp, signature } = signIntakeRequest('handoff-secret', BODY);
    const res = await POST(post(BODY, { 'x-gr-timestamp': timestamp, 'x-gr-signature': signature }));
    expect(res.status).toBe(200);
    expect((await res.json()).success).toBe(true);
  });

  it('accepts the v1 LEGACY scheme during the transition window', async () => {
    const { POST } = await import('@/app/api/gr/webhook/route');
    const legacy = computeLegacySignature('handoff-secret', BODY);
    const res = await POST(post(BODY, { 'x-webhook-signature': legacy }));
    expect(res.status).toBe(200);
    expect((await res.json()).success).toBe(true);
  });

  it('accepts a v1.1 signature made with the SECONDARY secret (rotation)', async () => {
    vi.stubEnv('GR_WEBHOOK_SECRET_SECONDARY', 'next-secret');
    const { POST } = await import('@/app/api/gr/webhook/route');
    const { timestamp, signature } = signIntakeRequest('next-secret', BODY);
    const res = await POST(post(BODY, { 'x-gr-timestamp': timestamp, 'x-gr-signature': signature }));
    expect(res.status).toBe(200);
  });

  it('still honors the legacy GRAVITY_RAIL_WEBHOOK_SECRET env name', async () => {
    vi.stubEnv('GR_WEBHOOK_SECRET', '');
    vi.stubEnv('GRAVITY_RAIL_WEBHOOK_SECRET', 'old-env-secret');
    const { POST } = await import('@/app/api/gr/webhook/route');
    const { timestamp, signature } = signIntakeRequest('old-env-secret', BODY);
    const res = await POST(post(BODY, { 'x-gr-timestamp': timestamp, 'x-gr-signature': signature }));
    expect(res.status).toBe(200);
  });

  it('rejects a tampered body signed as v1.1', async () => {
    const { POST } = await import('@/app/api/gr/webhook/route');
    const { timestamp, signature } = signIntakeRequest('handoff-secret', BODY);
    const tampered = BODY.replace('990001', '990002');
    const res = await POST(post(tampered, { 'x-gr-timestamp': timestamp, 'x-gr-signature': signature }));
    expect(res.status).toBe(401);
    expect((await res.json()).code).toBe('signature_invalid');
  });

  it('rejects a stale v1.1 timestamp as a replay even when correctly signed', async () => {
    const { POST } = await import('@/app/api/gr/webhook/route');
    const stale = Math.floor(Date.now() / 1000) - 3600;
    const { timestamp, signature } = signIntakeRequest('handoff-secret', BODY, stale);
    const res = await POST(post(BODY, { 'x-gr-timestamp': timestamp, 'x-gr-signature': signature }));
    expect(res.status).toBe(401);
    expect((await res.json()).code).toBe('replay_rejected');
  });

  it('rejects an unsigned request when a secret is configured', async () => {
    const { POST } = await import('@/app/api/gr/webhook/route');
    const res = await POST(post(BODY));
    expect(res.status).toBe(401);
    expect((await res.json()).code).toBe('signature_missing');
  });
});
