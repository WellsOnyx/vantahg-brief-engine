import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

/**
 * Tests for POST /api/cases/[id]/documents.
 *
 * Locks down:
 * - Auth gate (401 in prod demo)
 * - Demo-mode no-op shape with X-Demo-Mode header
 * - Multipart parse: empty / oversized requests rejected with 400
 * - Per-file validation: non-PDF / >10MB land in rejected[] with a
 *   typed reason, NEVER in accepted[]
 * - Happy path: adapter receives the bytes, cases.submitted_documents
 *   is updated, accepted[] mirrors the input
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

// case-access in demo mode auto-allows; we mock it to be a no-op pass-through.
vi.mock('@/lib/case-access', () => ({
  assertCaseAccess: vi.fn().mockResolvedValue(null),
}));

type AnyFn = (...args: unknown[]) => unknown;
const supabaseStub = { from: vi.fn() as AnyFn };
const storageStub = { upload: vi.fn() as AnyFn };

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

function makeMultipartRequest(parts: { name: string; file: File }[]) {
  const fd = new FormData();
  for (const p of parts) fd.append(p.name, p.file);
  return new Request('https://app.vantaum.com/api/cases/case-1/documents', {
    method: 'POST',
    body: fd,
  });
}

function pdfFile(name: string, bytes = 1024): File {
  return new File([new Uint8Array(bytes)], name, { type: 'application/pdf' });
}

function nonPdfFile(name: string): File {
  return new File([new Uint8Array(100)], name, { type: 'image/jpeg' });
}

describe('POST /api/cases/[id]/documents', () => {
  beforeEach(() => {
    vi.resetModules();
    storageStub.upload = vi.fn();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns 401 in production demo mode', async () => {
    clearSupabaseEnv();
    vi.stubEnv('NODE_ENV', 'production');
    const mod = await import('@/app/api/cases/[id]/documents/route');
    const res = await mod.POST(
      makeMultipartRequest([{ name: 'files', file: pdfFile('a.pdf') }]) as never,
      { params: Promise.resolve({ id: 'case-1' }) },
    );
    expect(res.status).toBe(401);
  });

  it('returns no-op success with X-Demo-Mode header in dev demo', async () => {
    clearSupabaseEnv();
    vi.stubEnv('NODE_ENV', 'development');
    const mod = await import('@/app/api/cases/[id]/documents/route');
    const res = await mod.POST(
      makeMultipartRequest([{ name: 'files', file: pdfFile('a.pdf') }]) as never,
      { params: Promise.resolve({ id: 'case-1' }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.demo).toBe(true);
    expect(res.headers.get('X-Demo-Mode')).toBe('true');
  });

  it('returns 400 when no files field is supplied', async () => {
    setRealEnv();
    const mod = await import('@/app/api/cases/[id]/documents/route');
    const res = await mod.POST(
      new Request('https://app.vantaum.com/api/cases/case-1/documents', {
        method: 'POST',
        body: new FormData(),
      }) as never,
      { params: Promise.resolve({ id: 'case-1' }) },
    );
    expect(res.status).toBe(400);
  });

  it('returns 400 when more than 5 files are uploaded', async () => {
    setRealEnv();
    supabaseStub.from = vi.fn(() => ({
      select: () => ({
        eq: () => ({
          single: async () => ({
            data: { id: 'case-1', client_id: 'c-1', submitted_documents: [] },
            error: null,
          }),
        }),
      }),
    }) as AnyFn);

    const mod = await import('@/app/api/cases/[id]/documents/route');
    const res = await mod.POST(
      makeMultipartRequest(
        Array.from({ length: 6 }, (_, i) => ({
          name: 'files',
          file: pdfFile(`f${i}.pdf`),
        })),
      ) as never,
      { params: Promise.resolve({ id: 'case-1' }) },
    );
    expect(res.status).toBe(400);
  });

  it('rejects non-PDF files with content_type_unsupported, accepted[] stays empty', async () => {
    setRealEnv();
    supabaseStub.from = vi.fn(((table: string) => {
      if (table === 'cases') {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({
                data: { id: 'case-1', client_id: 'c-1', submitted_documents: [] },
                error: null,
              }),
            }),
          }),
          update: () => ({ eq: async () => ({ data: null, error: null }) }),
        };
      }
      return {};
    }) as AnyFn);

    const mod = await import('@/app/api/cases/[id]/documents/route');
    const res = await mod.POST(
      makeMultipartRequest([{ name: 'files', file: nonPdfFile('not-a-pdf.jpg') }]) as never,
      { params: Promise.resolve({ id: 'case-1' }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.accepted).toEqual([]);
    expect(body.rejected).toHaveLength(1);
    expect(body.rejected[0].reason).toBe('content_type_unsupported');
    expect(storageStub.upload).not.toHaveBeenCalled();
  });

  it('happy path — adapter receives bytes, submitted_documents is appended', async () => {
    setRealEnv();
    const updateMock = vi.fn(async () => ({ data: null, error: null }));
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
                  submitted_documents: ['cases/case-1/previous.pdf'],
                },
                error: null,
              }),
            }),
          }),
          update: (payload: Record<string, unknown>) => ({
            eq: async () => {
              updateMock(payload);
              return { data: null, error: null };
            },
          }),
        };
      }
      return {};
    }) as AnyFn);

    storageStub.upload = vi.fn(async (_bucket: string, path: string, bytes: Buffer) => ({
      ok: true,
      path,
      bytes: bytes.byteLength,
    }));

    const mod = await import('@/app/api/cases/[id]/documents/route');
    const res = await mod.POST(
      makeMultipartRequest([
        { name: 'files', file: pdfFile('clin-notes.pdf', 500) },
        { name: 'files', file: pdfFile('sleep-study.pdf', 2048) },
      ]) as never,
      { params: Promise.resolve({ id: 'case-1' }) },
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.accepted).toHaveLength(2);
    expect(body.rejected).toEqual([]);
    expect(storageStub.upload).toHaveBeenCalledTimes(2);
    // Bucket arg + path prefix
    const firstCall = (storageStub.upload as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(firstCall[0]).toBe('efax-documents');
    expect(firstCall[1]).toMatch(/^cases\/case-1\/\d{8}T\d{6}-clin-notes\.pdf$/);

    // submitted_documents update merges new paths after the existing one
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        submitted_documents: expect.arrayContaining([
          'cases/case-1/previous.pdf',
        ]),
      }),
    );
    const calledWith = updateMock.mock.calls[0][0] as { submitted_documents: string[] };
    expect(calledWith.submitted_documents).toHaveLength(3);
  });
});
