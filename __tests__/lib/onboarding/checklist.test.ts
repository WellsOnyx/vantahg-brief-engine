import { describe, expect, it } from 'vitest';
import {
  ONBOARDING_CHECKLIST,
  ONBOARDING_PHASES,
  assertChecklistComplete,
  requiredChecklistIds,
} from '@/lib/onboarding/checklist';
import { buildOnboardingProgress, MemoryOnboardingProgressStore } from '@/lib/onboarding/progress';

describe('Phase 7.1 onboarding checklist A–E', () => {
  it('covers commercial/legal, client_config, access, connectivity, go-live gates', () => {
    const { ok, phases, ids } = assertChecklistComplete();
    expect(ok).toBe(true);
    expect(phases).toEqual([...ONBOARDING_PHASES]);
    expect(ids).toEqual(expect.arrayContaining(['A1', 'A2', 'A3', 'A5', 'B1', 'B16', 'C1', 'D5', 'E1', 'E2', 'E3', 'E4']));
    expect(ids.filter((id) => id.startsWith('A')).length).toBeGreaterThanOrEqual(5);
    expect(ids.filter((id) => id.startsWith('B')).length).toBeGreaterThanOrEqual(15);
    expect(ONBOARDING_CHECKLIST.find((i) => i.id === 'A2')?.gate).toBe('hard');
    expect(ONBOARDING_CHECKLIST.find((i) => i.id === 'B6')?.title).toMatch(/always_md/);
    expect(ONBOARDING_CHECKLIST.some((i) => i.pointer.includes('client-config'))).toBe(true);
    expect(ONBOARDING_CHECKLIST.some((i) => i.id === 'D1' && i.pointer.includes('gravity-rail'))).toBe(true);
    expect(requiredChecklistIds()).toContain('E1');
  });

  it('tracks per-item progress without tribal knowledge fields missing', () => {
    const store = new MemoryOnboardingProgressStore();
    store.mark('client-synth', 'A1', true, 'cole', new Date('2026-09-18T18:00:00.000Z'));
    const progress = buildOnboardingProgress('client-synth', store);
    expect(progress.items.find((i) => i.id === 'A1')?.done).toBe(true);
    expect(progress.done).toBe(1);
    expect(progress.required_remaining).toBeGreaterThan(0);
    expect(progress.phases.A.done).toBe(1);
    expect(progress.phases.E.total).toBeGreaterThanOrEqual(4);
  });
});
