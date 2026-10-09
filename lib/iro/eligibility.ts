import type { IroCaseReview, IroPhysician } from './types';

export type EligibilityCode =
  | 'not_approved'
  | 'expired'
  | 'suspended'
  | 'denied'
  | 'jurisdiction'
  | 'specialty'
  | 'unavailable';

export function isApprovalCurrent(
  physician: Pick<IroPhysician, 'status' | 'approved_expires_at'>,
  now: Date,
): boolean {
  if (physician.status !== 'approved' && physician.status !== 'conditional') return false;
  if (!physician.approved_expires_at) return true;
  const expiry = new Date(`${physician.approved_expires_at.slice(0, 10)}T23:59:59.999Z`);
  return expiry.getTime() >= now.getTime();
}

export function assessEligibility(
  physician: IroPhysician,
  requirement: Pick<IroCaseReview, 'required_specialty' | 'required_jurisdiction'>,
  now: Date,
): { ok: true } | { ok: false; code: EligibilityCode } {
  if (physician.status === 'suspended') return { ok: false, code: 'suspended' };
  if (physician.status === 'denied') return { ok: false, code: 'denied' };
  if (physician.status === 'expired') return { ok: false, code: 'expired' };
  if (!isApprovalCurrent(physician, now)) {
    if (physician.status === 'approved' || physician.status === 'conditional') {
      return { ok: false, code: 'expired' };
    }
    return { ok: false, code: 'not_approved' };
  }
  if (physician.availability === 'unavailable') return { ok: false, code: 'unavailable' };
  const specialty = requirement.required_specialty.trim().toLowerCase();
  const hasSpecialty = physician.specialties.some((item) => item.trim().toLowerCase() === specialty);
  if (!hasSpecialty) return { ok: false, code: 'specialty' };
  const state = requirement.required_jurisdiction.trim().toUpperCase();
  const hasState = physician.jurisdictions.some((item) => item.trim().toUpperCase() === state);
  if (!hasState) return { ok: false, code: 'jurisdiction' };
  return { ok: true };
}

export function attestationSatisfiesCase(input: {
  conflict_attested: boolean;
  conflict_free: boolean;
  qualification_attested: boolean;
  specialty_match: boolean;
  jurisdiction_match: boolean;
}): boolean {
  return (
    input.conflict_attested === true &&
    input.conflict_free === true &&
    input.qualification_attested === true &&
    input.specialty_match === true &&
    input.jurisdiction_match === true
  );
}
