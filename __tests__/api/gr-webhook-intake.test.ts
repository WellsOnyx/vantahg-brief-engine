import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { signIntakeRequest } from '@/lib/intake/gr-contract';

/**
 * Non-demo Channel A tests: a verified GR handoff creates (or idempotently
 * returns) a real case via dispatchFinalization. Signature-gate coverage
 * lives in gr-webhook-auth.test.ts.
 */

let demoMode = false;
vi.mock('@/lib/demo-mode', () => ({
  isDemoMode: () => demoMode,
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

const dispatchFinalization = vi.fn().mockResolvedValue({ mode: 'skipped' });
vi.mock('@/lib/intake/brief-queue', () => ({
  dispatchFinalization: (...a: unknown[]) => dispatchFinalization(...a),
}));

type AnyFn = (...args: unknown[]) => unknown;
const serviceClientStub: { from: AnyFn } = { from: vi.fn() };
vi.mock('@/lib/supabase', () => ({
  getServiceClient: () => serviceClientStub,
}));

const BODY_OBJ = {
  event: 'chat.handoff',
  chat_id: 84213,
  workspace_id: 'ws_abc123',
  title: 'MRI lumbar prior auth',
  field_values: {
    patient_name: 'Maria Santos',
    patient_dob: '03/14/1975',
    member_id: 'XYZ987654',
    procedure_codes: ['72148'],
    provider_name: 'Dr. Alan Grant',
  },
};

function post(rawBody: string, headers: Record<string, string> = {}) {
  return new Request('https://app.vantaum.com/api/gr/webhook', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: rawBody,
  }) as never;
}

function stubDb(opts: { existingId?: string | null; insertId?: string; insertError?: { message: string } | null }) {
  const inserted: unknown[] = [];
  serviceClientStub.from = vi.fn(((table: string) => {
    if (table === 'cases') {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: opts.existingId ? { id: opts.existingId } : null,
              error: null,
            }),
          }),
        }),
        insert: (row: unknown) => {
          inserted.push(row);
          return {
            select: () => ({
              single: async () => {
                if (opts.insertError) return { data: null, error: opts.insertError };
                return { data: { id: opts.insertId ?? 'case-new-1' }, error: null };
              },
            }),
          };
        },
      };
    }
    if (table === 'staff') {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: { id: 'staff-concierge-1' }, error: null }),
            single: async () => ({ data: { id: 'staff-concierge-1' }, error: null }),
          }),
        }),
      };
    }
    return {};
  }) as AnyFn);
  return inserted;
}

beforeEach(() => {
  demoMode = false;
  vi.resetModules();
  dispatchFinalization.mockClear();
  dispatchFinalization.mockResolvedValue({ mode: 'skipped' });
  serviceClientStub.from = vi.fn();
  vi.stubEnv('GR_WEBHOOK_SECRET', 'handoff-secret');
  vi.stubEnv('NODE_ENV', 'test');
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe('POST /api/gr/webhook — case create + idempotency', () => {
  it('creates a case and dispatches finalization on a fresh chat_id', async () => {
    const inserted = stubDb({ existingId: null, insertId: 'case-new-1' });
    const { POST } = await import('@/app/api/gr/webhook/route');
    const raw = JSON.stringify(BODY_OBJ);
    const { timestamp, signature } = signIntakeRequest('handoff-secret', raw);
    const res = await POST(post(raw, { 'x-gr-timestamp': timestamp, 'x-gr-signature': signature }));
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json).toEqual({ success: true, case_id: 'case-new-1', idempotent: false });
    expect(inserted).toHaveLength(1);
    expect((inserted[0] as { case_number: string }).case_number).toBe('GR-84213');
    expect((inserted[0] as { patient_name: string }).patient_name).toBe('Maria Santos');
    expect(dispatchFinalization).toHaveBeenCalledWith(
      'case-new-1',
      expect.objectContaining({ channel: 'phone', actor: 'gravity_rail' }),
    );
  });

  it('returns the existing case on Idempotency-Key / chat_id re-delivery', async () => {
    const inserted = stubDb({ existingId: 'case-original-1' });
    const { POST } = await import('@/app/api/gr/webhook/route');
    const raw = JSON.stringify(BODY_OBJ);
    const { timestamp, signature } = signIntakeRequest('handoff-secret', raw);
    const res = await POST(
      post(raw, {
        'x-gr-timestamp': timestamp,
        'x-gr-signature': signature,
        'Idempotency-Key': '84213',
      }),
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ success: true, case_id: 'case-original-1', idempotent: true });
    expect(inserted).toHaveLength(0);
    expect(dispatchFinalization).not.toHaveBeenCalled();
  });

  it('Idempotency-Key wins over chat_id when both are present', async () => {
    const inserted = stubDb({ existingId: null, insertId: 'case-key-1' });
    const { POST } = await import('@/app/api/gr/webhook/route');
    const raw = JSON.stringify(BODY_OBJ);
    const { timestamp, signature } = signIntakeRequest('handoff-secret', raw);
    const res = await POST(
      post(raw, {
        'x-gr-timestamp': timestamp,
        'x-gr-signature': signature,
        'idempotency-key': 'explicit-key-99',
      }),
    );
    expect(res.status).toBe(201);
    expect((inserted[0] as { case_number: string }).case_number).toBe('GR-explicit-key-99');
    expect((await res.json()).case_id).toBe('case-key-1');
  });

  it('does not echo PHI in the success body', async () => {
    stubDb({ existingId: null, insertId: 'case-new-1' });
    const { POST } = await import('@/app/api/gr/webhook/route');
    const raw = JSON.stringify(BODY_OBJ);
    const { timestamp, signature } = signIntakeRequest('handoff-secret', raw);
    const res = await POST(post(raw, { 'x-gr-timestamp': timestamp, 'x-gr-signature': signature }));
    const text = JSON.stringify(await res.json());
    expect(text).not.toContain('Maria Santos');
    expect(text).not.toContain('XYZ987654');
  });
});
