import { beforeEach, describe, expect, it } from 'vitest';
import { resetCaseSpineService } from '@/lib/case-spine';
import { resetClientConfigService } from '@/lib/client-config';
import { MIN_SYNTHETIC_PACK, SYNTHETIC_PACK, resetMemoryGoLiveStore, runSyntheticPack } from '@/lib/golive';

describe('Phase 7.2 E1 synthetic pack', () => {
  beforeEach(() => {
    resetCaseSpineService();
    resetClientConfigService();
    resetMemoryGoLiveStore();
  });

  it('has ≥10 cases covering happy path, missing clinicals, and gray zone', () => {
    expect(SYNTHETIC_PACK.length).toBeGreaterThanOrEqual(MIN_SYNTHETIC_PACK);
    expect(SYNTHETIC_PACK.some((s) => s.scenario === 'happy_path')).toBe(true);
    expect(SYNTHETIC_PACK.filter((s) => s.scenario === 'missing_clinicals').length).toBeGreaterThanOrEqual(2);
    expect(SYNTHETIC_PACK.filter((s) => s.scenario === 'gray_zone').length).toBeGreaterThanOrEqual(2);
  });

  it('passes via case-spine / intake and trips R01 + gray md_queue', async () => {
    const result = await runSyntheticPack({ actor: 'test' });
    expect(result.count).toBeGreaterThanOrEqual(10);
    expect(result.passed).toBe(true);
    expect(result.missing_clinicals).toBeGreaterThanOrEqual(2);
    expect(result.gray_zone).toBeGreaterThanOrEqual(2);
    expect(result.cases.every((c) => c.ok)).toBe(true);
    expect(result.cases.some((c) => c.via === 'intake')).toBe(true);
    expect(result.cases.some((c) => c.via === 'case-spine')).toBe(true);

    const missing = result.cases.filter((c) => c.scenario === 'missing_clinicals');
    expect(missing.every((c) => c.actual_state === 'intake_incomplete' && c.sla_clock === 'paused')).toBe(true);

    const gray = result.cases.filter((c) => c.scenario === 'gray_zone');
    expect(gray.every((c) => c.actual_state === 'md_queue' && c.criteria_result === 'gray')).toBe(true);
    expect(gray.every((c) => c.signed === false)).toBe(true);
  });
});
