import type { CredentialStatus, PanelActivation } from './types';

/**
 * Status projection for the IRO workflow.
 * Shared records live in lib/credentialing and reach this file through
 * iroCredentialingFromShared. License numbers stay off the projection.
 */

/** Fields a portal may read. License numbers, contracts, and screening files are not here. */
export const CREDENTIAL_STATUS_FIELDS = [
  'physician_id',
  'active',
  'specialty_codes',
  'licensed_states',
  'board_certified',
  'expires_at',
  'lines_of_business',
] as const;

export function projectCredentialStatus(
  input: CredentialStatus & Record<string, unknown>,
): CredentialStatus {
  return {
    physician_id: input.physician_id,
    active: input.active,
    specialty_codes: [...input.specialty_codes],
    licensed_states: [...input.licensed_states],
    board_certified: input.board_certified,
    expires_at: input.expires_at,
    lines_of_business: [...input.lines_of_business],
  };
}

export function assignmentBlockedByCredential(
  status: CredentialStatus | null,
  dueAt: string,
): { blocked: true; code: string } | { blocked: false } {
  if (!status) return { blocked: true, code: 'credential_status_missing' };
  if (!status.active) return { blocked: true, code: 'credential_inactive' };
  if (status.expires_at && status.expires_at <= dueAt) {
    return { blocked: true, code: 'credential_expires_before_due' };
  }
  return { blocked: false };
}

export function missingPanelApprovers(
  panel: PanelActivation | null,
  requiredApprovers: readonly string[],
): string[] {
  const recorded = new Set(
    (panel?.approvals ?? [])
      .filter((row) => row.recorded)
      .map((row) => row.approver_role.trim().toLowerCase()),
  );
  return requiredApprovers.filter((role) => !recorded.has(role.trim().toLowerCase()));
}

export function isPanelActivated(
  panel: PanelActivation | null,
  requiredApprovers: readonly string[],
): boolean {
  return missingPanelApprovers(panel, requiredApprovers).length === 0;
}
