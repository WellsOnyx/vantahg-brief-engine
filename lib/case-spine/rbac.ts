import type { UserRole } from '@/lib/auth-guard';
import type { CanonicalCase, ListCasesFilters, SpineViewRole, SpineViewer } from './types';

/**
 * Stub RBAC for Phase 1. Maps existing UserRole → 04 view lenses.
 * Full tenant/PHI hardening is Phase 5.
 */
export function toSpineViewRole(role: UserRole | string | null | undefined): SpineViewRole {
  switch (role) {
    case 'client':
      return 'client';
    case 'concierge':
    case 'delivery-lead':
      return 'cx';
    case 'reviewer':
    case 'idr-attorney':
      return 'med_review';
    case 'admin':
    case 'ceo':
    case 'slt':
    case 'builder':
    case 'practice-lead':
      return 'superadmin';
    default:
      return 'cx';
  }
}

export function canSeeCase(viewer: SpineViewer, c: CanonicalCase): boolean {
  if (viewer.role === 'superadmin' || viewer.role === 'med_review' || viewer.role === 'cx') {
    return true;
  }
  if (viewer.role === 'client') {
    return Boolean(viewer.client_id) && viewer.client_id === c.client_id;
  }
  return false;
}

export function redactCaseForViewer(viewer: SpineViewer, c: CanonicalCase): CanonicalCase {
  if (viewer.role === 'med_review' || viewer.role === 'superadmin') {
    return c;
  }
  if (viewer.role === 'cx') {
    return {
      ...c,
      packet_storage_keys: [],
      intake: {
        ...c.intake,
        clinicals_pointer: c.intake.clinicals_pointer ? '[redacted]' : null,
        member_ref: c.intake.member_ref ? '[ref]' : null,
      },
    };
  }
  // Client portal: status + SLA + determination, no internal tasks beyond request_clinicals
  return {
    ...c,
    open_tasks: c.open_tasks.filter((t) => t === 'request_clinicals'),
    packet_storage_keys: c.packet_storage_keys,
    intake: {
      external_id: c.intake.external_id,
      received_at: c.intake.received_at,
      urgency: c.intake.urgency,
      clinicals_pointer: c.intake.clinicals_pointer ? '[present]' : null,
      member_ref: undefined,
      requesting_provider: undefined,
      service_or_rx: undefined,
      place_of_service: undefined,
      benefit_type: c.intake.benefit_type,
    },
  };
}

export function applyListFilters(
  cases: CanonicalCase[],
  viewer: SpineViewer,
  filters: ListCasesFilters = {},
): CanonicalCase[] {
  return cases
    .filter((c) => canSeeCase(viewer, c))
    .filter((c) => !filters.client_id || c.client_id === filters.client_id)
    .filter((c) => !filters.state || c.state === filters.state)
    .filter((c) => !filters.lane || c.lane === filters.lane)
    .filter((c) => !filters.sla_status || c.sla_status === filters.sla_status)
    .filter((c) => !filters.type || c.type === filters.type)
    .map((c) => redactCaseForViewer(viewer, c));
}
