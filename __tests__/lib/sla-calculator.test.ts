import { describe, it, expect } from 'vitest';
import { calculateDeadline, getTimeRemaining, getDefaultSlaHours, formatTimeRemaining } from '@/lib/sla-calculator';

describe('calculateDeadline', () => {
  it('uses default SLA hours for standard prior_auth', () => {
    const created = new Date('2026-02-20T10:00:00Z');
    const deadline = calculateDeadline(created, 'prior_auth', 'standard');
    const expectedMs = created.getTime() + 120 * 60 * 60 * 1000;
    expect(deadline.getTime()).toBe(expectedMs);
  });

  it('uses 24hr for urgent prior_auth', () => {
    const created = new Date('2026-02-20T10:00:00Z');
    const deadline = calculateDeadline(created, 'prior_auth', 'urgent');
    const expectedMs = created.getTime() + 24 * 60 * 60 * 1000;
    expect(deadline.getTime()).toBe(expectedMs);
  });

  it('uses client SLA when provided', () => {
    const created = new Date('2026-02-20T10:00:00Z');
    const deadline = calculateDeadline(created, 'prior_auth', 'standard', 48);
    const expectedMs = created.getTime() + 48 * 60 * 60 * 1000;
    expect(deadline.getTime()).toBe(expectedMs);
  });

  it('falls back to 120 hours when review type is null', () => {
    const created = new Date('2026-02-20T10:00:00Z');
    const deadline = calculateDeadline(created, null, 'standard');
    const expectedMs = created.getTime() + 120 * 60 * 60 * 1000;
    expect(deadline.getTime()).toBe(expectedMs);
  });
});

describe('getTimeRemaining', () => {
  it('returns overdue for past deadline', () => {
    const pastDeadline = new Date(Date.now() - 60 * 60 * 1000);
    const result = getTimeRemaining(pastDeadline);
    expect(result.isOverdue).toBe(true);
    expect(result.urgencyLevel).toBe('overdue');
  });

  it('returns critical for <4hr remaining', () => {
    const deadline = new Date(Date.now() + 2 * 60 * 60 * 1000);
    const result = getTimeRemaining(deadline);
    expect(result.urgencyLevel).toBe('critical');
  });

  it('returns ok for >24hr remaining', () => {
    const deadline = new Date(Date.now() + 48 * 60 * 60 * 1000);
    const result = getTimeRemaining(deadline);
    expect(result.urgencyLevel).toBe('ok');
  });
});

describe('getDefaultSlaHours', () => {
  it('returns 120 for standard prior_auth', () => {
    expect(getDefaultSlaHours('prior_auth', 'standard')).toBe(120);
  });

  it('returns 24 for urgent prior_auth', () => {
    expect(getDefaultSlaHours('prior_auth', 'urgent')).toBe(24);
  });

  it('returns 120 for null review type', () => {
    expect(getDefaultSlaHours(null, 'standard')).toBe(120);
  });
});

describe('formatTimeRemaining', () => {
  it('formats overdue time', () => {
    const result = formatTimeRemaining({
      hours: 2,
      minutes: 30,
      totalMinutes: -150,
      isOverdue: true,
      isAtRisk: true,
      urgencyLevel: 'overdue',
    });
    expect(result).toContain('overdue');
  });

  it('formats remaining time', () => {
    const result = formatTimeRemaining({
      hours: 5,
      minutes: 15,
      totalMinutes: 315,
      isOverdue: false,
      isAtRisk: false,
      urgencyLevel: 'ok',
    });
    expect(result).toContain('remaining');
    expect(result).toContain('5h');
  });
});
