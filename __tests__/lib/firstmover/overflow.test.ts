import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { isOverflowActive, setManualOverflow } from '@/lib/firstmover/overflow';

const originalEnv = { ...process.env };

beforeEach(() => {
  delete process.env.FIRSTMOVER_AGENT_OVERFLOW;
  delete process.env.FIRSTMOVER_BUSINESS_HOURS;
  delete process.env.FIRSTMOVER_BUSINESS_HOURS_TZ;
  setManualOverflow(null);
});

afterEach(() => {
  process.env = { ...originalEnv };
  setManualOverflow(null);
});

describe('isOverflowActive', () => {
  it('is off when env=off', () => {
    process.env.FIRSTMOVER_AGENT_OVERFLOW = 'off';
    const r = isOverflowActive();
    expect(r.active).toBe(false);
    expect(r.mode).toBe('off');
  });

  it('is always-on when env=always', () => {
    process.env.FIRSTMOVER_AGENT_OVERFLOW = 'always';
    expect(isOverflowActive().active).toBe(true);
  });

  it('default mode is manual; defaults to inactive', () => {
    const r = isOverflowActive();
    expect(r.mode).toBe('manual');
    expect(r.active).toBe(false);
  });

  it('manual toggle on activates overflow', () => {
    setManualOverflow(true);
    expect(isOverflowActive().active).toBe(true);
  });

  it('manual toggle off deactivates overflow', () => {
    setManualOverflow(true);
    setManualOverflow(false);
    expect(isOverflowActive().active).toBe(false);
  });

  it('after_hours mode: active outside business hours', () => {
    process.env.FIRSTMOVER_AGENT_OVERFLOW = 'after_hours';
    process.env.FIRSTMOVER_BUSINESS_HOURS_TZ = 'America/New_York';
    process.env.FIRSTMOVER_BUSINESS_HOURS = '9-17';
    // Tuesday, 2026-05-12 at 03:00 UTC = 23:00 ET Monday → outside 9-17
    const lateNight = new Date('2026-05-12T03:00:00Z');
    expect(isOverflowActive(lateNight).active).toBe(true);
  });

  it('after_hours mode: inactive during business hours', () => {
    process.env.FIRSTMOVER_AGENT_OVERFLOW = 'after_hours';
    process.env.FIRSTMOVER_BUSINESS_HOURS_TZ = 'America/New_York';
    process.env.FIRSTMOVER_BUSINESS_HOURS = '9-17';
    // Tuesday, 2026-05-12 at 18:00 UTC = 14:00 ET → inside 9-17
    const midDay = new Date('2026-05-12T18:00:00Z');
    expect(isOverflowActive(midDay).active).toBe(false);
  });

  it('after_hours mode: active on weekends', () => {
    process.env.FIRSTMOVER_AGENT_OVERFLOW = 'after_hours';
    // Saturday, 2026-05-09 at 18:00 UTC = 14:00 ET
    const saturday = new Date('2026-05-09T18:00:00Z');
    expect(isOverflowActive(saturday).active).toBe(true);
  });
});
