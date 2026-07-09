import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { hashApiKey, generatePartnerKey } from '@/lib/partner/auth';

/**
 * Tests for the Partner API v1 (docs/PARTNER_API.md): key hashing/issuance,
 * the auth gate, required idempotency (ledger claim → 200 idempotent on
 * conflict, no double-create), tenant binding from the key (never the
 * body), case_type/review_type acceptance, schema errors (paths only),
 * and the read endpoint's tenant wall.
 */

let demoMode = false;
vi.mock('@/lib/demo-mode', () => ({
  isDemoMode: () => demoMode,
}));

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

vi.mock('@/lib/intake/confirmation', () => ({
  generateAuthorizationNumber: vi.fn().mockResolvedValue('AUTH-2026-000001'),
  logIntakeEvent: vi.fn().mockResolvedValue(undefined),
  hashPatientName: vi.fn().mockReturnValue('PHI-HASH'),
  sendReceiptConfirmation: vi.fn().mockResolvedValue({ confirmation_sent: true }),
}));

vi.mock('@/lib/intake/finalize-case', () => ({
  finalizeIntakeCase: vi.fn().mockResolvedValue({ finalized: true }),
  isChannelAgnosticIntakeEnabled: () => false,
}));

vi.mock('@/lib/intake/efax/storage', () => ({
  computeSubmissionFingerprint: vi.fn().mockReturnValue(null),
  findDuplicateCase: vi.fn().mockResolvedValue(null),
}));

vi.mock('@/lib/intake/persistence-guard', () => ({
  intakePersistenceGuard: () => null,
}));

// ── DB stub ────────────────────────────────────────────────────────────────
const KEY = generatePartnerKey();
const db = {
  keyRow: {
    id: 'key-1', client_id: 'client-A', name: 'Test Partner', scopes: ['submit', 'read'], active: true,
  } as Record<string, unknown> | null,
  claimConflict: false,
  insertedCases: [] as Record<string, unknown>[],
  insertedLedger: [] as Record<string, unknown>[],
  caseReadRow: null as Record<string, unknown> | null,
  lastCaseReadFilters: {} as Record<string, unknown>,
};

type AnyFn = (...args: unknown[]) => unknown;
vi.mock('@/lib/supabase', () => ({
  getServiceClient: () => ({
    from: ((table: string) => {
      if (table === 'partner_api_keys') {
        return {
          select: () => ({
            eq: (_c: string, hash: string) => ({
              maybeSingle: async () => ({
                data: db.keyRow && hash === KEY.key_hash ? db.keyRow : null,
                error: null,
              }),
            }),
          }),
          update: () => ({ eq: () => ({ then: (r: AnyFn) => r() }) }),
        };
      }
      if (table === 'intake_submissions') {
        return {
          insert: (row: Record<string, unknown>) => ({
            select: () => ({
              single: async () => {
                if (db.claimConflict) return { data: null, error: { code: '23505', message: 'duplicate key' } };
                db.insertedLedger.push(row);
                return { data: row, error: null };
              },
            }),
          }),
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: { case_id: 'case-original', status: 'case_created', first_seen_at: '2026-07-09T05:00:00Z' },
                error: null,
              }),
            }),
          }),
          update: () => ({ eq: async () => ({ data: null, error: null }) }),
          delete: () => ({ eq: async () => ({ data: null, error: null }) }),
        };
      }
      if (table === 'cases') {
        const filters: Record<string, unknown> = {};
        const chain = {
          insert: (row: Record<string, unknown>) => ({
            select: () => ({
              single: async () => {
                db.insertedCases.push(row);
                return { data: { id: 'case-new-1', case_number: row.case_number }, error: null };
              },
            }),
          }),
          select: () => chain,
          eq: (col: string, val: unknown) => { filters[col] = val; return chain; },
          order: () => chain,
          limit: async () => ({ data: [], error: null }),
          gte: () => chain,
          maybeSingle: async () => {
            db.lastCaseReadFilters = { ...filters };
            return { data: db.caseReadRow, error: null };
          },
          single: async () => ({ data: db.caseReadRow, error: db.caseReadRow ? null : { message: 'not found' } }),
        };
        return chain;
      }
      return {};
    }) as AnyFn,
  }),
}));

function post(body: unknown, headers: Record<string, string> = {}) {
  return new Request('https://app.vantaum.com/api/partner/v1/cases', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  }) as never;
}

const VALID = {
  patient_name: 'Verification Test-Patient',
  procedure_codes: ['27447'],
  case_type: 'payer_idr',
  review_type: 'appeal',
};
const AUTHED = { 'x-api-key': KEY.plaintext, 'idempotency-key': 'partner-ref-0001' };

beforeEach(() => {
  demoMode = false;
  vi.resetModules();
  db.claimConflict = false;
  db.insertedCases = [];
  db.insertedLedger = [];
  db.caseReadRow = null;
  db.keyRow = { id: 'key-1', client_id: 'client-A', name: 'Test Partner', scopes: ['submit', 'read'], active: true };
});
afterEach(() => vi.unstubAllEnvs());

describe('partner key primitives', () => {
  it('generates vum_live_ keys and stores only the hash', () => {
    const k = generatePartnerKey();
    expect(k.plaintext).toMatch(/^vum_live_[0-9a-f]{64}$/);
    expect(k.key_hash).toBe(hashApiKey(k.plaintext));
    expect(k.key_hash).not.toContain(k.plaintext.slice(9));
  });
});

describe('POST /api/partner/v1/cases', () => {
  it('401s without a key and with an unknown key', async () => {
    const { POST } = await import('@/app/api/partner/v1/cases/route');
    expect((await POST(post(VALID, { 'idempotency-key': 'partner-ref-0001' }))).status).toBe(401);
    expect((await POST(post(VALID, { 'x-api-key': 'vum_live_wrong', 'idempotency-key': 'partner-ref-0001' }))).status).toBe(401);
  });

  it('401s an inactive key', async () => {
    db.keyRow = { ...db.keyRow!, active: false };
    const { POST } = await import('@/app/api/partner/v1/cases/route');
    expect((await POST(post(VALID, AUTHED))).status).toBe(401);
  });

  it('400s without an Idempotency-Key', async () => {
    const { POST } = await import('@/app/api/partner/v1/cases/route');
    const res = await POST(post(VALID, { 'x-api-key': KEY.plaintext }));
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe('idempotency_key_required');
  });

  it('202 creates the case with tenant binding from the KEY, case_type honored', async () => {
    const { POST } = await import('@/app/api/partner/v1/cases/route');
    const res = await POST(post({ ...VALID, client_id: 'client-EVIL' }, AUTHED));
    expect(res.status).toBe(202);
    const json = await res.json();
    expect(json.case_id).toBe('case-new-1');
    expect(json.client_reference).toBe('partner-ref-0001');
    const inserted = db.insertedCases[0];
    expect(inserted.client_id).toBe('client-A'); // never the body's client_id
    expect(inserted.case_type).toBe('payer_idr');
    expect(inserted.review_type).toBe('appeal');
    expect(inserted.external_reference).toBe('partner-ref-0001');
    expect(db.insertedLedger[0].submission_id).toBe('partner:client-A:partner-ref-0001');
  });

  it('idempotent resend → 200 with original case, no new case row', async () => {
    db.claimConflict = true;
    const { POST } = await import('@/app/api/partner/v1/cases/route');
    const res = await POST(post(VALID, AUTHED));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.idempotent).toBe(true);
    expect(json.case_id).toBe('case-original');
    expect(db.insertedCases).toHaveLength(0); // no double-created cases, ever
  });

  it('rejects an invalid case_type with field-level errors (no values echoed)', async () => {
    const { POST } = await import('@/app/api/partner/v1/cases/route');
    const res = await POST(post({ ...VALID, case_type: 'not_a_stream', patient_name: 'Secret Name' }, AUTHED));
    expect(res.status).toBe(400);
    const json = await res.json();
    const paths = (json.error.errors as Array<{ path: string }>).map((e) => e.path);
    expect(paths).toContain('case_type');
    expect(JSON.stringify(json.error.errors)).not.toContain('Secret Name');
  });
});

describe('GET /api/partner/v1/cases/[id]', () => {
  it('tenant wall: lookup is always filtered by the key client_id; miss → 404', async () => {
    db.caseReadRow = null;
    const { GET } = await import('@/app/api/partner/v1/cases/[id]/route');
    const req = new Request('https://app.vantaum.com/api/partner/v1/cases/partner-ref-0001', {
      headers: { 'x-api-key': KEY.plaintext },
    }) as never;
    const res = await GET(req, { params: Promise.resolve({ id: 'partner-ref-0001' }) });
    expect(res.status).toBe(404);
    expect(db.lastCaseReadFilters.client_id).toBe('client-A');
    expect(db.lastCaseReadFilters.external_reference).toBe('partner-ref-0001');
  });

  it('returns the determination block once decided', async () => {
    db.caseReadRow = {
      id: 'case-1', case_number: 'VUM-API-2026-000001', external_reference: 'partner-ref-0001',
      status: 'determination_made', case_type: 'um', review_type: 'prior_auth', priority: 'standard',
      determination: 'approve', determination_rationale: 'Meets criteria', determination_at: '2026-07-09T06:00:00Z',
      turnaround_deadline: null, created_at: '2026-07-09T05:00:00Z', updated_at: '2026-07-09T06:00:00Z',
    };
    const { GET } = await import('@/app/api/partner/v1/cases/[id]/route');
    const req = new Request('https://app.vantaum.com/api/partner/v1/cases/case-1', {
      headers: { 'x-api-key': KEY.plaintext },
    }) as never;
    const res = await GET(req, { params: Promise.resolve({ id: 'partner-ref-0001' }) });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.determination.decision).toBe('approve');
    expect(json.client_reference).toBe('partner-ref-0001');
  });
});
