import { describe, expect, it } from 'vitest';
import { aggregateStoploss } from '@/lib/vhg/aggregate';
import { ENTITLED_CLIENT_ID, UNENTITLED_CLIENT_ID } from '@/lib/vhg/catalog';
import { LIVE_EPOCH_MS, LIVE_INTERVAL_MS, getLedgerCase, getLedgerCases } from '@/lib/vhg/ledger';
import { addDays, daysInclusive, drillTarget, LEDGER_END, LEDGER_START, quickRange } from '@/lib/vhg/time-range';

const CANARIES = ['Zebediah Quillstone', 'MBR-CANARY-88421', 'CLM-CANARY-7731', '1999999999'];

describe('stop-loss time aggregate', () => {
  it('covers about 24 months with at least one case every day', () => {
    const rows = getLedgerCases();
    const dates = new Set(rows.map((row) => row.service_date));
    expect(daysInclusive(LEDGER_START, LEDGER_END)).toBeGreaterThanOrEqual(700);
    expect(daysInclusive(LEDGER_START, LEDGER_END)).toBeLessThanOrEqual(760);
    for (let date = LEDGER_START; date <= LEDGER_END; date = addDays(date, 1)) {
      expect(dates.has(date)).toBe(true);
    }
    expect(getLedgerCase('vhg-mr-0101')?.service_date).toBe('2026-08-14');
    const blob = JSON.stringify(rows);
    for (const token of CANARIES) expect(blob).not.toContain(token);
  });

  it('drills year to quarter to month to day and narrows the totals', () => {
    const years = aggregateStoploss({
      grain: 'year',
      from: LEDGER_START,
      to: LEDGER_END,
      now: LIVE_EPOCH_MS,
    });
    expect(years.ok).toBe(true);
    if (!years.ok) return;
    expect(years.buckets.map((bucket) => bucket.key)).toEqual(['2024', '2025', '2026']);
    const year = years.buckets.find((bucket) => bucket.key === '2026');
    expect(year).toBeTruthy();
    const drilledYear = drillTarget('year', year!);
    expect(drilledYear.grain).toBe('quarter');

    const quarters = aggregateStoploss({ ...drilledYear, now: LIVE_EPOCH_MS });
    expect(quarters.ok).toBe(true);
    if (!quarters.ok) return;
    expect(quarters.buckets.map((bucket) => bucket.key)).toEqual(['2026-Q1', '2026-Q2', '2026-Q3', '2026-Q4']);
    expect(quarters.totals.cases_reviewed).toBeLessThan(years.totals.cases_reviewed);

    const q3 = quarters.buckets.find((bucket) => bucket.key === '2026-Q3')!;
    const months = aggregateStoploss({ ...drillTarget('quarter', q3), now: LIVE_EPOCH_MS });
    expect(months.ok).toBe(true);
    if (!months.ok) return;
    expect(months.buckets.map((bucket) => bucket.key)).toEqual(['2026-07', '2026-08', '2026-09']);

    const september = months.buckets.find((bucket) => bucket.key === '2026-09')!;
    const days = aggregateStoploss({ ...drillTarget('month', september), now: LIVE_EPOCH_MS });
    expect(days.ok).toBe(true);
    if (!days.ok) return;
    expect(days.grain).toBe('day');
    expect(days.buckets.length).toBe(30);
    expect(days.buckets[0].key).toBe('2026-09-01');
    expect(days.totals.cases_reviewed).toBeLessThan(months.totals.cases_reviewed);
    expect(days.totals.avg_likely_idr_contested_score).toBeGreaterThan(0);
    expect(days.totals.avg_likely_idr_contested_score).toBeLessThanOrEqual(100);
    expect(days.totals.stop_sign_flags).toBeLessThanOrEqual(days.totals.high_vhg_risk_count);
    expect(days.by_service_line.length).toBeGreaterThan(0);
    expect(days.by_state.length).toBeGreaterThan(0);
  });

  it('recomputes quick ranges and ticks when a live case arrives', () => {
    const today = quickRange('today');
    const ytd = quickRange('ytd');
    const last30 = quickRange('30');
    const last90 = quickRange('90');
    expect(today).toEqual({ from: LEDGER_END, to: LEDGER_END, grain: 'day' });
    expect(ytd.from).toBe('2026-01-01');
    expect(last30.grain).toBe('day');
    expect(last90.grain).toBe('month');

    const before = aggregateStoploss({ grain: 'day', from: LEDGER_END, to: LEDGER_END, now: LIVE_EPOCH_MS });
    const after = aggregateStoploss({
      grain: 'day',
      from: LEDGER_END,
      to: LEDGER_END,
      now: LIVE_EPOCH_MS + LIVE_INTERVAL_MS,
    });
    expect(before.ok && after.ok).toBe(true);
    if (!before.ok || !after.ok) return;
    expect(after.live_count).toBe(before.live_count + 1);
    expect(after.totals.cases_reviewed).toBe(before.totals.cases_reviewed + 1);
    expect(ytd.to).toBe(LEDGER_END);
  });

  it('withholds rows for a client without Vanta med review', () => {
    const denied = aggregateStoploss({
      clientId: UNENTITLED_CLIENT_ID,
      grain: 'year',
      from: LEDGER_START,
      to: LEDGER_END,
      now: LIVE_EPOCH_MS,
    });
    expect(denied.ok).toBe(false);
    if (denied.ok) return;
    expect(denied.code).toBe('not_entitled');
    expect(denied.demo_label).toBe('Demo, synthetic data');
    expect(JSON.stringify(denied)).not.toContain('vhg-day-');
    expect(ENTITLED_CLIENT_ID).not.toBe(UNENTITLED_CLIENT_ID);
  });
});
