import type { DemoCriteriaResult, VhgScoreInput } from './types';
import { CRITERIA_SOURCE_NOTE } from './types';

/**
 * Mock criteria result for the demo. Invented placeholder language only.
 * Do not paste licensed criteria text into this function.
 */
export function demoCriteriaFor(input: VhgScoreInput): DemoCriteriaResult {
  const emergency = input.encounter === 'emergency';
  const highRatio = input.qpa_amount > 0 && input.billed_amount / input.qpa_amount >= 3;
  if (emergency && input.network_status === 'out_of_network') {
    return {
      label: 'criteria result (demo)',
      source_note: CRITERIA_SOURCE_NOTE,
      result: 'partial',
      headline: 'Synthetic criteria check: the encounter is documented, and one supporting element is missing.',
      items: [
        { status: 'met', text: 'The synthetic packet includes a clinician note for this service month.' },
        { status: 'met', text: 'The encounter type on the request matches an unscheduled visit.' },
        { status: 'not_assessed', text: 'A record of care before this visit is not expected for an unscheduled encounter, and none was scored.' },
        { status: 'not_met', text: 'The synthetic packet does not include a note tying the service line to the documented complaint.' },
      ],
    };
  }
  if (highRatio) {
    return {
      label: 'criteria result (demo)',
      source_note: CRITERIA_SOURCE_NOTE,
      result: 'partial',
      headline: 'Synthetic criteria check: some elements are present. The packet is thin on prior care.',
      items: [
        { status: 'met', text: 'The requested service line is named in the synthetic order.' },
        { status: 'not_met', text: 'A record of lower-intensity care before this request is not in the synthetic packet.' },
        { status: 'not_assessed', text: 'Response to that earlier care cannot be reviewed because the note is absent.' },
      ],
    };
  }
  return {
    label: 'criteria result (demo)',
    source_note: CRITERIA_SOURCE_NOTE,
    result: 'meet',
    headline: 'Synthetic criteria check: the documented elements in this packet are present.',
    items: [
      { status: 'met', text: 'The synthetic packet includes a clinician note for this service month.' },
      { status: 'met', text: 'The requested service line matches the documented encounter type.' },
      { status: 'met', text: 'The place of service on the request matches the facility type in the packet.' },
    ],
  };
}
