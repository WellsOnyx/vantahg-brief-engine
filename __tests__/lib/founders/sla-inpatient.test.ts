import { describe, it, expect } from 'vitest';
import {
  checkInpatientNotificationWindow,
  computeInpatientReviewDeadlines,
  nextContinuedStayCycle,
  isContinuedStayClinicalsOverdue,
  FOUNDERS_SLA_HOURS,
} from '@/lib/founders/sla-inpatient';

const HOUR = 60 * 60 * 1000;

describe('checkInpatientNotificationWindow', () => {
  it('passes when notified within 48h of admit', () => {
    const admit = new Date('2026-05-01T08:00:00Z');
    const notify = new Date(admit.getTime() + 30 * HOUR);
    const result = checkInpatientNotificationWindow(admit, notify);
    expect(result.within_window).toBe(true);
    expect(result.hours_late).toBeCloseTo(30, 5);
  });

  it('flags when notification is later than 48h', () => {
    const admit = new Date('2026-05-01T08:00:00Z');
    const notify = new Date(admit.getTime() + 60 * HOUR);
    const result = checkInpatientNotificationWindow(admit, notify);
    expect(result.within_window).toBe(false);
    expect(result.hours_late).toBeCloseTo(60, 5);
  });

  it('exposes the notification deadline at admit + 48h', () => {
    const admit = new Date('2026-05-01T00:00:00Z');
    const notify = admit;
    const result = checkInpatientNotificationWindow(admit, notify);
    expect(result.notification_deadline.getTime()).toBe(admit.getTime() + 48 * HOUR);
  });
});

describe('computeInpatientReviewDeadlines', () => {
  it('targets 24h and ceilings at 15 days', () => {
    const opened = new Date('2026-05-01T00:00:00Z');
    const { target_deadline, ceiling_deadline } = computeInpatientReviewDeadlines(opened);
    expect(target_deadline.getTime() - opened.getTime()).toBe(24 * HOUR);
    expect(ceiling_deadline.getTime() - opened.getTime()).toBe(15 * 24 * HOUR);
  });
});

describe('continued stay clinicals', () => {
  it('flags overdue when last clinicals were more than 3 days ago', () => {
    const now = new Date('2026-05-10T12:00:00Z');
    const stale = new Date(now.getTime() - 4 * 24 * HOUR);
    const fresh = new Date(now.getTime() - 1 * 24 * HOUR);
    expect(isContinuedStayClinicalsOverdue(stale, now)).toBe(true);
    expect(isContinuedStayClinicalsOverdue(fresh, now)).toBe(false);
  });

  it('builds the next cycle with correct windows', () => {
    const received = new Date('2026-05-01T00:00:00Z');
    const cycle = nextContinuedStayCycle(received, 2);
    expect(cycle.cycle).toBe(2);
    expect(cycle.next_clinicals_due_at.getTime() - received.getTime()).toBe(3 * 24 * HOUR);
    expect(cycle.review_target_at.getTime() - received.getTime()).toBe(24 * HOUR);
    expect(cycle.review_ceiling_at.getTime() - received.getTime()).toBe(48 * HOUR);
  });
});

describe('FOUNDERS_SLA_HOURS', () => {
  it("matches Santana's 2026-05-07 ops call values", () => {
    expect(FOUNDERS_SLA_HOURS.outpatient_standard).toBe(360);
    expect(FOUNDERS_SLA_HOURS.outpatient_expedited).toBe(72);
    expect(FOUNDERS_SLA_HOURS.inpatient_target).toBe(24);
    expect(FOUNDERS_SLA_HOURS.inpatient_notify_window).toBe(48);
    expect(FOUNDERS_SLA_HOURS.continued_stay_clinicals).toBe(72);
  });
});
