import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

/**
 * Tests for lib/intake/finalize-case.ts — the channel-agnostic intake
 * finalizer that every channel calls after inserting its case row.
 *
 * The contract under test:
 *  - reads the flag correctly (default off)
 *  - happy path runs concierge → brief → pod → LPN notify
 *  - pod-unavailable falls back to physician auto-assign + notify
 *  - a brief-generation failure is swallowed (case not stranded, no throw)
 *  - a missing case short-circuits with no downstream calls
 */

// ── Module mocks ──────────────────────────────────────────────────────────

const mockSingle = vi.fn();
function makeSupabase() {
  return {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: mockSingle,
        }),
      }),
    }),
  };
}

vi.mock('@/lib/supabase', () => ({
  getServiceClient: vi.fn(() => makeSupabase()),
}));

vi.mock('@/lib/audit', () => ({
  logAuditEvent: vi.fn().mockResolvedValue(undefined),
}));

const generateBriefForCase = vi.fn();
const persistBriefResult = vi.fn().mockResolvedValue(undefined);
vi.mock('@/lib/generate-brief', () => ({
  generateBriefForCase: (...args: unknown[]) => generateBriefForCase(...args),
  persistBriefResult: (...args: unknown[]) => persistBriefResult(...args),
}));

const assignToPod = vi.fn();
vi.mock('@/lib/pod-assignment-engine', () => ({
  assignToPod: (...args: unknown[]) => assignToPod(...args),
}));

const autoAssignReviewer = vi.fn();
vi.mock('@/lib/assignment-engine', () => ({
  autoAssignReviewer: (...args: unknown[]) => autoAssignReviewer(...args),
}));

const notifyLpnCaseAssigned = vi.fn().mockResolvedValue(undefined);
const notifyCaseAssigned = vi.fn().mockResolvedValue(undefined);
vi.mock('@/lib/notifications', () => ({
  notifyLpnCaseAssigned: (...args: unknown[]) => notifyLpnCaseAssigned(...args),
  notifyCaseAssigned: (...args: unknown[]) => notifyCaseAssigned(...args),
}));

const notifyConciergeNewIntake = vi.fn();
vi.mock('@/lib/notifications/concierge-intake', () => ({
  notifyConciergeNewIntake: (...args: unknown[]) => notifyConciergeNewIntake(...args),
}));

const CASE_ROW = {
  id: 'case-1',
  case_number: 'VUM-2026-000001',
  client_id: 'client-1',
  client: { id: 'client-1', name: 'Acme TPA' },
};

function resetMocks() {
  mockSingle.mockReset();
  generateBriefForCase.mockReset();
  persistBriefResult.mockClear();
  assignToPod.mockReset();
  autoAssignReviewer.mockReset();
  notifyLpnCaseAssigned.mockClear();
  notifyCaseAssigned.mockClear();
  notifyConciergeNewIntake.mockReset();

  // Sensible happy-path defaults; individual tests override.
  mockSingle.mockResolvedValue({ data: CASE_ROW, error: null });
  notifyConciergeNewIntake.mockResolvedValue({ notified: true, concierge_id: 'c-1' });
  generateBriefForCase.mockResolvedValue({ brief: { x: 1 }, factCheck: { overall_score: 90 } });
  assignToPod.mockResolvedValue({ assigned: true, lpnId: 'lpn-1', podName: 'Pod A' });
  autoAssignReviewer.mockResolvedValue({ assigned: true, reviewerId: 'rev-1' });
}

// ── Flag gate ──────────────────────────────────────────────────────────────

describe('isChannelAgnosticIntakeEnabled', () => {
  beforeEach(() => {
    vi.resetModules();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('defaults to false when the flag is unset', async () => {
    vi.stubEnv('ENABLE_CHANNEL_AGNOSTIC_INTAKE', '');
    const { isChannelAgnosticIntakeEnabled } = await import('@/lib/intake/finalize-case');
    expect(isChannelAgnosticIntakeEnabled()).toBe(false);
  });

  it('is true only for the exact string "true"', async () => {
    vi.stubEnv('ENABLE_CHANNEL_AGNOSTIC_INTAKE', 'true');
    const mod = await import('@/lib/intake/finalize-case');
    expect(mod.isChannelAgnosticIntakeEnabled()).toBe(true);
  });

  it('is false for other truthy-looking values', async () => {
    vi.stubEnv('ENABLE_CHANNEL_AGNOSTIC_INTAKE', '1');
    const mod = await import('@/lib/intake/finalize-case');
    expect(mod.isChannelAgnosticIntakeEnabled()).toBe(false);
  });
});

// ── finalizeIntakeCase ───────────────────────────────────────────────────

describe('finalizeIntakeCase', () => {
  beforeEach(() => {
    resetMocks();
  });

  it('happy path: concierge + brief + pod + LPN notify', async () => {
    const { finalizeIntakeCase } = await import('@/lib/intake/finalize-case');
    const res = await finalizeIntakeCase('case-1', { channel: 'email' });

    expect(res).toMatchObject({
      finalized: true,
      concierge_notified: true,
      brief_generated: true,
      pod_assigned: true,
      reviewer_assigned: false,
    });
    expect(persistBriefResult).toHaveBeenCalledTimes(1);
    expect(notifyLpnCaseAssigned).toHaveBeenCalledWith('case-1', 'lpn-1', 'VUM-2026-000001', 'Pod A');
    expect(notifyCaseAssigned).not.toHaveBeenCalled();
  });

  it('falls back to physician auto-assign when no pod is available', async () => {
    assignToPod.mockResolvedValue({ assigned: false, reason: 'No active pod' });
    const { finalizeIntakeCase } = await import('@/lib/intake/finalize-case');
    const res = await finalizeIntakeCase('case-1', { channel: 'efax' });

    expect(res.pod_assigned).toBe(false);
    expect(res.reviewer_assigned).toBe(true);
    expect(notifyLpnCaseAssigned).not.toHaveBeenCalled();
    expect(notifyCaseAssigned).toHaveBeenCalledWith('case-1', 'rev-1');
  });

  it('swallows a brief-generation failure and still routes (case not stranded)', async () => {
    generateBriefForCase.mockRejectedValue(new Error('generateBriefForCase requires real Anthropic'));
    const { finalizeIntakeCase } = await import('@/lib/intake/finalize-case');
    const res = await finalizeIntakeCase('case-1', { channel: 'api' });

    expect(res.finalized).toBe(true);
    expect(res.brief_generated).toBe(false);
    expect(persistBriefResult).not.toHaveBeenCalled();
    // Routing still ran despite the brief failure.
    expect(res.pod_assigned).toBe(true);
  });

  it('short-circuits when the case is not found, with no downstream calls', async () => {
    mockSingle.mockResolvedValue({ data: null, error: { message: 'not found' } });
    const { finalizeIntakeCase } = await import('@/lib/intake/finalize-case');
    const res = await finalizeIntakeCase('missing', { channel: 'portal' });

    expect(res.finalized).toBe(false);
    expect(res.reason).toBe('case_not_found');
    expect(notifyConciergeNewIntake).not.toHaveBeenCalled();
    expect(generateBriefForCase).not.toHaveBeenCalled();
    expect(assignToPod).not.toHaveBeenCalled();
  });

  it('reports concierge_notified=false when the concierge resolution skips', async () => {
    notifyConciergeNewIntake.mockResolvedValue({ notified: false, concierge_id: null, reason: 'no_active_concierge' });
    const { finalizeIntakeCase } = await import('@/lib/intake/finalize-case');
    const res = await finalizeIntakeCase('case-1', { channel: 'email' });

    expect(res.concierge_notified).toBe(false);
    // The rest of the chassis still runs.
    expect(res.brief_generated).toBe(true);
    expect(res.pod_assigned).toBe(true);
  });
});
