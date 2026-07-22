/**
 * Credentialing — the NCQA CR verification element set (Phase 1).
 *
 * One entry per primary-source-verification element. This is the list the
 * engine seeds `verification_items` from when a credentialing cycle opens,
 * and the list the committee file is assembled against. Element applicability
 * can vary by provider type (e.g. DEA only for prescribers) — `applies()`
 * captures that.
 *
 * Sources map to PSV adapters (lib/adapters/psv). Where no API adapter is
 * live yet, `manual` is the structured fallback — the same pend-cleanly
 * discipline as the clinical side: an unverifiable element is a visible
 * pending/discrepancy row, never a silent skip.
 *
 * The wall: nothing in this module (or the PSV orchestration) decides
 * anything. The committee decision path is the only writer of
 * credentialing_cases.decision.
 */

export type PsvSourceKey =
  | 'caqh'
  | 'npdb'
  | 'oig_leie'
  | 'sam_gov'
  | 'abms'
  | 'state_board'
  | 'dea'
  | 'manual';

export type VerificationElementKey =
  | 'identity'
  | 'licensure'
  | 'dea'
  | 'board_certification'
  | 'education_training'
  | 'work_history'
  | 'malpractice'
  | 'sanctions_exclusions'
  | 'hospital_privileges';

export interface ProviderProfileForApplicability {
  credential?: string | null; // MD, DO, NP, PA, ...
  specialties?: string[];
}

export interface VerificationElement {
  key: VerificationElementKey;
  label: string;
  /** Primary source adapter; `manual` until the real adapter is live. */
  source: PsvSourceKey;
  /** NCQA CR requires this element for the element set we target. */
  required: boolean;
  /** Whether this element applies to a given provider profile. */
  applies?: (p: ProviderProfileForApplicability) => boolean;
  notes?: string;
}

const PRESCRIBER_CREDENTIALS = new Set(['MD', 'DO', 'NP', 'PA', 'DDS', 'DMD', 'DPM']);

export const VERIFICATION_ELEMENTS: VerificationElement[] = [
  {
    key: 'identity',
    label: 'Identity + demographics (CAQH attestation)',
    source: 'caqh',
    required: true,
    notes: 'CAQH ProView attest + pull — never re-key what the hub already holds.',
  },
  {
    key: 'licensure',
    label: 'Active state licensure',
    source: 'state_board',
    required: true,
    notes: 'Per license_states on the provider; some boards API, some manual.',
  },
  {
    key: 'dea',
    label: 'DEA / CDS registration',
    source: 'dea',
    required: true,
    applies: (p) => PRESCRIBER_CREDENTIALS.has((p.credential ?? '').toUpperCase()),
    notes: 'Prescribers only.',
  },
  {
    key: 'board_certification',
    label: 'Board certification',
    source: 'abms',
    required: true,
    applies: (p) => ['MD', 'DO'].includes((p.credential ?? '').toUpperCase()),
  },
  {
    key: 'education_training',
    label: 'Education + training',
    source: 'manual',
    required: true,
    notes: 'Often the slowest — mailed/faxed verifications. Manual until a vendor adapter lands.',
  },
  {
    key: 'work_history',
    label: 'Work history (gaps > 6 months explained)',
    source: 'caqh',
    required: true,
  },
  {
    key: 'malpractice',
    label: 'Malpractice history + insurance',
    source: 'npdb',
    required: true,
  },
  {
    key: 'sanctions_exclusions',
    label: 'Sanctions / exclusions (NPDB, OIG-LEIE, SAM, state Medicaid)',
    source: 'oig_leie',
    required: true,
    notes: 'Also the ongoing-monitoring set between cycles.',
  },
  {
    key: 'hospital_privileges',
    label: 'Hospital privileges',
    source: 'manual',
    required: false,
    notes: 'Where applicable per the client credentialing policy.',
  },
];

/** The elements applicable to a specific provider profile. */
export function applicableElements(p: ProviderProfileForApplicability): VerificationElement[] {
  return VERIFICATION_ELEMENTS.filter((e) => (e.applies ? e.applies(p) : true));
}

/** NCQA CR: re-credentialing at least every 36 months. */
export const RECREDENTIAL_CYCLE_MONTHS = 36;

export function nextCycleDueAt(from: Date = new Date()): string {
  const d = new Date(from);
  d.setMonth(d.getMonth() + RECREDENTIAL_CYCLE_MONTHS);
  return d.toISOString();
}
