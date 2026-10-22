import { describe, expect, it } from 'vitest';
import {
  november1BatchingRules,
  stubIdrGateway,
} from '@/lib/idr/determination';

describe('IDR stubs', () => {
  it('leaves November 1 batching eligibility undecided for every fact set', () => {
    const rules = november1BatchingRules();
    const one = rules.evaluate({ line_count: 1, service_labels: ['Synthetic service A'] });
    const many = rules.evaluate({ line_count: 5, service_labels: ['A', 'B', 'C', 'D', 'E'] });
    expect(rules.implemented).toBe(false);
    expect(rules.effective_on).toBe('2026-11-01');
    expect(one).toEqual(many);
    expect(one.eligible).toBeNull();
    expect(one.code).toBe('NOV_1_BATCHING_UNIMPLEMENTED');
  });

  it('does not call a live IDR Gateway', () => {
    const gateway = stubIdrGateway();
    const refusal = gateway.pullDispute('DISP-SYN-ALPHA');
    expect(gateway.vendor).toBeNull();
    expect(gateway.live_call).toBe(false);
    expect(gateway.implemented).toBe(false);
    expect(refusal).toMatchObject({
      ok: false,
      vendor: null,
      live_call: false,
      settled: false,
      code: 'IDR_GATEWAY_UNIMPLEMENTED',
      dispute_ref: 'DISP-SYN-ALPHA',
    });
    expect(refusal).not.toHaveProperty('offers');
  });
});
