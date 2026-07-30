import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

/**
 * Tests for the review-dataset surface:
 *   GET  /api/admin/review-dataset            (internal-admin gate, JSONL/JSON)
 *   GET/POST /api/cron/review-dataset-backfill (CRON_SECRET gate)
 *
 * The auth gates are the point: the dataset is an internal ML asset with no
 * customer-facing access, and the cron must not run unauthenticated in prod.
 */

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

function clearSupabaseEnv() {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
  vi.stubEnv('SUPABASE_URL', '');
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '');
}

function setRealEnv() {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co');
  vi.stubEnv('SUPABASE_URL', 'https://example.supabase.co');
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-key');
}

// ── Admin export ────────────────────────────────────────────────────────────

describe('GET /api/admin/review-dataset', () => {
  beforeEach(() => vi.resetModules());
  afterEach(() => vi.unstubAllEnvs());

  it('returns 401 in production demo mode (no authenticated admin)', async () => {
    clearSupabaseEnv();
    vi.stubEnv('NODE_ENV', 'production');
    const { GET } = await import('@/app/api/admin/review-dataset/route');
    const res = await GET(
      new Request('https://app.vantaum.com/api/admin/review-dataset') as never,
    );
    expect(res.status).toBe(401);
  });

  it('serves an empty JSONL dataset in dev demo mode (mock admin)', async () => {
    clearSupabaseEnv();
    vi.stubEnv('NODE_ENV', 'development');
    const { GET } = await import('@/app/api/admin/review-dataset/route');
    const res = await GET(
      new Request('http://localhost:3000/api/admin/review-dataset') as never,
    );
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('x-ndjson');
    const body = await res.text();
    expect(body).toBe(''); // no samples in demo
  });

  it('supports format=json envelope', async () => {
    clearSupabaseEnv();
    vi.stubEnv('NODE_ENV', 'development');
    const { GET } = await import('@/app/api/admin/review-dataset/route');
    const res = await GET(
      new Request('http://localhost:3000/api/admin/review-dataset?format=json') as never,
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.deident_method).toBe('safe_harbor_v1');
    expect(json.count).toBe(0);
    expect(Array.isArray(json.records)).toBe(true);
  });
});

// ── Cron backfill ─────────────────────────────────────────────────────────

describe('review-dataset-backfill cron', () => {
  beforeEach(() => vi.resetModules());
  afterEach(() => vi.unstubAllEnvs());

  it('returns 401 in production without a valid CRON_SECRET', async () => {
    setRealEnv();
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('CRON_SECRET', 'the-secret');
    const { POST } = await import('@/app/api/cron/review-dataset-backfill/route');
    const res = await POST(
      new Request('https://app.vantaum.com/api/cron/review-dataset-backfill', {
        method: 'POST',
      }) as never,
    );
    expect(res.status).toBe(401);
  });

  it('runs (no-op counts) in demo mode without a secret', async () => {
    clearSupabaseEnv();
    vi.stubEnv('NODE_ENV', 'development');
    const { GET } = await import('@/app/api/cron/review-dataset-backfill/route');
    const res = await GET(
      new Request('http://localhost:3000/api/cron/review-dataset-backfill') as never,
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.scanned).toBe(0);
    expect(json.captured).toBe(0);
  });
});
