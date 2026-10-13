import { scoreVhgCase } from './score';
import type { VhgScore, VhgScoreInput } from './types';

/**
 * De-identified inputs for the public /demo MRI walkthrough.
 * Not taken from the named patient on that page.
 */
export const DEMO_WALKTHROUGH_VHG_INPUT: VhgScoreInput = {
  network_status: 'out_of_network',
  specialty: 'radiology',
  cpt: '72148',
  service_line: 'Radiology',
  billed_amount: 2400,
  qpa_amount: 900,
  state: 'TX',
  facility_type: 'asc',
  encounter: 'scheduled',
};

export function demoWalkthroughVhgScore(): VhgScore {
  return scoreVhgCase(DEMO_WALKTHROUGH_VHG_INPUT);
}
