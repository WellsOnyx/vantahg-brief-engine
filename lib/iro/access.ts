import type { UserRole } from '@/lib/auth-guard';
import type { AssignmentCard, AssignmentIdentity, IroEvidence, IroPhysician } from './types';

/**
 * Server-side field split for IRO Panel.
 *
 * Front-line assignment traffic may receive only ASSIGNMENT_FIELD_NAMES.
 * Restricted names are rejected if they appear in an assignment SELECT
 * list, and `toAssignmentCard` copies the allowlist by name so a full
 * physician row cannot leak through that mapper.
 */

export const IRO_HR_ROLES = ['credentialing_admin', 'admin'] as const satisfies readonly UserRole[];
export const IRO_CLINICAL_DECIDE_ROLES = ['clinical_approver'] as const satisfies readonly UserRole[];
export const IRO_APPROVAL_READ_ROLES = ['clinical_approver', 'admin'] as const satisfies readonly UserRole[];

/** Case assignment and the safe panel card. */
export const IRO_ASSIGNMENT_ROLES = [
  'reviewer',
  'concierge',
  'delivery-lead',
  'practice-lead',
  'admin',
  'credentialing_admin',
  'clinical_approver',
] as const satisfies readonly UserRole[];

/** Who may record the per-case attestation. Panel approval is not a substitute. */
export const IRO_ATTEST_ROLES = ['reviewer', 'admin'] as const satisfies readonly UserRole[];

export const IRO_ASSIGN_ROLES = [
  'reviewer',
  'concierge',
  'delivery-lead',
  'practice-lead',
  'admin',
] as const satisfies readonly UserRole[];

export const IRO_COMPLETE_ROLES = ['reviewer', 'admin'] as const satisfies readonly UserRole[];

export const ASSIGNMENT_FIELD_NAMES = [
  'id',
  'display_name',
  'specialties',
  'jurisdictions',
  'availability',
  'assignment_status',
  'case_checks_complete',
] as const;

export const ASSIGNMENT_SELECT_COLUMNS = [
  'id',
  'display_name',
  'specialties',
  'jurisdictions',
  'availability',
  'assignment_status',
] as const;

/** Columns and nested keys that must never appear on the assignment card. */
export const RESTRICTED_FIELD_NAMES = [
  'legal_name',
  'email',
  'phone',
  'npi',
  'external_key',
  'cv_storage_key',
  'contract_ref',
  'notes_hr',
  'licenses',
  'license_number',
  'primary_source_verified_at',
  'primary_source_method',
  'primary_source_result',
  'board_certifications',
  'board_name',
  'sanctions',
  'finding_summary',
  'clinical_experience',
  'agreements',
  'outstanding_items',
  'evidence_storage_key',
  'evidence_link',
  'evidence',
  'events',
  'corrective_actions',
  'conflict_note',
  'screening',
  'reminders',
  'verification_completed_by',
  'clinical_decision_note',
  'conditional_terms',
  'board_cert_waiver',
] as const;

export const CLINICAL_HIDDEN_FIELD_NAMES = ['contract_ref', 'notes_hr'] as const;

export const ASSIGNMENT_VIEW = 'iro_panel_assignment_v';
export const CASE_CHECK_VIEW = 'iro_case_check_status_v';

const RESTRICTED = new Set<string>(RESTRICTED_FIELD_NAMES);

export function assertAssignmentSelect(columns: readonly string[]): void {
  for (const column of columns) {
    if (RESTRICTED.has(column)) {
      throw new Error(`restricted_column:${column}`);
    }
  }
}

export function assignmentQuerySpec(): { view: string; columns: readonly string[] } {
  const columns = [...ASSIGNMENT_SELECT_COLUMNS];
  assertAssignmentSelect(columns);
  return { view: ASSIGNMENT_VIEW, columns };
}

export function toAssignmentIdentity(physician: IroPhysician): AssignmentIdentity {
  return {
    id: physician.id,
    display_name: physician.display_name,
    specialties: [...physician.specialties],
    jurisdictions: [...physician.jurisdictions],
    availability: physician.availability,
    assignment_status: physician.assignment_status,
  };
}

export function toAssignmentCard(
  physician: IroPhysician | AssignmentIdentity,
  caseChecksComplete: boolean,
): AssignmentCard {
  return {
    id: physician.id,
    display_name: physician.display_name,
    specialties: [...physician.specialties],
    jurisdictions: [...physician.jurisdictions],
    availability: physician.availability,
    assignment_status: physician.assignment_status,
    case_checks_complete: caseChecksComplete,
  };
}

export interface ClinicalPacket {
  id: string;
  display_name: string;
  legal_name: string;
  npi: string;
  status: IroPhysician['status'];
  specialties: string[];
  jurisdictions: string[];
  availability: IroPhysician['availability'];
  licenses: IroPhysician['licenses'];
  board_certifications: IroPhysician['board_certifications'];
  sanctions: IroPhysician['sanctions'];
  clinical_experience: IroPhysician['clinical_experience'];
  agreements: IroPhysician['agreements'];
  outstanding_items: IroPhysician['outstanding_items'];
  evidence: IroEvidence[];
  verification_completed_at: string | null;
  clinical_decision_note: string | null;
  conditional_terms: string | null;
  responsibility: string;
}

export function toClinicalPacket(physician: IroPhysician, responsibility: string): ClinicalPacket {
  return {
    id: physician.id,
    display_name: physician.display_name,
    legal_name: physician.legal_name,
    npi: physician.npi,
    status: physician.status,
    specialties: [...physician.specialties],
    jurisdictions: [...physician.jurisdictions],
    availability: physician.availability,
    licenses: physician.licenses.map((row) => ({ ...row })),
    board_certifications: physician.board_certifications.map((row) => ({ ...row })),
    sanctions: physician.sanctions.map((row) => ({ ...row })),
    clinical_experience: physician.clinical_experience.map((row) => ({ ...row })),
    agreements: physician.agreements.map((row) => ({ ...row })),
    outstanding_items: physician.outstanding_items.map((row) => ({ ...row })),
    evidence: physician.evidence
      .filter((row) => row.kind !== 'contract')
      .map((row) => ({ ...row })),
    verification_completed_at: physician.verification_completed_at,
    clinical_decision_note: physician.clinical_decision_note,
    conditional_terms: physician.conditional_terms,
    responsibility,
  };
}

export function collectKeys(value: unknown, acc: Set<string> = new Set()): Set<string> {
  if (Array.isArray(value)) {
    for (const item of value) collectKeys(item, acc);
    return acc;
  }
  if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      acc.add(key);
      collectKeys(child, acc);
    }
  }
  return acc;
}
