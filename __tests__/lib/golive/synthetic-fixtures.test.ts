import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resetCaseSpineService } from '@/lib/case-spine';
import { resetClientConfigService } from '@/lib/client-config';
import {
  MIN_SYNTHETIC_PACK,
  loadSyntheticE1Catalog,
  loadSyntheticE1CatalogFromDisk,
  replaySyntheticPackViaApis,
  resetMemoryGoLiveStore,
} from '@/lib/golive';

vi.mock('@/lib/supabase', () => ({
  hasSupabaseConfig: () => false,
  getSupabase: () => ({}),
  getServiceClient: () => ({}),
  supabase: {},
}));

vi.mock('@/lib/supabase-server', () => ({
  createServerClient: async () => ({
    auth: {
      getUser: async () => ({ data: { user: null }, error: null }),
    },
    from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: null, error: null }) }) }) }),
  }),
}));

vi.mock('@/lib/rate-limit-middleware', () => ({
  applyRateLimit: vi.fn().mockResolvedValue(null),
}));

describe('Phase 7.2 synthetic fixture catalog', () => {
  beforeEach(() => {
    resetCaseSpineService();
    resetClientConfigService();
    resetMemoryGoLiveStore();
  });

  it('loads 10 tokenized prior_auth + first_level_appeal fixtures from disk', () => {
    const bundled = loadSyntheticE1Catalog();
    const disk = loadSyntheticE1CatalogFromDisk();
    expect(bundled.cases).toHaveLength(disk.cases.length);
    expect(disk.cases.length).toBeGreaterThanOrEqual(MIN_SYNTHETIC_PACK);
    expect(disk.cases.map((c) => c.id)).toEqual(bundled.cases.map((c) => c.id));
    expect(disk.cases.some((c) => c.type === 'prior_auth')).toBe(true);
    expect(disk.cases.filter((c) => c.type === 'first_level_appeal').length).toBeGreaterThanOrEqual(2);
    expect(disk.cases.filter((c) => c.scenario === 'missing_clinicals').length).toBeGreaterThanOrEqual(2);
    expect(disk.cases.filter((c) => c.scenario === 'gray_zone').length).toBeGreaterThanOrEqual(2);
    expect(disk.cases.some((c) => c.parent_external_id)).toBe(true);
    expect(JSON.stringify(disk.cases)).not.toMatch(/\b\d{3}-\d{2}-\d{4}\b/);
    expect(disk.notes.toLowerCase()).toContain('no live phi');
  });

  it('creates every fixture through the demo API path', async () => {
    const catalog = loadSyntheticE1Catalog();
    const result = await replaySyntheticPackViaApis(catalog.cases);
    expect(result.count).toBe(catalog.cases.length);
    expect(result.passed).toBe(true);
    expect(result.cases.every((c) => c.ok && c.case_id)).toBe(true);
    expect(result.cases.some((c) => c.source === 'gravity_rail')).toBe(true);
    expect(result.cases.some((c) => c.source === 'external_api')).toBe(true);
    expect(result.cases.some((c) => c.source === 'fax_phaxio')).toBe(true);
    expect(result.cases.some((c) => c.source === 'spine')).toBe(true);

    const missing = result.cases.filter((c) =>
      catalog.cases.find((s) => s.id === c.spec_id)?.scenario === 'missing_clinicals',
    );
    expect(missing.every((c) => c.state === 'intake_incomplete' && c.sla_clock === 'paused')).toBe(true);

    const appeals = result.cases.filter((c) => c.type === 'first_level_appeal');
    expect(appeals.length).toBeGreaterThanOrEqual(2);
    expect(appeals.some((c) => c.parent_case_id)).toBe(true);
  });
});
