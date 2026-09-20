/**
 * E1 synthetic + E2 shadow packs. Tokenized refs only — no live PHI.
 *
 * E1 catalog lives in fixtures/golive/synthetic-e1.json (prior_auth +
 * first_level_appeal). Shadow remains inline — MD sign + intent-only fan-out.
 */

import { loadSyntheticE1Pack } from './load-fixtures';
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

/** Live-shaped synthetic packets. MD signs. Fan-out in shadow — no member/provider final send. */
export const SHADOW_PACK: readonly PackCaseSpec[] = [
  {
    id: 'e2-shadow-01',
    scenario: 'happy_path',
    label: 'Shadow MRI — approve',
    intake: { ...COMPLETE, external_id: 'e2-shadow-01', member_ref: 'memb_synth_e2_01' },
    source: 'gravity_rail',
    criteria: 'meet',
    sign: true,
    determination: 'approve',
    expected: { state: 'fanout_complete', criteria_result: 'meet' },
  },
  {
    id: 'e2-shadow-02',
    scenario: 'happy_path',
    label: 'Shadow PT — approve',
    intake: {
      ...COMPLETE,
      external_id: 'e2-shadow-02',
      member_ref: 'memb_synth_e2_02',
      service_or_rx: 'CPT-97110',
    },
    source: 'external_api',
    criteria: 'meet',
    sign: true,
    determination: 'approve',
    expected: { state: 'fanout_complete', criteria_result: 'meet' },
  },
  {
    id: 'e2-shadow-03',
    scenario: 'gray_zone',
    label: 'Shadow gray — pend',
    intake: { ...COMPLETE, external_id: 'e2-shadow-03', member_ref: 'memb_synth_e2_03' },
    source: 'spine',
    criteria: 'gray',
    sign: true,
    determination: 'pend',
    expected: { state: 'fanout_complete', criteria_result: 'gray' },
  },
  {
    id: 'e2-shadow-04',
    scenario: 'happy_path',
    label: 'Shadow urgent — approve',
    intake: {
      ...COMPLETE,
      external_id: 'e2-shadow-04',
      member_ref: 'memb_synth_e2_04',
      urgency: 'urgent',
    },
    source: 'fax_phaxio',
    criteria: 'meet',
    sign: true,
    determination: 'approve',
    expected: { state: 'fanout_complete', criteria_result: 'meet' },
  },
  {
    id: 'e2-shadow-05',
    scenario: 'happy_path',
    label: 'Shadow deny — criteria fail',
    intake: {
      ...COMPLETE,
      external_id: 'e2-shadow-05',
      member_ref: 'memb_synth_e2_05',
      service_or_rx: 'CPT-70553',
    },
    source: 'spine',
    criteria: 'fail',
    sign: true,
    determination: 'deny',
    expected: { state: 'fanout_complete', criteria_result: 'fail' },
  },
  {
    id: 'e2-shadow-06',
    scenario: 'happy_path',
    label: 'Shadow partial',
    intake: { ...COMPLETE, external_id: 'e2-shadow-06', member_ref: 'memb_synth_e2_06' },
    source: 'spine',
    criteria: 'meet',
    sign: true,
    determination: 'partial',
    expected: { state: 'fanout_complete', criteria_result: 'meet' },
  },
  {
    id: 'e2-shadow-07',
    scenario: 'happy_path',
    label: 'Shadow pharmacy',
    intake: {
      ...COMPLETE,
      external_id: 'e2-shadow-07',
      member_ref: 'memb_synth_e2_07',
      benefit_type: 'pharmacy',
      service_or_rx: 'NDC-0002-1433',
    },
    source: 'gravity_rail',
    criteria: 'meet',
    sign: true,
    determination: 'approve',
    expected: { state: 'fanout_complete', criteria_result: 'meet' },
  },
  {
    id: 'e2-shadow-08',
    scenario: 'gray_zone',
    label: 'Shadow gray urgent — pend',
    intake: {
      ...COMPLETE,
      external_id: 'e2-shadow-08',
      member_ref: 'memb_synth_e2_08',
      urgency: 'urgent',
    },
    source: 'external_api',
    criteria: 'gray',
    sign: true,
    determination: 'pend',
    expected: { state: 'fanout_complete', criteria_result: 'gray' },
  },
  {
    id: 'e2-shadow-09',
    scenario: 'happy_path',
    label: 'Shadow expedited',
    intake: {
      ...COMPLETE,
      external_id: 'e2-shadow-09',
      member_ref: 'memb_synth_e2_09',
      urgency: 'expedited',
      service_or_rx: 'CPT-27447',
    },
    source: 'spine',
    criteria: 'meet',
    sign: true,
    determination: 'approve',
    expected: { state: 'fanout_complete', criteria_result: 'meet' },
  },
  {
    id: 'e2-shadow-10',
    scenario: 'happy_path',
    label: 'Shadow first-level appeal shape',
    intake: { ...COMPLETE, external_id: 'e2-shadow-10', member_ref: 'memb_synth_e2_10' },
    source: 'fax_phaxio',
    criteria: 'meet',
    sign: true,
    determination: 'approve',
    expected: { state: 'fanout_complete', criteria_result: 'meet' },
  },
];

