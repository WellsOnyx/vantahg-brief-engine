import type { UserRole } from '@/lib/auth-guard';
import { TERMINAL_STATES, type CanonicalCase, type ListCasesFilters, type SpineViewRole, type SpineViewer } from './types';

/**
 * Phase 5 RBAC. Maps existing UserRole → 04 view lenses.
 * Tenant bind is on the viewer (never from an untrusted query param as identity).
 */
export function toSpineViewRole(role: UserRole | string | null | undefined): SpineViewRole {
  switch (role) {
    case 'client':
      return 'client';
    case 'concierge':
    case 'delivery-lead':
    case 'cx':
      return 'cx';
    case 'reviewer':
    case 'idr-attorney':
    case 'med_review':
      return 'med_review';
    case 'admin':
    case 'ceo':
    case 'slt':
    case 'builder':
    case 'practice-lead':
    case 'superadmin':
      return 'superadmin';
    default:
      return 'cx';
  }
}

export const STUCK_STATES = ['intake_incomplete', 'awaiting_clinicals', 'fanout_failed'] as const;
export const ESCALATION_TASKS = ['escalation_l1', 'escalation_l2', 'escalation_l3'] as const;
export const STUCK_TASKS = ['request_clinicals', 'resolve_fanout'] as const;

export function isStuckCase(c: CanonicalCase): boolean {
  if ((STUCK_STATES as readonly string[]).includes(c.state)) return true;
  return c.open_tasks.some((t) => (STUCK_TASKS as readonly string[]).includes(t));
}

export function isEscalationCase(c: CanonicalCase): boolean {
  return c.open_tasks.some((t) => (ESCALATION_TASKS as readonly string[]).includes(t));
}

export function isOpenCase(c: CanonicalCase): boolean {
  return !(TERMINAL_STATES as readonly string[]).includes(c.state);
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
      signed_rationale: null,
      intake: {
        ...c.intake,
        clinicals_pointer: c.intake.clinicals_pointer ? '[redacted]' : null,
        member_ref: c.intake.member_ref ? '[ref]' : null,
      },
    };
  }
  // Client portal: status + SLA + determination. No CX tasks, no raw clinicals.
  return {
    ...c,
    open_tasks: c.open_tasks.filter((t) => t === 'request_clinicals'),
    packet_storage_keys: c.packet_storage_keys.length ? ['[present]'] : [],
    signed_rationale: null,
    fanout_stub: c.fanout_stub
      ? { ...c.fanout_stub, last_error: null, cx_task_id: null }
      : null,
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

function matchesFilters(c: CanonicalCase, filters: ListCasesFilters): boolean {
  if (filters.client_id && c.client_id !== filters.client_id) return false;
  if (filters.state && c.state !== filters.state) return false;
  if (filters.lane && c.lane !== filters.lane) return false;
  if (filters.sla_status && c.sla_status !== filters.sla_status) return false;
  if (filters.type && c.type !== filters.type) return false;
  if (filters.stuck && !isStuckCase(c)) return false;
  if (filters.escalation && !isEscalationCase(c)) return false;
  if (filters.open && !isOpenCase(c)) return false;
  if (filters.has_task && !c.open_tasks.includes(filters.has_task)) return false;
  return true;
}

/**
 * List projection. Query `client_id` is a filter, never viewer identity.
 * Clients are always bound to viewer.client_id — a forged filter cannot
 * widen the window.
 */
export function applyListFilters(
  cases: CanonicalCase[],
  viewer: SpineViewer,
  filters: ListCasesFilters = {},
): CanonicalCase[] {
  const bound: ListCasesFilters =
    viewer.role === 'client'
      ? { ...filters, client_id: viewer.client_id || '__no_tenant__' }
      : filters;

  return cases
    .filter((c) => canSeeCase(viewer, c))
    .filter((c) => matchesFilters(c, bound))
    .map((c) => redactCaseForViewer(viewer, c));
}
