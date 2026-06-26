import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * Tests for lib/notifications/concierge-intake.ts — resolving a case's
 * concierge (via the active client_concierge_assignments row) and notifying
 * them for follow-up. The helper must be best-effort: it audits + skips
 * gracefully when there's no client / no concierge, and never throws.
 */

let demoMode = false;
vi.mock('@/lib/demo-mode', () => ({
  isDemoMode: () => demoMode,
}));

const logAuditEvent = vi.fn().mockResolvedValue(undefined);
vi.mock('@/lib/audit', () => ({
  logAuditEvent: (...args: unknown[]) => logAuditEvent(...args),
}));

const sendNotification = vi.fn().mockResolvedValue(undefined);
vi.mock('@/lib/notifications', () => ({
  sendNotification: (...args: unknown[]) => sendNotification(...args),
}));

// Per-table response table, configured per test.
let responses: Record<string, { data: unknown; error: unknown }> = {};
function chain(table: string) {
  const terminal = () => Promise.resolve(responses[table] ?? { data: null, error: null });
  const c: Record<string, unknown> = {};
  c.select = () => c;
  c.eq = () => c;
  c.single = terminal;
  c.maybeSingle = terminal;
  return c;
}
vi.mock('@/lib/supabase', () => ({
  getServiceClient: () => ({ from: (t: string) => chain(t) }),
}));

beforeEach(() => {
  demoMode = false;
  responses = {};
  logAuditEvent.mockClear();
  sendNotification.mockClear();
});

describe('notifyConciergeNewIntake', () => {
  it('demo mode notifies without touching supabase', async () => {
    demoMode = true;
    const { notifyConciergeNewIntake } = await import('@/lib/notifications/concierge-intake');
    const res = await notifyConciergeNewIntake('case-1', { caseNumber: 'VUM-1', channel: 'email' });
    expect(res.notified).toBe(true);
    expect(sendNotification).not.toHaveBeenCalled();
  });

  it('notifies the resolved concierge for a client with an active assignment', async () => {
    responses = {
      cases: { data: { id: 'case-1', case_number: 'VUM-1', client_id: 'client-1' }, error: null },
      client_concierge_assignments: { data: { concierge_id: 'conc-1' }, error: null },
      concierges: { data: { id: 'conc-1', name: 'Dana CX', email: 'dana@vantaum.com' }, error: null },
    };
    const { notifyConciergeNewIntake } = await import('@/lib/notifications/concierge-intake');
    const res = await notifyConciergeNewIntake('case-1', { channel: 'efax' });

    expect(res.notified).toBe(true);
    expect(res.concierge_id).toBe('conc-1');
    expect(sendNotification).toHaveBeenCalledTimes(1);
    const payload = sendNotification.mock.calls[0][0] as { type: string; recipient_email: string };
    expect(payload.type).toBe('concierge_intake_assigned');
    expect(payload.recipient_email).toBe('dana@vantaum.com');
    expect(logAuditEvent).toHaveBeenCalledWith('case-1', 'concierge_intake_notified', 'system', expect.any(Object));
  });

  it('skips gracefully (audited) when the case has no client', async () => {
    responses = {
      cases: { data: { id: 'case-1', case_number: 'VUM-1', client_id: null }, error: null },
    };
    const { notifyConciergeNewIntake } = await import('@/lib/notifications/concierge-intake');
    const res = await notifyConciergeNewIntake('case-1', {});

    expect(res.notified).toBe(false);
    expect(res.reason).toBe('no_client');
    expect(sendNotification).not.toHaveBeenCalled();
    expect(logAuditEvent).toHaveBeenCalledWith('case-1', 'concierge_intake_unassigned', 'system', expect.objectContaining({ reason: 'no_client' }));
  });

  it('skips gracefully when the client has no active concierge assignment', async () => {
    responses = {
      cases: { data: { id: 'case-1', case_number: 'VUM-1', client_id: 'client-1' }, error: null },
      client_concierge_assignments: { data: null, error: null },
    };
    const { notifyConciergeNewIntake } = await import('@/lib/notifications/concierge-intake');
    const res = await notifyConciergeNewIntake('case-1', {});

    expect(res.notified).toBe(false);
    expect(res.reason).toBe('no_active_concierge');
    expect(sendNotification).not.toHaveBeenCalled();
  });

  it('returns case_not_found when the case row is missing', async () => {
    responses = { cases: { data: null, error: { message: 'nope' } } };
    const { notifyConciergeNewIntake } = await import('@/lib/notifications/concierge-intake');
    const res = await notifyConciergeNewIntake('missing', {});
    expect(res.notified).toBe(false);
    expect(res.reason).toBe('case_not_found');
  });
});
