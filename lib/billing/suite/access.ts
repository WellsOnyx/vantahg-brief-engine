import { authorizeLineAccess, type FirewallAuditEvent, type LineActor, type LineOfBusiness } from '@/lib/lines';
import type { FinanceActor, FinanceAuditEvent, FinanceBook, FinancePolicy, FinanceState } from './types';

export function toLineActor(actor: FinanceActor): LineActor {
  return {
    id: actor.id,
    companies: actor.companies,
    lines: actor.lines,
    case_restricted: actor.case_restricted,
    assigned_case_ids: actor.assigned_case_ids,
    line_wide: actor.line_wide || actor.finance_role === 'cfo',
  };
}

export function canApproveSpend(actor: FinanceActor, policy: FinancePolicy): boolean {
  if (!actor.approval_role) return false;
  return policy.payout_approver_roles.some(
    (role) => role.toLowerCase() === actor.approval_role!.toLowerCase(),
  );
}

export function canViewConsolidated(actor: FinanceActor, policy: FinancePolicy): boolean {
  return policy.cfo_roles.includes(actor.finance_role) && actor.finance_role === 'cfo';
}

export function financeGate(
  actor: FinanceActor,
  record: { id: string; case_id: string; line_of_business: LineOfBusiness },
  op: 'read' | 'write' | 'report',
  audit: FirewallAuditEvent[],
  now: () => string,
): { allowed: true } | { allowed: false; code: string; message: string } {
  const decision = authorizeLineAccess(
    toLineActor(actor),
    {
      id: record.id,
      case_id: record.case_id,
      company: 'VANTA_HG',
      line_of_business: record.line_of_business,
      kind: 'record',
    },
    op,
    { audit, now },
  );
  if (decision.allowed) return { allowed: true };
  return { allowed: false, code: decision.code, message: decision.message };
}

export function appendAudit(
  state: FinanceState,
  event: FinanceAuditEvent,
): FinanceState {
  return { ...state, audit: [...state.audit, event] };
}

export function actorLinesCover(actor: FinanceActor, line: LineOfBusiness): boolean {
  return actor.lines.includes(line);
}

export type { FinanceBook };
