import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ONBOARDING_CHECKLIST,
  ONBOARDING_PHASES,
  assertChecklistComplete,
  assertChecklistOperational,
  requiredChecklistIds,
} from '@/lib/onboarding/checklist';
import { buildOnboardingProgress, MemoryOnboardingProgressStore } from '@/lib/onboarding/progress';
import {
  HARD_CONSTRAINTS,
  PACKAGING_LOCK,
  SYNTHETIC_CLIENT_CONFIG_FIXTURE,
} from '@/lib/onboarding/runbook';
import { safeParseClientConfigFields } from '@/lib/client-config';
import { SYNTHETIC_CLIENT_ID } from '@/lib/intake/constants';

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

  it('is operational — every item has how_to so Cole needs no tribal knowledge', () => {
    const { ok, how_to_steps, ids } = assertChecklistOperational();
    expect(ok).toBe(true);
    expect(how_to_steps).toBeGreaterThanOrEqual(ids.length);
    for (const item of ONBOARDING_CHECKLIST) {
      expect(item.how_to.length).toBeGreaterThanOrEqual(1);
      expect(item.owner.length).toBeGreaterThan(0);
      expect(item.artifact.length).toBeGreaterThan(0);
    }
    expect(ONBOARDING_CHECKLIST.find((i) => i.id === 'A1')?.how_to.join(' ')).toMatch(/Med Review|med review/);
    expect(ONBOARDING_CHECKLIST.find((i) => i.id === 'C1')?.how_to.join(' ')).toMatch(/ENABLE_AWS_AUTH/);
    expect(ONBOARDING_CHECKLIST.find((i) => i.id === 'E5')?.how_to.join(' ')).toMatch(/ENABLE_AWS/);
    expect(ONBOARDING_CHECKLIST.find((i) => i.id === 'B1')?.command).toMatch(/client-config-synthetic\.json/);
  });

  it('tracks per-item progress without tribal knowledge fields missing', () => {
    const store = new MemoryOnboardingProgressStore();
    store.mark('client-synth', 'A1', true, 'cole', new Date('2026-09-18T18:00:00.000Z'));
    const progress = buildOnboardingProgress('client-synth', store);
    expect(progress.items.find((i) => i.id === 'A1')?.done).toBe(true);
    expect(progress.items.find((i) => i.id === 'A1')?.how_to?.length).toBeGreaterThan(0);
    expect(progress.done).toBe(1);
    expect(progress.required_remaining).toBeGreaterThan(0);
    expect(progress.phases.A.done).toBe(1);
    expect(progress.phases.E.total).toBeGreaterThanOrEqual(4);
  });

  it('ships a synthetic client_config fixture that parses (no live PHI)', () => {
    const parsed = safeParseClientConfigFields(SYNTHETIC_CLIENT_CONFIG_FIXTURE);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.client_id).toBe(SYNTHETIC_CLIENT_ID);
      expect(parsed.data.auto_vs_md_policy).toBe('always_md');
      expect(parsed.data.go_live_mode).toBe('synthetic');
      expect(parsed.data.legal_name).not.toMatch(/patient|member|dob/i);
    }
    const disk = JSON.parse(
      readFileSync(resolve(process.cwd(), 'docs/customer-ready/fixtures/client-config-synthetic.json'), 'utf8'),
    );
    expect(safeParseClientConfigFields(disk).success).toBe(true);
    expect(disk.client_id).toBe(SYNTHETIC_CLIENT_ID);
  });

  it('locks Med Review packaging and forbids AWS flag flips in the runbook', () => {
    expect(PACKAGING_LOCK.paid_door).toMatch(/Med Review/);
    expect(PACKAGING_LOCK.not_standalone_free_um).toBe(true);
    expect(PACKAGING_LOCK.not_free_with_other_shop_med_review).toBe(true);
    expect(HARD_CONSTRAINTS.some((c) => c.includes('ENABLE_AWS_AUTH'))).toBe(true);
    expect(HARD_CONSTRAINTS.some((c) => /live PHI/i.test(c))).toBe(true);
    expect(HARD_CONSTRAINTS.some((c) => /Med Review/i.test(c))).toBe(true);
  });
});
