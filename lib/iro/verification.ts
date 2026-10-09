import { REQUIRED_AGREEMENTS, REQUIRED_SCREENING_SOURCES, type IroPhysician } from './types';

/** Direct patient-care counts as recent when it is current or ended within this many months. */
export const PATIENT_CARE_RECENCY_MONTHS = 24;

function monthsBetween(earlierIso: string, later: Date): number {
  const earlier = new Date(`${earlierIso.slice(0, 10)}T00:00:00.000Z`);
  const years = later.getUTCFullYear() - earlier.getUTCFullYear();
  const months = later.getUTCMonth() - earlier.getUTCMonth();
  return years * 12 + months;
}

export function experienceIsRecent(
  endedOn: string | null,
  now: Date,
  windowMonths = PATIENT_CARE_RECENCY_MONTHS,
): boolean {
  if (!endedOn) return true;
  return monthsBetween(endedOn, now) <= windowMonths;
}

/**
 * Gaps that block Thelma from handing a file to the Medical Director.
 * Screening rows are stored results (stub adapters are fine). No live API.
 */
export function verificationGaps(physician: IroPhysician, now: Date): string[] {
  const gaps: string[] = [];
  const licenseOk = physician.licenses.some(
    (license) =>
      license.state &&
      license.license_number &&
      license.expires_on &&
      license.primary_source_verified_at &&
      license.primary_source_result,
  );
  if (!licenseOk) gaps.push('license_psv');

  for (const source of REQUIRED_SCREENING_SOURCES) {
    const row = physician.sanctions.find((item) => item.source === source && item.screened_at && item.result);
    if (!row) gaps.push(`sanction_${source}`);
  }

  if (physician.board_certifications.length === 0 && !physician.board_cert_waiver) {
    gaps.push('board_certification');
  }

  const recentCare = physician.clinical_experience.some(
    (row) => row.direct_patient_care && experienceIsRecent(row.ended_on, now),
  );
  if (!recentCare) gaps.push('direct_patient_care_recency');

  for (const kind of REQUIRED_AGREEMENTS) {
    const ack = physician.agreements.some(
      (row) => row.agreement_type === kind && row.status === 'acknowledged' && row.acknowledged_at,
    );
    if (!ack) gaps.push(`agreement_${kind}`);
  }

  if (physician.outstanding_items.some((item) => !item.resolved_at)) {
    gaps.push('outstanding_items');
  }

  return gaps;
}
