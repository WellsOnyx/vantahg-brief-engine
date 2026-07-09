import { describe, it, expect } from 'vitest';
import {
  SERVICE_LINES,
  SERVICE_LINE_KEYS,
  getServiceLine,
  linesConsumingReviewQueue,
  linesConsumingBriefStage,
} from '@/lib/service-lines/config';

/**
 * Locks the load-bearing structure of the five service lines: the
 * distinctions that make each a different cost center + throughput profile.
 */

describe('service lines', () => {
  it('defines exactly the five lines', () => {
    expect(SERVICE_LINE_KEYS.sort()).toEqual(
      ['credentialing', 'idr', 'iro_ire', 'um_with_mr', 'um_without_mr'].sort(),
    );
  });

  it('every line has a distinct cost center', () => {
    const centers = SERVICE_LINE_KEYS.map((k) => SERVICE_LINES[k].cost_center);
    expect(new Set(centers).size).toBe(centers.length);
  });

  it('UM-without-MR hands off to the client and never runs our review queue', () => {
    const l = getServiceLine('um_without_mr');
    expect(l.consumes_our_review_queue).toBe(false);
    expect(l.handoff).toBe('client_in_house_mr');
    expect(l.determination_owner).toBe('client_in_house');
    expect(l.stages).not.toContain('clinical_review');
    expect(l.cost_center).toBe('cc_um_prep');
  });

  it('UM-with-MR runs the full clinical stack on our side', () => {
    const l = getServiceLine('um_with_mr');
    expect(l.consumes_our_review_queue).toBe(true);
    expect(l.stages).toContain('clinical_review');
    expect(l.determination_owner).toBe('vantaum_clinician');
    expect(l.cost_center).toBe('cc_um_full');
  });

  it('the two UM lines share the brief stage but differ on the costly queue', () => {
    const withMr = getServiceLine('um_with_mr');
    const withoutMr = getServiceLine('um_without_mr');
    expect(withMr.stages).toContain('brief');
    expect(withoutMr.stages).toContain('brief');
    expect(withMr.consumes_our_review_queue).not.toBe(withoutMr.consumes_our_review_queue);
  });

  it('credentialing is non-clinical: no labor_stream, no brief, its own stages', () => {
    const l = getServiceLine('credentialing');
    expect(l.labor_stream).toBeNull();
    expect(l.stages).not.toContain('brief');
    expect(l.stages).toContain('psv');
    expect(l.stages).toContain('committee');
    expect(l.price_basis).toBe('per_provider');
  });

  it('the capacity-planning set (our review queue) is UM-with-MR, IRO/IRE, IDR', () => {
    const keys = linesConsumingReviewQueue().map((l) => l.key).sort();
    expect(keys).toEqual(['idr', 'iro_ire', 'um_with_mr'].sort());
  });

  it('the Anthropic-bound set (brief stage) is every line except credentialing', () => {
    const keys = linesConsumingBriefStage().map((l) => l.key).sort();
    expect(keys).toEqual(['idr', 'iro_ire', 'um_with_mr', 'um_without_mr'].sort());
  });

  it('every line carries a price basis and a determination owner', () => {
    for (const k of SERVICE_LINE_KEYS) {
      const l = SERVICE_LINES[k];
      expect(l.price_basis).toBeTruthy();
      expect(l.determination_owner).toBeTruthy();
    }
  });
});
