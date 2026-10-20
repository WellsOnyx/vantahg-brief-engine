import type { UserRole } from '@/lib/auth-guard';
import type { IroActor, IroRole } from '@/lib/iro/types';

/**
 * Portal roles Jonah asked for, mapped onto the SOP roles the workflow
 * already enforces. No new Cognito attributes. org_role / user_profiles.role
 * that already match a portal role win; otherwise the existing staff role maps.
 */
export const IRO_PORTAL_ROLES = ['intake', 'case_manager', 'reviewer', 'approver', 'admin'] as const;
export type IroPortalRole = (typeof IRO_PORTAL_ROLES)[number];

const PORTAL_TO_IRO: Record<IroPortalRole, IroRole> = {
  intake: 'iro_coordinator',
  case_manager: 'iro_coordinator',
  reviewer: 'iro_physician',
  approver: 'iro_medical_director',
  admin: 'iro_team_lead',
};

const STAFF_TO_PORTAL: Partial<Record<UserRole, IroPortalRole>> = {
  concierge: 'intake',
  'delivery-lead': 'case_manager',
  'practice-lead': 'case_manager',
  reviewer: 'reviewer',
  slt: 'approver',
  admin: 'admin',
  ceo: 'admin',
};

export interface PortalUser {
  id: string;
  email: string;
  role: UserRole;
  /** Optional override stored in iro_staff_grants. */
  portal_role?: string | null;
  /** Must match the configured conflict-clearance list. Not inferred. */
  clearance_role?: string | null;
}

export function isPortalRole(value: string | null | undefined): value is IroPortalRole {
  return Boolean(value && (IRO_PORTAL_ROLES as readonly string[]).includes(value));
}

export function resolvePortalRole(user: Pick<PortalUser, 'role' | 'portal_role'>): IroPortalRole | null {
  if (isPortalRole(user.portal_role)) return user.portal_role;
  return STAFF_TO_PORTAL[user.role] ?? null;
}

export function toIroActor(
  user: PortalUser,
  assignedCaseIds: readonly string[],
): IroActor | null {
  const portal = resolvePortalRole(user);
  if (!portal) return null;
  const role = PORTAL_TO_IRO[portal];
  return {
    id: user.id,
    role,
    companies: ['VANTA_HG'],
    lines: ['IRO'],
    case_restricted: portal === 'reviewer',
    assigned_case_ids: assignedCaseIds,
    line_wide: portal === 'admin',
    selector: 'vanta',
    clearance_role: user.clearance_role ?? null,
  };
}
