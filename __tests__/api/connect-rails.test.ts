import { describe, it, expect, beforeEach, vi } from 'vitest';
import { generatePartnerKey } from '@/lib/partner/auth';

/**
 * Route tests for the standards rails (docs/CONNECTOR_RAILS.md):
 *
 *   POST /api/connect/fhir/Claim/$submit — Da Vinci PAS bundle inbound
 *   POST /api/connect/x12/278            — X12 278 EDI inbound
 *
 * Both must: gate on the partner key + submit scope, run the SAME shared
 * ledger-idempotent ingest (tenant from the key), and answer in their own
 * dialect — ClaimResponse (queued/A4 + preAuthRef) and a 278 response
 * (HCR A4 + auth number). Mapping failures are path-only (PHI rule).
 */

let demoMode = false;
vi.mock('@/lib/demo-mode', () => ({ isDemoMode: () => demoMode }));
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
  generateAuthorizationNumber: vi.fn().mockResolvedValue('AUTH-2026-000777'),
  logIntakeEvent: vi.fn().mockResolvedValue(undefined),
  hashPatientName: vi.fn().mockReturnValue('PHI-HASH'),
}));
vi.mock('@/lib/intake/efax/storage', () => ({
  computeSubmissionFingerprint: vi.fn().mockReturnValue(null),
  findDuplicateCase: vi.fn().mockResolvedValue(null),
}));
vi.mock('@/lib/intake/persistence-guard', () => ({
  intakePersistenceGuard: () => null,
}));
const dispatchFinalization = vi.fn().mockResolvedValue({ mode: 'queued' });
vi.mock('@/lib/intake/brief-queue', () => ({
  dispatchFinalization: (...args: unknown[]) => dispatchFinalization(...args),
}));

// ── DB stub ────────────────────────────────────────────────────────────────
const KEY = generatePartnerKey();
const db = {
  keyRow: { id: 'key-1', client_id: 'client-A', name: 'Test Partner', scopes: ['submit', 'read'], active: true } as Record<string, unknown> | null,
  claimConflict: false,
  insertedCases: [] as Record<string, unknown>[],
  insertedLedger: [] as Record<string, unknown>[],
  existingAuthNumber: 'AUTH-2026-000111',
};

type AnyFn = (...args: unknown[]) => unknown;
vi.mock('@/lib/supabase', () => ({
  getServiceClient: () => ({
    rpc: async () => ({ data: 42, error: null }),
    from: ((table: string) => {
      if (table === 'partner_api_keys') {
        return {
          select: () => ({
            eq: (_c: string, hash: string) => ({
              maybeSingle: async () => ({ data: db.keyRow && hash !== 'nope' ? db.keyRow : null, error: null }),
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
        return {
          insert: (row: Record<string, unknown>) => ({
            select: () => ({
              single: async () => {
                db.insertedCases.push(row);
                return { data: { id: 'case-new-1', case_number: row.case_number }, error: null };
              },
            }),
          }),
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: { authorization_number: db.existingAuthNumber }, error: null }),
            }),
          }),
        };
      }
      return {};
    }) as AnyFn,
  }),
}));

// ── Fixtures ───────────────────────────────────────────────────────────────

const PAS_BUNDLE = {
  resourceType: 'Bundle',
  type: 'collection',
  entry: [
    {
      resource: {
        resourceType: 'Claim',
        id: 'claim-1',
        identifier: [{ value: 'PAS-REQ-2026-0001' }],
        patient: { reference: 'Patient/pat-1' },
        item: [{ productOrService: { coding: [{ code: '27447' }] } }],
        priority: { coding: [{ code: 'urgent' }] },
      },
    },
    {
      resource: {
        resourceType: 'Patient',
        id: 'pat-1',
        name: [{ family: 'Doe', given: ['John'] }],
        birthDate: '1964-07-12',
        identifier: [{ value: 'MBR00012345' }],
      },
    },
  ],
};

const X12_278 = [
  'ISA*00*          *00*          *ZZ*SUBMITTERID    *ZZ*VANTAUM        *260709*0930*^*00501*000000905*0*P*:',
  'GS*HI*SUBMITTERID*VANTAUM*20260709*0930*1*X*005010X217',
  'ST*278*0001*005010X217',
  'BHT*0007*13*REF-X12-000042*20260709*0930',
  'HL*1**20*1',
  'NM1*X3*2*ACME HEALTH PLAN*****PI*12345',
  'HL*2*1*21*1',
  'NM1*1P*1*ORTHO*JANE****XX*1234567893',
  'HL*3*2*22*1',
  'NM1*IL*1*DOE*JOHN****MI*MBR00012345',
  'DMG*D8*19640712*M',
  'HL*4*3*EV*0',
  'TRN*1*REF-X12-000042*9012345678',
  'UM*HS*I*2',
  'HI*ABK:M1711',
  'SV1*HC:27447*12000*UN*1',
  'SE*14*0001',
  'GE*1*1',
  'IEA*1*000000905',
].join('~') + '~';

function fhirPost(body: unknown, headers: Record<string, string> = {}) {
  return new Request('https://app.vantaum.com/api/connect/fhir/Claim/$submit', {
    method: 'POST',
    headers: { 'content-type': 'application/fhir+json', ...headers },
    body: JSON.stringify(body),
  }) as never;
}

function ediPost(body: string, headers: Record<string, string> = {}) {
  return new Request('https://app.vantaum.com/api/connect/x12/278', {
    method: 'POST',
    headers: { 'content-type': 'application/edi-x12', ...headers },
    body,
  }) as never;
}

const AUTHED = { 'x-api-key': KEY.plaintext };

beforeEach(() => {
  demoMode = false;
  vi.resetModules();
  db.claimConflict = false;
  db.insertedCases = [];
  db.insertedLedger = [];
  db.keyRow = { id: 'key-1', client_id: 'client-A', name: 'Test Partner', scopes: ['submit', 'read'], active: true };
  dispatchFinalization.mockClear();
});

// ── FHIR PAS ───────────────────────────────────────────────────────────────

describe('POST /api/connect/fhir/Claim/$submit', () => {
  it('401s without a key, as an OperationOutcome', async () => {
    const { POST } = await import('@/app/api/connect/fhir/Claim/$submit/route');
    const res = await POST(fhirPost(PAS_BUNDLE));
    expect(res.status).toBe(401);
    expect((await res.json()).resourceType).toBe('OperationOutcome');
  });

  it('403s a key without the submit scope', async () => {
    db.keyRow = { ...db.keyRow!, scopes: ['read'] };
    const { POST } = await import('@/app/api/connect/fhir/Claim/$submit/route');
    expect((await POST(fhirPost(PAS_BUNDLE, AUTHED))).status).toBe(403);
  });

  it('400s a bad bundle with path-only OperationOutcome issues', async () => {
    const { POST } = await import('@/app/api/connect/fhir/Claim/$submit/route');
    const bad = JSON.parse(JSON.stringify(PAS_BUNDLE));
    bad.entry[0].resource.identifier = [];
    const res = await POST(fhirPost(bad, AUTHED));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.resourceType).toBe('OperationOutcome');
    expect(JSON.stringify(json)).toContain('Claim.identifier[0].value');
    expect(JSON.stringify(json)).not.toContain('MBR00012345'); // paths, never values
  });

  it('creates the case via the shared ingest and answers a queued ClaimResponse with preAuthRef', async () => {
    const { POST } = await import('@/app/api/connect/fhir/Claim/$submit/route');
    const res = await POST(fhirPost(PAS_BUNDLE, AUTHED));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.resourceType).toBe('ClaimResponse');
    expect(json.outcome).toBe('queued');
    expect(json.preAuthRef).toBe('AUTH-2026-000777');
    expect(JSON.stringify(json)).toContain('"code":"A4"');
    // Shared ingest ran: ledger claimed with the rail-scoped key, tenant from the KEY.
    expect(db.insertedLedger[0].submission_id).toBe('partner:client-A:PAS-REQ-2026-0001');
    const inserted = db.insertedCases[0];
    expect(inserted.client_id).toBe('client-A');
    expect(inserted.priority).toBe('urgent');
    expect(inserted.external_reference).toBe('PAS-REQ-2026-0001');
    expect(String(inserted.case_number)).toContain('VUM-FHIR_PAS-');
    expect(dispatchFinalization).toHaveBeenCalledWith('case-new-1', { channel: 'api', actor: 'rail:fhir_pas' });
  });

  it('idempotent replay (same Claim.identifier) → 200 ClaimResponse, no second case', async () => {
    db.claimConflict = true;
    const { POST } = await import('@/app/api/connect/fhir/Claim/$submit/route');
    const res = await POST(fhirPost(PAS_BUNDLE, AUTHED));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.resourceType).toBe('ClaimResponse');
    expect(json.preAuthRef).toBe('AUTH-2026-000111'); // the ORIGINAL case's auth number
    expect(db.insertedCases).toHaveLength(0);
  });

  it('demo mode short-circuits with a demo ClaimResponse and never touches ingest', async () => {
    demoMode = true;
    const { POST } = await import('@/app/api/connect/fhir/Claim/$submit/route');
    const res = await POST(fhirPost(PAS_BUNDLE, AUTHED));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.resourceType).toBe('ClaimResponse');
    expect(json.preAuthRef).toContain('VUM-DEMO-');
    expect(db.insertedLedger).toHaveLength(0);
  });
});

// ── X12 278 ────────────────────────────────────────────────────────────────

describe('POST /api/connect/x12/278', () => {
  it('401s without a key', async () => {
    const { POST } = await import('@/app/api/connect/x12/278/route');
    expect((await POST(ediPost(X12_278))).status).toBe(401);
  });

  it('400s unparseable EDI with locator-only errors', async () => {
    const { POST } = await import('@/app/api/connect/x12/278/route');
    const res = await POST(ediPost('NOT-AN-INTERCHANGE', AUTHED));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error.code).toBe('x12_invalid');
    expect(JSON.stringify(json)).not.toContain('DOE');
  });

  it('creates the case and answers a pended 278 response with the auth number', async () => {
    const { POST } = await import('@/app/api/connect/x12/278/route');
    const res = await POST(ediPost(X12_278, AUTHED));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/edi-x12');
    const body = await res.text();
    expect(body).toContain('HCR*A4*AUTH-2026-000777');
    expect(body).toContain('BHT*0007*11*REF-X12-000042'); // response BHT echoes the trace
    // Shared ingest: TRN02 is the idempotency reference, tenant from the KEY.
    expect(db.insertedLedger[0].submission_id).toBe('partner:client-A:REF-X12-000042');
    const inserted = db.insertedCases[0];
    expect(inserted.client_id).toBe('client-A');
    expect(inserted.patient_name).toBe('JOHN DOE');
    expect(inserted.procedure_codes).toEqual(['27447']);
    expect(String(inserted.case_number)).toContain('VUM-X12_278-');
    expect(dispatchFinalization).toHaveBeenCalledWith('case-new-1', { channel: 'api', actor: 'rail:x12_278' });
  });

  it('retransmission of the same TRN02 → same pended response with the original auth number, no second case', async () => {
    db.claimConflict = true;
    const { POST } = await import('@/app/api/connect/x12/278/route');
    const res = await POST(ediPost(X12_278, AUTHED));
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain('HCR*A4*AUTH-2026-000111');
    expect(db.insertedCases).toHaveLength(0);
  });

  it('demo mode answers a rendered 278 without touching the ledger', async () => {
    demoMode = true;
    const { POST } = await import('@/app/api/connect/x12/278/route');
    const res = await POST(ediPost(X12_278, AUTHED));
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('HCR*A4*VUMDEMO');
    expect(db.insertedLedger).toHaveLength(0);
  });
});
