/**
 * E1 synthetic + E2 shadow packs. Tokenized refs only — no live PHI.
 *
 * E1 catalog: fixtures/golive/synthetic-e1.json (prior_auth + first_level_appeal).
 * E2 catalog: fixtures/golive/shadow-e2.json (every case shadow=true).
 */

import { loadSyntheticE1Pack } from './load-fixtures';
import { loadShadowE2Pack } from './load-shadow-fixtures';
import type { PackCaseSpec } from './types';

const COMPLETE = {
  requesting_provider: 'prov_synth_golive',
  service_or_rx: 'CPT-73721',
  place_of_service: 'office' as const,
  urgency: 'standard' as const,
  clinicals_pointer: 's3://synth/packet/golive.pdf',
  benefit_type: 'medical' as const,
};

/** Phase 7.2 E1 — loaded from fixtures/golive/synthetic-e1.json */
export const SYNTHETIC_PACK: readonly PackCaseSpec[] = loadSyntheticE1Pack();

/** Phase 7.3 E2 — loaded from fixtures/golive/shadow-e2.json. Every case is shadow=true. */
export const SHADOW_PACK: readonly PackCaseSpec[] = loadShadowE2Pack();
