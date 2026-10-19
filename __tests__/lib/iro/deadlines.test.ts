import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { URAC_IRO_BASELINE } from '@/lib/iro/config/urac-baseline';
import { OHIO_SETTINGS_V1, STATE_SETTINGS_REGISTRY } from '@/lib/iro/config/state-settings';
import {
  addDuration,
  calculateDeadline,
  deadlineAfterRecordsGap,
  resolvePinnedSettings,
  settingsEffectiveAt,
} from '@/lib/iro/deadlines';
import { IRO_STATE_CODES } from '@/lib/iro/types';
import type { Receipts, StateSettingsVersion } from '@/lib/iro/types';

const RECEIPTS: Receipts = {
  carrier_receipt_at: '2026-10-01T14:00:00.000Z',
  state_receipt_at: '2026-10-02T16:00:00.000Z',
  vanta_receipt_at: '2026-10-01T18:30:00.000Z',
};

describe('IRO deadline engine', () => {
  it('uses the stricter Ohio standard clock and keeps the three receipts distinct', () => {
    const result = calculateDeadline({
      receipts: RECEIPTS,
      settings: OHIO_SETTINGS_V1,
      urac: URAC_IRO_BASELINE,
      expedited: false,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.deadline.due_at).toBe('2026-10-31T14:00:00.000Z');
    expect(result.deadline.winner).toBe('state');
    expect(result.deadline.urac_due_at).toBe('2026-11-15T14:00:00.000Z');
    expect(result.deadline.clock_start).toBe('carrier_receipt');
    expect(result.deadline.clock_start_at).toBe(RECEIPTS.carrier_receipt_at);
    expect(result.deadline.missing_records_effect).toBe('none');
    expect(new Set(Object.values(RECEIPTS)).size).toBe(3);
    expect(deadlineAfterRecordsGap(result.deadline).due_at).toBe(result.deadline.due_at);
  });

  it('ties Ohio expedited with the URAC 72 hour baseline', () => {
    const result = calculateDeadline({
      receipts: RECEIPTS,
      settings: OHIO_SETTINGS_V1,
      urac: URAC_IRO_BASELINE,
      expedited: true,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.deadline.due_at).toBe('2026-10-04T14:00:00.000Z');
    expect(result.deadline.winner).toBe('tie');
    expect(result.deadline.state_due_at).toBe(result.deadline.urac_due_at);
  });

  it('lets a stricter contract win', () => {
    const result = calculateDeadline({
      receipts: RECEIPTS,
      settings: OHIO_SETTINGS_V1,
      urac: URAC_IRO_BASELINE,
      expedited: false,
      contract: { id: 'syn-contract', standard: { duration: 10, unit: 'calendar_days' }, expedited: null },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.deadline.winner).toBe('contract');
    expect(result.deadline.due_at).toBe('2026-10-11T14:00:00.000Z');
  });

  it('stops when the state is not through the go-live gate', () => {
    const northCarolina = STATE_SETTINGS_REGISTRY.versions.find((row) => row.state === 'NC');
    expect(northCarolina?.go_live).toBe(false);
    const blocked = calculateDeadline({
      receipts: RECEIPTS,
      settings: northCarolina!,
      urac: URAC_IRO_BASELINE,
      expedited: false,
    });
    expect(blocked.ok).toBe(false);
    if (blocked.ok) return;
    expect(blocked.code).toBe('state_not_configured');
  });

  it('accepts another state from config without an engine change', () => {
    const northCarolina = STATE_SETTINGS_REGISTRY.versions.find((row) => row.state === 'NC')!;
    const turnedOn: StateSettingsVersion = { ...northCarolina, go_live: true };
    const result = calculateDeadline({
      receipts: RECEIPTS,
      settings: turnedOn,
      urac: URAC_IRO_BASELINE,
      expedited: false,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.deadline.clock_start).toBe('state_receipt');
    expect(result.deadline.due_at).toBe('2026-11-16T16:00:00.000Z');
    expect(result.deadline.pinned_settings_id).toBe(northCarolina.id);
  });

  it('keeps an open case on the rules it started under', () => {
    const later: StateSettingsVersion = {
      ...OHIO_SETTINGS_V1,
      id: 'OH-v2-test',
      version: 2,
      effective_from: '2026-11-01T00:00:00.000Z',
      standard: { duration: 10, unit: 'calendar_days' },
      change_note: 'test revision',
    };
    const versions = [...STATE_SETTINGS_REGISTRY.versions, later];
    const started = calculateDeadline({
      receipts: RECEIPTS,
      settings: resolvePinnedSettings(versions, OHIO_SETTINGS_V1.id)!,
      urac: URAC_IRO_BASELINE,
      expedited: false,
    });
    const openedLater = settingsEffectiveAt(versions, 'OH', '2026-12-01T00:00:00.000Z');
    expect(openedLater?.id).toBe('OH-v2-test');
    expect(started.ok).toBe(true);
    if (!started.ok) return;
    expect(started.deadline.due_at).toBe('2026-10-31T14:00:00.000Z');
    expect(started.deadline.applied).toEqual({ duration: 30, unit: 'calendar_days' });
  });

  it('skips weekends and configured holidays for business-day rules', () => {
    const due = addDuration('2026-03-06T00:00:00.000Z', { duration: 1, unit: 'business_days' }, ['2026-03-09']);
    expect(due).toBe('2026-03-10T00:00:00.000Z');
  });

  it('ships all ten state rows and does not hard-code Ohio durations in the engine', () => {
    expect(STATE_SETTINGS_REGISTRY.versions.map((row) => row.state)).toEqual([...IRO_STATE_CODES]);
    expect(STATE_SETTINGS_REGISTRY.versions.filter((row) => row.go_live).map((row) => row.state)).toEqual(['OH']);
    const source = readFileSync('lib/iro/deadlines.ts', 'utf8');
    expect(source).not.toMatch(/duration:\s*30|duration:\s*45|duration:\s*72/);
  });
});
