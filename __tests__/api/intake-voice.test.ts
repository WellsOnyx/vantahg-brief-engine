import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

/**
 * Tests for app/api/intake/voice/route.ts — the Gravity Rail voice webhook.
 *
 * Covers the normalization seam (structured field_values preferred over
 * transcript text extraction), the HMAC gate, the low-confidence
 * manual-review return, and the demo-mode response shape. The real
 * parseEmailPayload runs against the transcript (it's pure).
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

vi.mock('@/lib/supabase', () => ({
  getServiceClient: vi.fn(),
}));

vi.mock('@/lib/intake/efax/storage', () => ({
  computeSubmissionFingerprint: vi.fn().mockReturnValue('fp'),
  findDuplicateCase: vi.fn().mockResolvedValue(null),
}));

function post(body: unknown, headers: Record<string, string> = {}) {
  return new Request('https://app.vantaum.com/api/intake/voice', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  }) as never;
}

beforeEach(() => {
  demoMode = true;
  vi.resetModules();
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe('POST /api/intake/voice', () => {
  it('returns 400 on invalid JSON', async () => {
    const { POST } = await import('@/app/api/intake/voice/route');
    const req = new Request('https://app.vantaum.com/api/intake/voice', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: 'not json{',
    }) as never;
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('rejects an invalid HMAC signature with 401', async () => {
    vi.stubEnv('GRAVITY_RAIL_WEBHOOK_SECRET', 'shhh');
    const { POST } = await import('@/app/api/intake/voice/route');
    const res = await POST(post({ chat_id: 1, transcript: 'hi' }, { 'x-gr-signature': 'wrong' }));
    expect(res.status).toBe(401);
  });

  it('demo: auto-creates from structured field_values (source=field_values)', async () => {
    const { POST } = await import('@/app/api/intake/voice/route');
    const res = await POST(
      post({
        chat_id: 42,
        channel: 'phone-voice',
        from_number: '+14155551234',
        transcript: 'caller asked about a knee scope',
        field_values: {
          patient_name: 'Maria Santos',
          patient_dob: '03/14/1975',
          member_id: 'XYZ987654',
          procedure_codes: ['27447'],
          provider_name: 'Dr. Alan Grant',
        },
      }),
    );
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.extraction_source).toBe('field_values');
    expect(json.needs_manual_review).toBe(false);
    expect(json.status).toBe('case_created');
    expect(json.case_id).toBeTruthy();
  });

  it('demo: field_values without a procedure code → queued_for_review', async () => {
    const { POST } = await import('@/app/api/intake/voice/route');
    const res = await POST(
      post({
        chat_id: 43,
        field_values: { patient_name: 'No Codes', member_id: 'M1' },
      }),
    );
    const json = await res.json();
    expect(json.needs_manual_review).toBe(true);
    expect(json.status).toBe('queued_for_review');
    expect(json.case_id).toBeNull();
  });

  it('demo: falls back to transcript extraction when no field_values (source=transcript)', async () => {
    const { POST } = await import('@/app/api/intake/voice/route');
    const transcript = [
      { role: 'assistant', content: 'What is the patient name and procedure?' },
      { role: 'user', content: 'Patient: John Smith, Member ID: ABC123456, Procedure 27447' },
    ];
    const res = await POST(post({ chat_id: 44, channel: 'phone-voice', transcript }));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.extraction_source).toBe('transcript');
    // John Smith + 27447 extracted from the transcript by the shared parser.
    expect(json.case_id).toBeTruthy();
    expect(json.status).toBe('case_created');
  });
});
