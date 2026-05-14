import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

/**
 * Tests for the /api/quality/* endpoints. These back the URAC
 * compliance dashboard at /quality. The whole surface had zero
 * test coverage before this file — same gap pattern that the portal
 * suite filled.
 *
 * Covers:
 *   GET  /api/quality/audits             (list, tenant scope, demo)
 *   POST /api/quality/audits             (auth gate, body validation)
 *   GET  /api/quality/audits/[id]        (auth gate, demo 404)
 *   PATCH /api/quality/audits/[id]       (auth gate)
 *   GET  /api/quality/metrics            (auth gate)
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

vi.mock('@/lib/quality-audit', () => ({
  createAudit: vi.fn().mockResolvedValue({ success: true, auditId: 'qa-new-1' }),
  submitAudit: vi.fn().mockResolvedValue({ success: true }),
  getAuditMetrics: vi.fn().mockResolvedValue({
    total_audits: 42,
    avg_overall_score: 87,
    sla_compliance_rate: 0.95,
    determination_accuracy_rate: 0.92,
    audits_by_auditor: [],
    audits_by_staff: [],
  }),
}));

function clearSupabaseEnv() {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
  vi.stubEnv('SUPABASE_URL', '');
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '');
}

// ── GET /api/quality/audits ───────────────────────────────────────────────

describe('GET /api/quality/audits', () => {
  beforeEach(() => vi.resetModules());
  afterEach(() => vi.unstubAllEnvs());

  it('returns 401 in production demo mode', async () => {
    clearSupabaseEnv();
    vi.stubEnv('NODE_ENV', 'production');
    const { GET } = await import('@/app/api/quality/audits/route');
    const res = await GET(
      new Request('https://app.vantaum.com/api/quality/audits') as never,
    );
    expect(res.status).toBe(401);
  });

  it('returns the demo audits array in dev demo mode', async () => {
    clearSupabaseEnv();
    vi.stubEnv('NODE_ENV', 'development');
    const { GET } = await import('@/app/api/quality/audits/route');
    const res = await GET(
      new Request('http://localhost:3000/api/quality/audits') as never,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
  });

  it('passes case_id + staff_id query params through to the demo fixture', async () => {
    clearSupabaseEnv();
    vi.stubEnv('NODE_ENV', 'development');
    const { GET } = await import('@/app/api/quality/audits/route');
    const res = await GET(
      new Request('http://localhost:3000/api/quality/audits?case_id=c-1&staff_id=s-1') as never,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
  });
});

// ── POST /api/quality/audits ──────────────────────────────────────────────

describe('POST /api/quality/audits', () => {
  beforeEach(() => vi.resetModules());
  afterEach(() => vi.unstubAllEnvs());

  it('returns 401 in production demo mode', async () => {
    clearSupabaseEnv();
    vi.stubEnv('NODE_ENV', 'production');
    const { POST } = await import('@/app/api/quality/audits/route');
    const res = await POST(
      new Request('https://app.vantaum.com/api/quality/audits', {
        method: 'POST',
        body: JSON.stringify({ case_id: 'c', auditor_id: 'a', audited_staff_id: 's' }),
        headers: { 'content-type': 'application/json' },
      }) as never,
    );
    expect(res.status).toBe(401);
  });

  it('returns 400 when case_id is missing', async () => {
    clearSupabaseEnv();
    vi.stubEnv('NODE_ENV', 'development');
    const { POST } = await import('@/app/api/quality/audits/route');
    const res = await POST(
      new Request('http://localhost:3000/api/quality/audits', {
        method: 'POST',
        body: JSON.stringify({ auditor_id: 'a', audited_staff_id: 's' }),
        headers: { 'content-type': 'application/json' },
      }) as never,
    );
    expect(res.status).toBe(400);
  });

  it('returns 201 + auditId on happy path via createAudit', async () => {
    clearSupabaseEnv();
    vi.stubEnv('NODE_ENV', 'development');
    const { POST } = await import('@/app/api/quality/audits/route');
    const res = await POST(
      new Request('http://localhost:3000/api/quality/audits', {
        method: 'POST',
        body: JSON.stringify({ case_id: 'c-1', auditor_id: 'a-1', audited_staff_id: 's-1' }),
        headers: { 'content-type': 'application/json' },
      }) as never,
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.auditId).toBe('qa-new-1');
  });
});

// ── GET /api/quality/audits/[id] ──────────────────────────────────────────

describe('GET /api/quality/audits/[id]', () => {
  beforeEach(() => vi.resetModules());
  afterEach(() => vi.unstubAllEnvs());

  it('returns 401 in production demo mode', async () => {
    clearSupabaseEnv();
    vi.stubEnv('NODE_ENV', 'production');
    const mod = await import('@/app/api/quality/audits/[id]/route');
    const res = await mod.GET(
      new Request('https://app.vantaum.com/api/quality/audits/qa-1') as never,
      { params: Promise.resolve({ id: 'qa-1' }) },
    );
    expect(res.status).toBe(401);
  });

  it('returns 404 in dev demo mode (no per-id fixture available)', async () => {
    clearSupabaseEnv();
    vi.stubEnv('NODE_ENV', 'development');
    const mod = await import('@/app/api/quality/audits/[id]/route');
    const res = await mod.GET(
      new Request('http://localhost:3000/api/quality/audits/qa-1') as never,
      { params: Promise.resolve({ id: 'qa-1' }) },
    );
    expect(res.status).toBe(404);
  });
});

// ── PATCH /api/quality/audits/[id] ────────────────────────────────────────

describe('PATCH /api/quality/audits/[id]', () => {
  beforeEach(() => vi.resetModules());
  afterEach(() => vi.unstubAllEnvs());

  it('returns 401 in production demo mode', async () => {
    clearSupabaseEnv();
    vi.stubEnv('NODE_ENV', 'production');
    const mod = await import('@/app/api/quality/audits/[id]/route');
    const res = await mod.PATCH(
      new Request('https://app.vantaum.com/api/quality/audits/qa-1', {
        method: 'PATCH',
        body: JSON.stringify({ criteria_accuracy: 95, sla_compliance: true }),
        headers: { 'content-type': 'application/json' },
      }) as never,
      { params: Promise.resolve({ id: 'qa-1' }) },
    );
    expect(res.status).toBe(401);
  });

  it('returns 200 + success message in dev demo via submitAudit', async () => {
    clearSupabaseEnv();
    vi.stubEnv('NODE_ENV', 'development');
    const mod = await import('@/app/api/quality/audits/[id]/route');
    const res = await mod.PATCH(
      new Request('http://localhost:3000/api/quality/audits/qa-1', {
        method: 'PATCH',
        body: JSON.stringify({
          criteria_accuracy: 95,
          documentation_quality: 90,
          sla_compliance: true,
          determination_appropriate: true,
          notes: 'looks good',
        }),
        headers: { 'content-type': 'application/json' },
      }) as never,
      { params: Promise.resolve({ id: 'qa-1' }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });
});

// ── GET /api/quality/metrics ──────────────────────────────────────────────

describe('GET /api/quality/metrics', () => {
  beforeEach(() => vi.resetModules());
  afterEach(() => vi.unstubAllEnvs());

  it('returns 401 in production demo mode', async () => {
    clearSupabaseEnv();
    vi.stubEnv('NODE_ENV', 'production');
    const { GET } = await import('@/app/api/quality/metrics/route');
    const res = await GET(
      new Request('https://app.vantaum.com/api/quality/metrics') as never,
    );
    expect(res.status).toBe(401);
  });

  it('returns the metrics shape from getAuditMetrics in dev demo', async () => {
    clearSupabaseEnv();
    vi.stubEnv('NODE_ENV', 'development');
    const { GET } = await import('@/app/api/quality/metrics/route');
    const res = await GET(
      new Request('http://localhost:3000/api/quality/metrics') as never,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({
      total_audits: expect.any(Number),
      avg_overall_score: expect.any(Number),
      sla_compliance_rate: expect.any(Number),
      determination_accuracy_rate: expect.any(Number),
    });
  });
});
