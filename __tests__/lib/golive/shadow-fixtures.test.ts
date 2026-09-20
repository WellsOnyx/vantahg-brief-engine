import { beforeEach, describe, expect, it } from 'vitest';
import { resetCaseSpineService } from '@/lib/case-spine';
import {
  ClientConfigService,
  MemoryClientConfigStore,
  resetClientConfigService,
} from '@/lib/client-config';
import {
  MIN_SHADOW_PACK,
  loadShadowE2Catalog,
  loadShadowE2CatalogFromDisk,
  resetMemoryGoLiveStore,
  runShadowPack,
  validateShadowE2Catalog,
} from '@/lib/golive';
import { SYNTHETIC_CLIENT_ID } from '@/lib/intake/constants';

const NOW = new Date('2026-09-20T21:00:00.000Z');

describe('Phase 7.3 shadow fixture catalog', () => {
  beforeEach(() => {
    resetCaseSpineService();
    resetClientConfigService();
    resetMemoryGoLiveStore();
  });

  it('loads 10 tokenized shadow=true fixtures from disk', () => {
    const bundled = loadShadowE2Catalog();
    const disk = loadShadowE2CatalogFromDisk();
    expect(bundled.shadow).toBe(true);
    expect(disk.shadow).toBe(true);
    expect(bundled.cases).toHaveLength(disk.cases.length);
    expect(disk.cases.length).toBeGreaterThanOrEqual(MIN_SHADOW_PACK);
    expect(disk.cases.map((c) => c.id)).toEqual(bundled.cases.map((c) => c.id));
    expect(disk.cases.every((c) => c.shadow === true && c.sign === true)).toBe(true);
    expect(disk.cases.some((c) => c.type === 'prior_auth')).toBe(true);
    expect(disk.cases.some((c) => c.type === 'first_level_appeal')).toBe(true);
    expect(disk.cases.some((c) => c.parent_external_id)).toBe(true);
    expect(disk.cases.some((c) => c.source === 'gravity_rail')).toBe(true);
    expect(disk.cases.some((c) => c.source === 'external_api')).toBe(true);
    expect(disk.cases.some((c) => c.source === 'fax_phaxio')).toBe(true);
    expect(disk.cases.some((c) => c.source === 'spine')).toBe(true);
    expect(JSON.stringify(disk.cases)).not.toMatch(/\b\d{3}-\d{2}-\d{4}\b/);
    expect(JSON.stringify(disk.cases)).not.toMatch(/patient_name|date_of_birth|"ssn"/);
    expect(disk.notes.toLowerCase()).toContain('no live phi');
    expect(disk.notes.toLowerCase()).toContain('shadow=true');
  });

  it('rejects a catalog that is missing shadow=true', () => {
    expect(() =>
      validateShadowE2Catalog({
        pack: 'e2-shadow',
        shadow: false,
        cases: [],
      }),
    ).toThrow(/shadow must be true/);
  });

  it('runs alongside live client_config without member/provider final send', async () => {
    const store = new MemoryClientConfigStore();
    const config = new ClientConfigService(store);
    await config.publish(
      {
        client_id: SYNTHETIC_CLIENT_ID,
        legal_name: 'Shadow-alongside-live synth',
        cx_owner: 'cx_synth',
        reviewer_queue: 'md_synth',
        intake_modes: ['api'],
        go_live_mode: 'live',
        shadow_mode: false,
        notify_channels: ['portal', 'email'],
      },
      'test',
    );

    const result = await runShadowPack({
      actor: 'md_synth',
      config,
      now: () => NOW,
    });

    expect(result.count).toBeGreaterThanOrEqual(MIN_SHADOW_PACK);
    expect(result.passed).toBe(true);
    expect(result.shadow_mode).toBe(true);
    expect(result.signed).toBe(result.count);
    expect(result.member_provider_final_sends).toBe(0);
    expect(result.cases.every((c) => c.ok && c.signed && c.actual_state === 'fanout_complete')).toBe(
      true,
    );

    const latest = await config.getLatest(SYNTHETIC_CLIENT_ID);
    expect(latest?.config.go_live_mode).toBe('live');
    expect(latest?.config.shadow_mode).toBe(false);
  });
});
