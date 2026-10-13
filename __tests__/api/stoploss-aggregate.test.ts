import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LEDGER_END, LEDGER_START } from '@/lib/vhg/time-range';

describe('stop-loss aggregate route', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('stays hidden when the demo flag is off', async () => {
    vi.stubEnv('ENABLE_VHG_SCORE_DEMO', '');
    const { GET } = await import('@/app/api/stoploss/aggregate/route');
    const response = await GET(new NextRequest(`http://localhost/api/stoploss/aggregate?grain=year&from=${LEDGER_START}&to=${LEDGER_END}`));
    expect(response.status).toBe(404);
  });

  it('returns year buckets for the public synthetic ledger', async () => {
    vi.stubEnv('ENABLE_VHG_SCORE_DEMO', 'true');
    const { GET } = await import('@/app/api/stoploss/aggregate/route');
    const response = await GET(new NextRequest(`http://localhost/api/stoploss/aggregate?grain=month&from=2026-09-01&to=2026-09-30`));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.demo_label).toBe('Demo, synthetic data');
    expect(body.grain).toBe('month');
    expect(body.totals.cases_reviewed).toBeGreaterThan(0);
    expect(body.buckets[0].key).toBe('2026-09');
  });

  it('rejects a reversed range', async () => {
    vi.stubEnv('ENABLE_VHG_SCORE_DEMO', 'true');
    const { GET } = await import('@/app/api/stoploss/aggregate/route');
    const response = await GET(new NextRequest('http://localhost/api/stoploss/aggregate?grain=day&from=2026-09-30&to=2026-09-01'));
    expect(response.status).toBe(400);
  });
});
