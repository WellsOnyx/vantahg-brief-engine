import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

/**
 * Tests for lib/notifications/determination-delivery.ts.
 *
 * Demo-mode is exercised directly. Real-mode covers each precondition
 * branch (case_not_found, no_determination, no_recipient, already
 * delivered) via inline supabase + adapter mocks. The success path
 * including PDF render is covered by a stubbed generateDeterminationPdf
 * that returns a small buffer.
 */

// ── Static mocks (applied before module import) ───────────────────────────

vi.mock('@/lib/audit', () => ({
  logAuditEvent: vi.fn().mockResolvedValue(undefined),
  logSecurityEvent: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/pdf-generator', () => ({
  generateDeterminationPdf: vi.fn().mockResolvedValue(Buffer.from('%PDF stub')),
}));

// Mutable supabase + adapter holders so each test can swap behavior.
type AnyFn = (...args: unknown[]) => unknown;
const supabaseStub = {
  from: vi.fn() as AnyFn,
};
const adapterStub = {
  send: vi.fn() as AnyFn,
};

vi.mock('@/lib/supabase', () => ({
  getServiceClient: () => supabaseStub,
  hasSupabaseConfig: () => true,
  supabase: {},
}));

vi.mock('@/lib/adapters/email', () => ({
  getEmailAdapter: () => adapterStub,
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
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'anon');
}

// Helper to make the supabase.from(...) chain return what each test needs.
function mockCasesSelect(row: unknown, error: unknown = null) {
  supabaseStub.from = vi.fn(((table: string) => {
    if (table === 'cases') {
      return {
        select: () => ({
          eq: () => ({
            single: async () => ({ data: row, error }),
          }),
        }),
        update: () => ({ eq: async () => ({ data: null, error: null }) }),
      };
    }
    return {};
  }) as AnyFn);
}

// ── Demo mode ─────────────────────────────────────────────────────────────

describe('deliverDeterminationLetter — demo mode', () => {
  beforeEach(() => {
    vi.resetModules();
    clearSupabaseEnv();
    adapterStub.send = vi.fn();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('short-circuits without calling supabase or the email adapter', async () => {
    const { deliverDeterminationLetter } = await import(
      '@/lib/notifications/determination-delivery'
    );
    const result = await deliverDeterminationLetter('case-abc', {
      actor: 'csr@vantaum.com',
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.messageId).toMatch(/^demo-/);
      expect(result.recipient_email).toBe('demo-tpa@example.com');
    }
    expect(adapterStub.send).not.toHaveBeenCalled();
  });

  it('honors recipientOverride in demo mode', async () => {
    const { deliverDeterminationLetter } = await import(
      '@/lib/notifications/determination-delivery'
    );
    const result = await deliverDeterminationLetter('case-abc', {
      actor: 'csr@vantaum.com',
      recipientOverride: 'override@tpa.example.com',
    });
    if (!result.ok) throw new Error('expected ok');
    expect(result.recipient_email).toBe('override@tpa.example.com');
  });
});

// ── Real mode branches ────────────────────────────────────────────────────

describe('deliverDeterminationLetter — preconditions', () => {
  beforeEach(() => {
    vi.resetModules();
    setRealEnv();
    adapterStub.send = vi.fn();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns case_not_found when supabase returns null row', async () => {
    mockCasesSelect(null, { message: 'not found' });
    const { deliverDeterminationLetter } = await import(
      '@/lib/notifications/determination-delivery'
    );
    const result = await deliverDeterminationLetter('missing', { actor: 'a@b.com' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('case_not_found');
  });

  it('returns no_determination when determination is null', async () => {
    mockCasesSelect({
      id: 'case-1',
      case_number: 'UM-1',
      determination: null,
      status: 'in_review',
      client: { name: 'Acme TPA', contact_email: 'tpa@acme.example' },
    });
    const { deliverDeterminationLetter } = await import(
      '@/lib/notifications/determination-delivery'
    );
    const result = await deliverDeterminationLetter('case-1', { actor: 'a@b.com' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('no_determination');
  });

  it('returns no_recipient when no contact_email and no override', async () => {
    mockCasesSelect({
      id: 'case-1',
      case_number: 'UM-1',
      determination: 'approve',
      status: 'determination_made',
      client: { name: 'Acme TPA', contact_email: null },
    });
    const { deliverDeterminationLetter } = await import(
      '@/lib/notifications/determination-delivery'
    );
    const result = await deliverDeterminationLetter('case-1', { actor: 'a@b.com' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('no_recipient');
  });

  it('is idempotent — returns already_delivered when status is already delivered', async () => {
    mockCasesSelect({
      id: 'case-1',
      case_number: 'UM-1',
      determination: 'approve',
      status: 'delivered',
      client: { name: 'Acme TPA', contact_email: 'tpa@acme.example' },
    });
    const { deliverDeterminationLetter } = await import(
      '@/lib/notifications/determination-delivery'
    );
    const result = await deliverDeterminationLetter('case-1', { actor: 'a@b.com' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.already_delivered).toBe(true);
      expect(result.recipient_email).toBe('tpa@acme.example');
    }
    expect(adapterStub.send).not.toHaveBeenCalled();
  });

  it('happy path — adapter receives a PDF attachment and the case moves to delivered', async () => {
    const updateMock = vi.fn(async () => ({ data: null, error: null }));
    supabaseStub.from = vi.fn(((table: string) => {
      if (table === 'cases') {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({
                data: {
                  id: 'case-1',
                  case_number: 'UM-1',
                  determination: 'approve',
                  status: 'determination_made',
                  patient_name: 'Jane Doe',
                  client: { name: 'Acme TPA', contact_email: 'tpa@acme.example' },
                },
                error: null,
              }),
            }),
          }),
          update: () => ({ eq: updateMock }),
        };
      }
      return {};
    }) as AnyFn);

    adapterStub.send = vi.fn(async () => ({ ok: true, messageId: '<smtp-1>' }));

    const { deliverDeterminationLetter } = await import(
      '@/lib/notifications/determination-delivery'
    );
    const result = await deliverDeterminationLetter('case-1', { actor: 'csr@vantaum.com' });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.messageId).toBe('<smtp-1>');
      expect(result.recipient_email).toBe('tpa@acme.example');
    }
    expect(adapterStub.send).toHaveBeenCalledTimes(1);
    const sendArgs = (adapterStub.send as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(sendArgs.to).toBe('tpa@acme.example');
    expect(sendArgs.attachments).toHaveLength(1);
    expect(sendArgs.attachments[0].filename).toBe('determination-UM-1.pdf');
    expect(sendArgs.attachments[0].contentType).toBe('application/pdf');
    expect(updateMock).toHaveBeenCalled();
  });
});
