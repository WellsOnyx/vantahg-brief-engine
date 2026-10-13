import { VHG_SCORE_LABEL } from './brand';
import type { VhgScore } from './types';
import { VHG_SCORE_ADVISORY } from './types';

/**
 * Frozen score for the client walkthrough default.
 * `/demo` passes a live `demoWalkthroughVhgScore()` from the server.
 * A unit test keeps this object equal to that live score.
 * This file does not import the synthetic IDR generator.
 */
export const DEMO_WALKTHROUGH_VHG_SCORE: VhgScore = {
  score: 68,
  band: 'medium',
  drivers: [
    {
      key: 'network_status',
      label: 'Out-of-network provider',
      direction: 'increases',
      points: 23,
      detail: 'Out-of-network encounters are the cases that can reach federal IDR.',
    },
    {
      key: 'billed_to_qpa',
      label: 'Billed-to-QPA ratio',
      direction: 'increases',
      points: 13,
      detail: 'Synthetic billed ÷ QPA is 2.67 (2.5–5× QPA).',
    },
    {
      key: 'historical_pattern',
      label: 'Historical win/loss pattern',
      direction: 'increases',
      points: 5,
      detail: '21 redacted patterns (service line network): 17 provider wins, 1 payer wins, 3 settled.',
    },
    {
      key: 'service_line',
      label: 'Service line / CPT',
      direction: 'increases',
      points: 4,
      detail: 'Radiology · CPT 72148.',
    },
    {
      key: 'state',
      label: 'State',
      direction: 'increases',
      points: 3,
      detail: 'State on the synthetic packet: TX.',
    },
    {
      key: 'facility_type',
      label: 'Facility type',
      direction: 'increases',
      points: 1,
      detail: 'Facility type on the synthetic packet: asc.',
    },
  ],
  pattern_lookup: {
    match_level: 'service_line_network',
    sample_size: 21,
    provider_wins: 17,
    payer_wins: 1,
    settled: 3,
    provider_win_rate: 0.81,
  },
  model_id: 'vhg-score-demo-v1',
  model_status: 'demo_not_validated',
  label: VHG_SCORE_LABEL,
  trademark: 'TM',
  advisory: VHG_SCORE_ADVISORY,
};
