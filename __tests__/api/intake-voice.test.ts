import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  computeIntakeSignature,
  computeLegacySignature,
  signIntakeRequest,
  verifyIntakeSignature,
  INTAKE_CONTRACT_VERSION,
} from '@/lib/intake/gr-contract';

/**
 * Tests for the Canonical Intake Contract v1.1 (docs/INTAKE_CONTRACT.md) —
 * lib/intake/gr-contract.ts + app/api/intake/voice/route.ts.
 *
 * Pins the doc's worked signature example byte-for-byte, covers the HMAC /
 * timestamp / replay gate, dual-secret rotation, schema validation with
 * field-level errors, the 202 success shape, the pend-cleanly path, the
 * sandbox gate, and submission_id idempotency (409 duplicate).
 */

let demoMode = true;
vi.mock('@/lib/demo-mode', () => ({
  isDemoMode: () => demoMode,
}));

vi.mock('@/lib/audit', () => ({
  logAuditEvent: vi.fn().mockResolvedValue(undefined),
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

const finalizeIntakeCase = vi.fn().mockResolvedValue({ finalized: true });
vi.mock('@/lib/intake/finalize-case', () => ({
  finalizeIntakeCase: (...a: unknown[]) => finalizeIntakeCase(...a),
  isChannelAgnosticIntakeEnabled: () => false,
}));

type AnyFn = (...args: unknown[]) => unknown;
const serviceClientStub: { from: AnyFn } = { from: vi.fn() };
vi.mock('@/lib/supabase', () => ({
  getServiceClient: () => serviceClientStub,
}));

const computeSubmissionFingerprint = vi.fn().mockReturnValue(null);
vi.mock('@/lib/intake/efax/storage', () => ({
  computeSubmissionFingerprint: (...a: unknown[]) => computeSubmissionFingerprint(...a),
  findDuplicateCase: vi.fn().mockResolvedValue(null),
}));

function validBody(overrides: Record<string, unknown> = {}) {
  return {
    contract_version: '1.1',
    submission_id: 'gr-test-00000001',
    intake_channel: 'phone',
    from_number: '+14155550100',
    transcript: 'caller asked about a knee scope',
    field_values: {
      patient_name: 'Maria Santos',
      patient_dob: '03/14/1975',
      member_id: 'XYZ987654',
      procedure_codes: ['27447'],
      provider_name: 'Dr. Alan Grant',
    },
    ...overrides,
  };
}

function post(rawBody: string, headers: Record<string, string> = {}) {
  return new Request('https://app.vantaum.com/api/intake/voice', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: rawBody,
  }) as never;
}

function postJson(body: unknown, headers: Record<string, string> = {}) {
  return post(JSON.stringify(body), headers);
}

beforeEach(() => {
  demoMode = true;
  vi.resetModules();
  serviceClientStub.from = vi.fn();
  computeSubmissionFingerprint.mockReturnValue(null);
});
afterEach(() => {
  vi.unstubAllEnvs();
});

// ---------------------------------------------------------------------------
// Signing primitives — pinned to the doc's worked example
// ---------------------------------------------------------------------------

describe('gr-contract signing', () => {
  const DOC_SECRET = 'whsec_c4n0n1cal_example_do_not_use';
  const DOC_TS = '1751810400';
  const DOC_BODY =
    '{"contract_version":"1.1","submission_id":"gr-sub-000001","intake_channel":"phone","event":"intake.completed","from_number":"+14155550100","chat_id":12345,"transcript":"Patient John Smith, DOB 03/14/1975, member ID ABC123456, requesting prior auth for CPT 27447 total knee arthroplasty with Dr. Alan Grant."}';
  const DOC_SIG = 'd8046838367c1e42d2382b68525ecf20a270ddf55b303b8de6bb998ab385a21f';
  const DOC_LEGACY_SIG = '4aadd001447bda47820cd89bc2436f9436dc6173eafceab4ee82e06b0d9937b5';

  it('reproduces the INTAKE_CONTRACT.md §5.2 worked example byte-for-byte', () => {
    expect(computeIntakeSignature(DOC_SECRET, DOC_TS, DOC_BODY)).toBe(DOC_SIG);
  });

  it('verifies against the secondary secret (rotation without downtime)', () => {
    const { timestamp, signature } = signIntakeRequest('new-secret', '{"a":1}');
    const verdict = verifyIntakeSignature({
      rawBody: '{"a":1}',
      signatureHeader: signature,
      timestampHeader: timestamp,
      secrets: ['old-secret', 'new-secret'],
    });
    expect(verdict).toEqual({ ok: true, secretIndex: 1, scheme: 'v1_1' });
  });

  it('reproduces the v1 LEGACY signature and accepts it during the window', () => {
    expect(computeLegacySignature(DOC_SECRET, DOC_BODY)).toBe(DOC_LEGACY_SIG);
    const verdict = verifyIntakeSignature({
      rawBody: DOC_BODY,
      signatureHeader: null,
      timestampHeader: null,
      legacySignatureHeader: DOC_LEGACY_SIG,
      secrets: [DOC_SECRET],
    });
    expect(verdict).toEqual({ ok: true, secretIndex: 0, scheme: 'v1_legacy' });
  });

  it('rejects the legacy scheme once the transition window is closed', () => {
    const verdict = verifyIntakeSignature({
      rawBody: DOC_BODY,
      signatureHeader: null,
      timestampHeader: null,
      legacySignatureHeader: DOC_LEGACY_SIG,
      secrets: [DOC_SECRET],
      acceptLegacy: false,
    });
    expect(verdict).toEqual({ ok: false, code: 'signature_missing' });
  });

  it('rejects a timestamp outside the replay window', () => {
    const stale = Math.floor(Date.now() / 1000) - 3600;
    const { timestamp, signature } = signIntakeRequest('s', '{}', stale);
    const verdict = verifyIntakeSignature({
      rawBody: '{}',
      signatureHeader: signature,
      timestampHeader: timestamp,
      secrets: ['s'],
    });
    expect(verdict).toEqual({ ok: false, code: 'replay_rejected' });
  });
});

// ---------------------------------------------------------------------------
// Route: signature / timestamp gate
// ---------------------------------------------------------------------------

describe('POST /api/intake/voice — auth gate', () => {
  it('rejects an invalid HMAC signature with 401 signature_invalid', async () => {
    vi.stubEnv('GR_WEBHOOK_SECRET', 'shhh');
    const { POST } = await import('@/app/api/intake/voice/route');
    const raw = JSON.stringify(validBody());
    const ts = String(Math.floor(Date.now() / 1000));
    const res = await POST(post(raw, { 'x-gr-timestamp': ts, 'x-gr-signature': 'sha256=deadbeef' }));
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error.code).toBe('signature_invalid');
  });

  it('rejects a missing timestamp with 401 timestamp_missing', async () => {
    vi.stubEnv('GR_WEBHOOK_SECRET', 'shhh');
    const { POST } = await import('@/app/api/intake/voice/route');
    const raw = JSON.stringify(validBody());
    const res = await POST(post(raw, { 'x-gr-signature': 'sha256=deadbeef' }));
    expect(res.status).toBe(401);
    expect((await res.json()).error.code).toBe('timestamp_missing');
  });

  it('rejects a stale timestamp with 401 replay_rejected even when correctly signed', async () => {
    vi.stubEnv('GR_WEBHOOK_SECRET', 'shhh');
    const { POST } = await import('@/app/api/intake/voice/route');
    const raw = JSON.stringify(validBody());
    const stale = Math.floor(Date.now() / 1000) - 3600;
    const { timestamp, signature } = signIntakeRequest('shhh', raw, stale);
    const res = await POST(post(raw, { 'x-gr-timestamp': timestamp, 'x-gr-signature': signature }));
    expect(res.status).toBe(401);
    expect((await res.json()).error.code).toBe('replay_rejected');
  });

  it('accepts a correctly signed request (primary secret) → 202', async () => {
    vi.stubEnv('GR_WEBHOOK_SECRET', 'shhh');
    const { POST } = await import('@/app/api/intake/voice/route');
    const raw = JSON.stringify(validBody());
    const { timestamp, signature } = signIntakeRequest('shhh', raw);
    const res = await POST(post(raw, { 'x-gr-timestamp': timestamp, 'x-gr-signature': signature }));
    expect(res.status).toBe(202);
  });

  it('accepts a request signed with the SECONDARY secret during rotation', async () => {
    vi.stubEnv('GR_WEBHOOK_SECRET', 'old-secret');
    vi.stubEnv('GR_WEBHOOK_SECRET_SECONDARY', 'new-secret');
    const { POST } = await import('@/app/api/intake/voice/route');
    const raw = JSON.stringify(validBody());
    const { timestamp, signature } = signIntakeRequest('new-secret', raw);
    const res = await POST(post(raw, { 'x-gr-timestamp': timestamp, 'x-gr-signature': signature }));
    expect(res.status).toBe(202);
  });
});

// ---------------------------------------------------------------------------
// Route: schema validation
// ---------------------------------------------------------------------------

describe('POST /api/intake/voice — schema', () => {
  it('returns 400 schema_invalid on invalid JSON', async () => {
    const { POST } = await import('@/app/api/intake/voice/route');
    const res = await POST(post('not json{'));
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe('schema_invalid');
  });

  it('returns field-level errors (paths only) when the envelope is missing', async () => {
    const { POST } = await import('@/app/api/intake/voice/route');
    // Pre-contract shape: no contract_version / submission_id / intake_channel.
    const res = await POST(postJson({ chat_id: 1, transcript: 'hi', from_number: '+14155550100' }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error.code).toBe('schema_invalid');
    const paths = (json.error.errors as Array<{ path: string }>).map((e) => e.path);
    expect(paths).toContain('contract_version');
    expect(paths).toContain('submission_id');
    expect(paths).toContain('intake_channel');
    // PHI rule: values are never echoed back.
    expect(JSON.stringify(json)).not.toContain('+14155550100');
  });

  it('rejects a submission_id with a PHI-capable charset', async () => {
    const { POST } = await import('@/app/api/intake/voice/route');
    const res = await POST(postJson(validBody({ submission_id: 'john smith 03/14/1975' })));
    expect(res.status).toBe(400);
    const paths = ((await res.json()).error.errors as Array<{ path: string }>).map((e) => e.path);
    expect(paths).toContain('submission_id');
  });

  it('requires at least one of transcript / field_values', async () => {
    const { POST } = await import('@/app/api/intake/voice/route');
    const res = await POST(
      postJson(validBody({ transcript: undefined, field_values: undefined })),
    );
    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// Route: success + pend-cleanly (demo short-circuit — no DB in these paths)
// ---------------------------------------------------------------------------

describe('POST /api/intake/voice — outcomes', () => {
  it('202 case_created from structured field_values (source=field_values)', async () => {
    const { POST } = await import('@/app/api/intake/voice/route');
    const res = await POST(postJson(validBody()));
    expect(res.status).toBe(202);
    const json = await res.json();
    expect(json.contract_version).toBe(INTAKE_CONTRACT_VERSION);
    expect(json.received_at).toBeTruthy();
    expect(json.extraction_source).toBe('field_values');
    expect(json.status).toBe('case_created');
    expect(json.case_id).toBeTruthy();
  });

  it('accepts a contract_version 1.0 envelope (still-valid during v1.1 rollout)', async () => {
    const { POST } = await import('@/app/api/intake/voice/route');
    const res = await POST(postJson(validBody({ contract_version: '1.0' })));
    expect(res.status).toBe(202);
    expect((await res.json()).contract_version).toBe(INTAKE_CONTRACT_VERSION);
  });

  it('202 pended_for_review when content-deficient (no procedure codes) — never a case', async () => {
    const { POST } = await import('@/app/api/intake/voice/route');
    const res = await POST(
      postJson(validBody({ field_values: { patient_name: 'No Codes', member_id: 'M1' } })),
    );
    expect(res.status).toBe(202);
    const json = await res.json();
    expect(json.status).toBe('pended_for_review');
    expect(json.needs_manual_review).toBe(true);
    expect(json.case_id).toBeNull();
  });

  it('202 case_created from transcript extraction when no field_values (source=transcript)', async () => {
    const { POST } = await import('@/app/api/intake/voice/route');
    const transcript = [
      { role: 'assistant', content: 'What is the patient name and procedure?' },
      { role: 'user', content: 'Patient: John Smith, Member ID: ABC123456, Procedure 27447' },
    ];
    const res = await POST(postJson(validBody({ field_values: undefined, transcript })));
    expect(res.status).toBe(202);
    const json = await res.json();
    expect(json.extraction_source).toBe('transcript');
    expect(json.status).toBe('case_created');
    expect(json.case_id).toBeTruthy();
  });

  it('403 sandbox_disabled when X-GR-Sandbox is sent without INTAKE_SANDBOX_ENABLED', async () => {
    const { POST } = await import('@/app/api/intake/voice/route');
    const res = await POST(postJson(validBody(), { 'x-gr-sandbox': 'true' }));
    expect(res.status).toBe(403);
    expect((await res.json()).error.code).toBe('sandbox_disabled');
  });
});

// ---------------------------------------------------------------------------
// Route: submission_id idempotency (non-demo — stubbed DB)
// ---------------------------------------------------------------------------

describe('POST /api/intake/voice — idempotency ledger', () => {
  function stubDb(opts: { claimConflict: boolean }) {
    const inserted: Record<string, unknown[]> = { intake_submissions: [], cases: [] };
    serviceClientStub.from = vi.fn(((table: string) => {
      if (table === 'intake_submissions') {
        return {
          insert: (row: unknown) => ({
            select: () => ({
              single: async () => {
                if (opts.claimConflict) {
                  return { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint' } };
                }
                inserted.intake_submissions.push(row);
                return { data: row, error: null };
              },
            }),
          }),
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: {
                  submission_id: 'gr-test-00000001',
                  case_id: 'case-original-1',
                  status: 'case_created',
                  first_seen_at: '2026-07-06T13:00:00.000Z',
                },
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
          insert: (row: unknown) => ({
            select: () => ({
              single: async () => {
                inserted.cases.push(row);
                return { data: { id: 'case-new-1', case_number: 'VUM-2026-000001' }, error: null };
              },
            }),
          }),
          update: () => ({ eq: async () => ({ data: null, error: null }) }),
        };
      }
      return {};
    }) as AnyFn);
    return inserted;
  }

  it('duplicate submission_id → 409 duplicate with the ORIGINAL case_id, no new case', async () => {
    demoMode = false;
    const inserted = stubDb({ claimConflict: true });
    const { POST } = await import('@/app/api/intake/voice/route');
    const res = await POST(postJson(validBody()));
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.error.code).toBe('duplicate');
    expect(json.error.duplicate_kind).toBe('submission_id');
    expect(json.case_id).toBe('case-original-1');
    expect(json.status).toBe('case_created');
    expect(inserted.cases).toHaveLength(0); // no double-created cases, ever
  });

  it('fresh submission_id → claim inserted, case created, 202', async () => {
    demoMode = false;
    const inserted = stubDb({ claimConflict: false });
    const { POST } = await import('@/app/api/intake/voice/route');
    const res = await POST(postJson(validBody()));
    expect(res.status).toBe(202);
    const json = await res.json();
    expect(json.case_id).toBe('case-new-1');
    expect(inserted.intake_submissions).toHaveLength(1);
    expect(inserted.cases).toHaveLength(1);
  });
});
