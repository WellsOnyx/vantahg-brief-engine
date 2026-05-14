import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

/**
 * Tests for sendKickoffInvite — the helper that emails an .ics calendar
 * invite when a TPA finishes onboarding with a weekly check-in
 * preference.
 *
 * Covers each early-exit branch (no kickoff data, no recipient, already
 * sent), the demo-mode short-circuit, and the happy path including
 * attachment shape + signup_requests update.
 */

vi.mock('@/lib/audit', () => ({
  logAuditEvent: vi.fn().mockResolvedValue(undefined),
}));

type AnyFn = (...args: unknown[]) => unknown;
const supabaseStub = { from: vi.fn() as AnyFn };
const adapterStub = { send: vi.fn() as AnyFn };

vi.mock('@/lib/supabase', () => ({
  getServiceClient: () => supabaseStub,
  hasSupabaseConfig: () => true,
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
}

function mockSignupSelect(row: unknown) {
  const updateMock = vi.fn(async () => ({ data: null, error: null }));
  supabaseStub.from = vi.fn(((table: string) => {
    if (table === 'signup_requests') {
      return {
        select: () => ({
          eq: () => ({ single: async () => ({ data: row, error: null }) }),
        }),
        update: () => ({ eq: updateMock }),
      };
    }
    return {};
  }) as AnyFn);
  return { updateMock };
}

const baseKickoff = {
  weekly_checkin_day: 'wed' as const,
  weekly_checkin_time: '10:00',
};

describe('sendKickoffInvite', () => {
  beforeEach(() => {
    vi.resetModules();
    adapterStub.send = vi.fn();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('short-circuits in demo mode without DB or adapter calls', async () => {
    clearSupabaseEnv();
    const { sendKickoffInvite } = await import('@/lib/notifications/kickoff-invite');
    const result = await sendKickoffInvite('signup-1', { actor: 'tpa@example.com' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.messageId).toMatch(/^demo-kickoff-/);
    }
    expect(adapterStub.send).not.toHaveBeenCalled();
  });

  it('returns signup_not_found when the row does not exist', async () => {
    setRealEnv();
    supabaseStub.from = vi.fn(((table: string) => {
      if (table === 'signup_requests') {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({ data: null, error: { message: 'no rows' } }),
            }),
          }),
        };
      }
      return {};
    }) as AnyFn);
    const { sendKickoffInvite } = await import('@/lib/notifications/kickoff-invite');
    const result = await sendKickoffInvite('signup-missing', { actor: 'x@y.com' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('signup_not_found');
  });

  it('skips with no_kickoff when the kickoff step has no day/time', async () => {
    setRealEnv();
    mockSignupSelect({
      id: 'signup-1',
      legal_name: 'Acme',
      primary_contact_name: 'Jane',
      primary_contact_email: 'jane@acme.example',
      onboarding_data: { kickoff: {} },
    });
    const { sendKickoffInvite } = await import('@/lib/notifications/kickoff-invite');
    const result = await sendKickoffInvite('signup-1', { actor: 'x@y.com' });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.skipped).toBe('no_kickoff');
    expect(adapterStub.send).not.toHaveBeenCalled();
  });

  it('skips with no_recipient when primary_contact_email is missing', async () => {
    setRealEnv();
    mockSignupSelect({
      id: 'signup-1',
      legal_name: 'Acme',
      primary_contact_name: 'Jane',
      primary_contact_email: null,
      onboarding_data: { kickoff: baseKickoff },
    });
    const { sendKickoffInvite } = await import('@/lib/notifications/kickoff-invite');
    const result = await sendKickoffInvite('signup-1', { actor: 'x@y.com' });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.skipped).toBe('no_recipient');
  });

  it('returns already_sent when kickoff.invite_sent_at is set', async () => {
    setRealEnv();
    mockSignupSelect({
      id: 'signup-1',
      legal_name: 'Acme',
      primary_contact_name: 'Jane',
      primary_contact_email: 'jane@acme.example',
      onboarding_data: {
        kickoff: { ...baseKickoff, invite_sent_at: '2026-05-10T00:00:00Z' },
      },
    });
    const { sendKickoffInvite } = await import('@/lib/notifications/kickoff-invite');
    const result = await sendKickoffInvite('signup-1', { actor: 'x@y.com' });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.already_sent).toBe(true);
    expect(adapterStub.send).not.toHaveBeenCalled();
  });

  it('happy path — adapter receives a .ics attachment and signup is updated with invite_sent_at', async () => {
    setRealEnv();
    const { updateMock } = mockSignupSelect({
      id: 'signup-1',
      legal_name: 'Acme TPA',
      primary_contact_name: 'Jane TPA',
      primary_contact_email: 'jane@acme.example',
      onboarding_data: { kickoff: baseKickoff },
    });

    adapterStub.send = vi.fn(async () => ({ ok: true, messageId: '<smtp-id-1>' }));

    const { sendKickoffInvite } = await import('@/lib/notifications/kickoff-invite');
    const result = await sendKickoffInvite('signup-1', { actor: 'jane@acme.example' });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.messageId).toBe('<smtp-id-1>');
      expect(result.recipient_email).toBe('jane@acme.example');
    }
    expect(adapterStub.send).toHaveBeenCalledTimes(1);
    const sendArgs = (adapterStub.send as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(sendArgs.to).toBe('jane@acme.example');
    expect(sendArgs.attachments).toHaveLength(1);
    expect(sendArgs.attachments[0].filename).toBe('kickoff.ics');
    expect(sendArgs.attachments[0].contentType).toMatch(/text\/calendar/);
    const icsString = sendArgs.attachments[0].content.toString('utf-8');
    expect(icsString).toContain('BEGIN:VCALENDAR');
    expect(icsString).toContain('RRULE:FREQ=WEEKLY;BYDAY=WE');
    // The update writes the new invite_sent_at on the kickoff object
    expect(updateMock).toHaveBeenCalled();
  });

  it('returns send_failed when the adapter errors', async () => {
    setRealEnv();
    mockSignupSelect({
      id: 'signup-1',
      legal_name: 'Acme TPA',
      primary_contact_name: 'Jane',
      primary_contact_email: 'jane@acme.example',
      onboarding_data: { kickoff: baseKickoff },
    });
    adapterStub.send = vi.fn(async () => ({ ok: false, code: 'transient', message: 'smtp down' }));

    const { sendKickoffInvite } = await import('@/lib/notifications/kickoff-invite');
    const result = await sendKickoffInvite('signup-1', { actor: 'x@y.com' });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('send_failed');
      expect(result.message).toContain('smtp down');
    }
  });
});
