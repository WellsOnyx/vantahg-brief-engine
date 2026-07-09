import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * Tests for lib/cx-metrics.ts — member-experience metrics computed from the
 * real audit trail. Covers the event mapping (member touches vs first-touch
 * actions), the averaging math, the never-invent rules (null on zero
 * events, demo short-circuit), and the clock-skew guard.
 */

let demoMode = false;
vi.mock('@/lib/demo-mode', () => ({
  isDemoMode: () => demoMode,
}));

type AnyFn = (...args: unknown[]) => unknown;
const db: { auditRows: unknown[]; caseRows: unknown[] } = { auditRows: [], caseRows: [] };

vi.mock('@/lib/supabase', () => ({
  getServiceClient: () => ({
    from: ((table: string) => ({
      select: () => ({
        gte: () => ({
          order: () => ({
            limit: async () => ({
              data: table === 'audit_log' ? db.auditRows : db.caseRows,
              error: null,
            }),
          }),
        }),
      }),
    })) as AnyFn,
  }),
}));

const T0 = new Date('2026-07-09T08:00:00.000Z');
const iso = (minutesAfterT0: number) => new Date(T0.getTime() + minutesAfterT0 * 60_000).toISOString();

beforeEach(() => {
  demoMode = false;
  db.auditRows = [];
  db.caseRows = [];
});

describe('computeCxPulse', () => {
  it('returns nulls (never zeros) when no events exist', async () => {
    const { computeCxPulse } = await import('@/lib/cx-metrics');
    const pulse = await computeCxPulse(T0);
    expect(pulse.first_touch_minutes_avg).toBeNull();
    expect(pulse.callbacks_completed_today).toBeNull();
    expect(pulse.members_updated_today).toBeNull();
    expect(pulse.calibration).toBe('estimated_pending_calibration');
  });

  it('short-circuits to nulls in demo mode without touching the DB', async () => {
    demoMode = true;
    db.auditRows = [{ case_id: 'c1', action: 'intake_confirmation_sent', created_at: iso(1) }];
    const { computeCxPulse } = await import('@/lib/cx-metrics');
    const pulse = await computeCxPulse(T0);
    expect(pulse.callbacks_completed_today).toBeNull();
    expect(pulse.basis.audit_rows_scanned).toBe(0);
  });

  it('counts member touches and distinct member cases', async () => {
    db.auditRows = [
      { case_id: 'c1', action: 'intake_confirmation_sent', created_at: iso(5) },
      { case_id: 'c1', action: 'determination_letter_delivered', created_at: iso(90) },
      { case_id: 'c2', action: 'notification_sent', created_at: iso(30) },
      { case_id: 'c3', action: 'brief_generated', created_at: iso(10) }, // not member-facing
    ];
    const { computeCxPulse } = await import('@/lib/cx-metrics');
    const pulse = await computeCxPulse(T0);
    expect(pulse.callbacks_completed_today).toBe(3);
    expect(pulse.members_updated_today).toBe(2); // c1 + c2
    expect(pulse.basis.member_touch_events).toBe(3);
  });

  it('averages first-touch minutes from intake receipt to the earliest qualifying event', async () => {
    db.caseRows = [
      { id: 'c1', created_at: iso(0), intake_received_at: iso(0) },
      { id: 'c2', created_at: iso(0), intake_received_at: iso(0) },
    ];
    db.auditRows = [
      // c1: first qualifying touch at +10m (the +20m row must not override)
      { case_id: 'c1', action: 'concierge_intake_notified', created_at: iso(10) },
      { case_id: 'c1', action: 'status_changed', created_at: iso(20) },
      // c2: first touch at +30m
      { case_id: 'c2', action: 'intake_confirmation_sent', created_at: iso(30) },
    ];
    const { computeCxPulse } = await import('@/lib/cx-metrics');
    const pulse = await computeCxPulse(T0);
    expect(pulse.first_touch_minutes_avg).toBe(20); // (10 + 30) / 2
    expect(pulse.basis.cases_with_first_touch).toBe(2);
  });

  it('ignores negative / >24h deltas (clock skew, backfills) and cases with no touch', async () => {
    db.caseRows = [
      { id: 'c1', created_at: iso(0), intake_received_at: iso(0) },
      { id: 'c2', created_at: iso(0), intake_received_at: iso(0) }, // touch before intake (skew)
      { id: 'c3', created_at: iso(0), intake_received_at: iso(0) }, // no touch at all
    ];
    db.auditRows = [
      { case_id: 'c1', action: 'reviewer_assigned', created_at: iso(12) },
      { case_id: 'c2', action: 'reviewer_assigned', created_at: iso(-15) },
    ];
    const { computeCxPulse } = await import('@/lib/cx-metrics');
    const pulse = await computeCxPulse(T0);
    expect(pulse.first_touch_minutes_avg).toBe(12); // only c1 qualifies
    expect(pulse.basis.cases_with_first_touch).toBe(1);
  });

  it('falls back to created_at when intake_received_at is null', async () => {
    db.caseRows = [{ id: 'c1', created_at: iso(0), intake_received_at: null }];
    db.auditRows = [{ case_id: 'c1', action: 'status_changed', created_at: iso(8) }];
    const { computeCxPulse } = await import('@/lib/cx-metrics');
    const pulse = await computeCxPulse(T0);
    expect(pulse.first_touch_minutes_avg).toBe(8);
  });
});
