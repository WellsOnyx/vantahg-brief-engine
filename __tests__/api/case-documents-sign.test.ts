import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

/**
 * Tests for GET /api/cases/[id]/documents/sign.
 *
 * The interesting cases here are the path-validation branches —
 * they're the line between "TPA reviews their own upload" and
 * "TPA peeks at a sibling case's upload" so they're the highest-
 * stakes assertions in the suite.
 *
 * Coverage:
 *   - Auth gate (401 prod demo)
 *   - Demo mode no-op shape
 *   - 400 when path query param is missing
 *   - 404 when path is outside the case's own namespace (prefix mismatch)
 *   - 404 when path contains '..' (traversal attempt)
 *   - 404 when path is well-shaped but not in submitted_documents[]
 *   - Happy path: storage adapter mints the signed URL, audit logged
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

vi.mock('@/lib/case-access', () => ({
  assertCaseAccess: vi.fn().mockResolvedValue(null),
}));

type AnyFn = (...args: unknown[]) => unknown;
const supabaseStub = { from: vi.fn() as AnyFn };
const storageStub = { signedUrl: vi.fn() as AnyFn };

vi.mock('@/lib/supabase', () => ({
  getServiceClient: () => supabaseStub,
  hasSupabaseConfig: () => true,
}));

vi.mock('@/lib/adapters/storage', () => ({
  getStorageAdapter: () => storageStub,
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

function mockCase(submittedDocs: string[]) {
  supabaseStub.from = vi.fn(((table: string) => {
    if (table === 'cases') {
      return {
        select: () => ({
          eq: () => ({
            single: async () => ({
              data: {
                id: 'case-1',
                client_id: 'c-1',
                case_number: 'UM-1',
                submitted_documents: submittedDocs,
              },
              error: null,
            }),
          }),
        }),
      };
    }
    return {};
  }) as AnyFn);
}

function makeReq(path?: string) {
  const url = path
    ? `https://app.vantaum.com/api/cases/case-1/documents/sign?path=${encodeURIComponent(path)}`
    : 'https://app.vantaum.com/api/cases/case-1/documents/sign';
  return new Request(url);
}

describe('GET /api/cases/[id]/documents/sign', () => {
  beforeEach(() => {
    vi.resetModules();
    storageStub.signedUrl = vi.fn();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns 401 in production demo mode', async () => {
    clearSupabaseEnv();
    vi.stubEnv('NODE_ENV', 'production');
    const mod = await import('@/app/api/cases/[id]/documents/sign/route');
    const res = await mod.GET(
      makeReq('cases/case-1/x.pdf') as never,
      { params: Promise.resolve({ id: 'case-1' }) },
    );
    expect(res.status).toBe(401);
  });

  it('returns { available: false, demo: true } in dev demo mode', async () => {
    clearSupabaseEnv();
    vi.stubEnv('NODE_ENV', 'development');
    const mod = await import('@/app/api/cases/[id]/documents/sign/route');
    const res = await mod.GET(
      makeReq('cases/case-1/x.pdf') as never,
      { params: Promise.resolve({ id: 'case-1' }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.available).toBe(false);
    expect(body.demo).toBe(true);
    expect(res.headers.get('X-Demo-Mode')).toBe('true');
  });

  it('returns 400 when path query is missing', async () => {
    setRealEnv();
    const mod = await import('@/app/api/cases/[id]/documents/sign/route');
    const res = await mod.GET(
      makeReq() as never,
      { params: Promise.resolve({ id: 'case-1' }) },
    );
    expect(res.status).toBe(400);
  });

  it('returns 404 when path is outside the case namespace', async () => {
    setRealEnv();
    const mod = await import('@/app/api/cases/[id]/documents/sign/route');
    const res = await mod.GET(
      makeReq('cases/case-2/secret.pdf') as never,
      { params: Promise.resolve({ id: 'case-1' }) },
    );
    expect(res.status).toBe(404);
    expect(storageStub.signedUrl).not.toHaveBeenCalled();
  });

  it('returns 404 when path contains ".." (traversal attempt)', async () => {
    setRealEnv();
    const mod = await import('@/app/api/cases/[id]/documents/sign/route');
    const res = await mod.GET(
      makeReq('cases/case-1/../case-2/secret.pdf') as never,
      { params: Promise.resolve({ id: 'case-1' }) },
    );
    expect(res.status).toBe(404);
    expect(storageStub.signedUrl).not.toHaveBeenCalled();
  });

  it('returns 404 when path is well-shaped but not in submitted_documents[]', async () => {
    setRealEnv();
    mockCase(['cases/case-1/20260513T140000-known.pdf']);
    const mod = await import('@/app/api/cases/[id]/documents/sign/route');
    const res = await mod.GET(
      makeReq('cases/case-1/20260513T999999-unknown.pdf') as never,
      { params: Promise.resolve({ id: 'case-1' }) },
    );
    expect(res.status).toBe(404);
    expect(storageStub.signedUrl).not.toHaveBeenCalled();
  });

  it('happy path — mints a signed URL and audit-logs case_document_viewed', async () => {
    setRealEnv();
    mockCase(['cases/case-1/20260513T140000-known.pdf']);
    storageStub.signedUrl = vi.fn(async (bucket: string, path: string, ttl: number) => ({
      ok: true,
      url: `https://example.supabase.co/sign/${bucket}/${path}?t=${ttl}`,
      expiresAt: new Date(Date.now() + ttl * 1000),
    }));

    const { logAuditEvent } = await import('@/lib/audit');
    const mod = await import('@/app/api/cases/[id]/documents/sign/route');
    const res = await mod.GET(
      makeReq('cases/case-1/20260513T140000-known.pdf') as never,
      { params: Promise.resolve({ id: 'case-1' }) },
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.available).toBe(true);
    expect(body.url).toContain('/sign/efax-documents/cases/case-1/');
    expect(storageStub.signedUrl).toHaveBeenCalledWith(
      'efax-documents',
      'cases/case-1/20260513T140000-known.pdf',
      300,
    );

    const calls = (logAuditEvent as unknown as { mock: { calls: unknown[][] } }).mock.calls;
    expect(calls.some((c) => c[1] === 'case_document_viewed')).toBe(true);
  });
});
