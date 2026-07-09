import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

/**
 * Tests for the brief-generation queue (throughput chassis, migration 034):
 * the dispatchFinalization seam (queue vs legacy-inline vs skipped),
 * idempotent enqueue, and runBriefJob's retry/dead-letter decision keyed on
 * the LlmError.retryable signal.
 */

let demoMode = false;
vi.mock('@/lib/demo-mode', () => ({ isDemoMode: () => demoMode }));
vi.mock('@/lib/audit', () => ({ logAuditEvent: vi.fn().mockResolvedValue(undefined) }));

const finalizeIntakeCase = vi.fn().mockResolvedValue({ finalized: true });
let channelAgnostic = false;
vi.mock('@/lib/intake/finalize-case', () => ({
  finalizeIntakeCase: (...a: unknown[]) => finalizeIntakeCase(...a),
  isChannelAgnosticIntakeEnabled: () => channelAgnostic,
}));

type AnyFn = (...args: unknown[]) => unknown;
const db = { insertError: null as { code?: string; message?: string } | null, inserts: [] as unknown[], updates: [] as unknown[] };
vi.mock('@/lib/supabase', () => ({
  getServiceClient: () => ({
    from: ((table: string) => ({
      insert: (row: unknown) => {
        if (table === 'brief_jobs') db.inserts.push(row);
        return { error: db.insertError };
      },
      update: (patch: unknown) => ({
        eq: async () => { db.updates.push(patch); return { error: null }; },
      }),
    })) as AnyFn,
  }),
}));

beforeEach(() => {
  demoMode = false;
  channelAgnostic = false;
  db.insertError = null;
  db.inserts = [];
  db.updates = [];
  finalizeIntakeCase.mockClear();
  finalizeIntakeCase.mockResolvedValue({ finalized: true });
  vi.resetModules();
});
afterEach(() => vi.unstubAllEnvs());

describe('dispatchFinalization seam', () => {
  it('legacy default (queue off, channel-agnostic off): skips — behavior unchanged', async () => {
    const { dispatchFinalization } = await import('@/lib/intake/brief-queue');
    const r = await dispatchFinalization('case-1', { channel: 'api' });
    expect(r.mode).toBe('skipped');
    expect(finalizeIntakeCase).not.toHaveBeenCalled();
  });

  it('legacy inline: queue off but channel-agnostic on → runs finalize inline (today behavior)', async () => {
    channelAgnostic = true;
    const { dispatchFinalization } = await import('@/lib/intake/brief-queue');
    const r = await dispatchFinalization('case-1', { channel: 'api' });
    expect(r.mode).toBe('inline');
    expect(finalizeIntakeCase).toHaveBeenCalledWith('case-1', expect.objectContaining({ channel: 'api' }));
  });

  it('queue on: enqueues a brief_job and does NOT run finalize inline', async () => {
    vi.stubEnv('ENABLE_BRIEF_QUEUE', 'true');
    const { dispatchFinalization } = await import('@/lib/intake/brief-queue');
    const r = await dispatchFinalization('case-1', { channel: 'phone' });
    expect(r.mode).toBe('queued');
    expect(db.inserts).toHaveLength(1);
    expect(finalizeIntakeCase).not.toHaveBeenCalled();
  });

  it('enqueue is idempotent: unique-violation is treated as already-queued success', async () => {
    vi.stubEnv('ENABLE_BRIEF_QUEUE', 'true');
    db.insertError = { code: '23505', message: 'duplicate key value violates unique constraint' };
    const { dispatchFinalization } = await import('@/lib/intake/brief-queue');
    const r = await dispatchFinalization('case-1', { channel: 'phone' });
    expect(r.mode).toBe('queued');
  });

  it('demo mode never enqueues', async () => {
    vi.stubEnv('ENABLE_BRIEF_QUEUE', 'true');
    demoMode = true;
    const { dispatchFinalization } = await import('@/lib/intake/brief-queue');
    const r = await dispatchFinalization('case-1', { channel: 'phone' });
    expect(r.mode).toBe('skipped');
    expect(db.inserts).toHaveLength(0);
  });
});

describe('runBriefJob retry/dead-letter', () => {
  const job = { id: 'job-1', case_id: 'case-1', channel: 'api', attempts: 1, max_attempts: 5 };

  it('success → done', async () => {
    const { runBriefJob } = await import('@/lib/intake/brief-queue');
    const outcome = await runBriefJob(job);
    expect(outcome).toBe('done');
    expect(db.updates[0]).toMatchObject({ status: 'done' });
  });

  it('retryable failure with attempts left → retry with backoff', async () => {
    finalizeIntakeCase.mockRejectedValueOnce(Object.assign(new Error('rate limited'), { retryable: true }));
    const { runBriefJob } = await import('@/lib/intake/brief-queue');
    const outcome = await runBriefJob(job);
    expect(outcome).toBe('retry');
    expect(db.updates[0]).toMatchObject({ status: 'pending' });
    expect(db.updates[0]).toHaveProperty('next_attempt_at');
  });

  it('non-retryable failure → dead_letter immediately', async () => {
    finalizeIntakeCase.mockRejectedValueOnce(Object.assign(new Error('bad data'), { retryable: false }));
    const { runBriefJob } = await import('@/lib/intake/brief-queue');
    const outcome = await runBriefJob(job);
    expect(outcome).toBe('dead_letter');
    expect(db.updates[0]).toMatchObject({ status: 'dead_letter' });
  });

  it('retryable but attempts exhausted → dead_letter', async () => {
    finalizeIntakeCase.mockRejectedValueOnce(Object.assign(new Error('rate limited'), { retryable: true }));
    const { runBriefJob } = await import('@/lib/intake/brief-queue');
    const outcome = await runBriefJob({ ...job, attempts: 5, max_attempts: 5 });
    expect(outcome).toBe('dead_letter');
  });
});
