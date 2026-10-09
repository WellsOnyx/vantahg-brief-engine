import type { UserRole } from '@/lib/auth-guard';
import { IRO_PANEL_STATUSES, type IroPanelStatus } from './types';

export const STEP_RESPONSIBILITY: Record<IroPanelStatus, string> = {
  applicant: 'credentialing_admin — application intake and outstanding items',
  in_verification: 'credentialing_admin — primary-source verification and screening',
  pending_clinical_approval: 'clinical_approver — Medical Director panel signature',
  approved: 'clinical_approver — panel approval on file',
  conditional: 'clinical_approver — conditional panel approval on file',
  denied: 'clinical_approver — denial on file',
  suspended: 'credentialing_admin — suspension and corrective action',
  expired: 'system — recredentialing required before the physician is assignable',
};

export type TransitionActor = UserRole | 'system';

type Cap = 'hr' | 'clinical' | 'system';

const TRANSITIONS: Record<string, { to: IroPanelStatus; cap: Cap; needsVerification?: boolean }> = {};

function add(from: IroPanelStatus, to: IroPanelStatus, cap: Cap, needsVerification = false) {
  TRANSITIONS[`${from}>${to}`] = { to, cap, needsVerification };
}

add('applicant', 'in_verification', 'hr');
add('in_verification', 'pending_clinical_approval', 'hr', true);
add('pending_clinical_approval', 'approved', 'clinical');
add('pending_clinical_approval', 'conditional', 'clinical');
add('pending_clinical_approval', 'denied', 'clinical');
add('approved', 'suspended', 'hr');
add('approved', 'suspended', 'clinical');
add('conditional', 'suspended', 'hr');
add('conditional', 'suspended', 'clinical');
add('suspended', 'in_verification', 'hr');
add('expired', 'in_verification', 'hr');
add('denied', 'applicant', 'hr');
add('approved', 'expired', 'system');
add('conditional', 'expired', 'system');

/**
 * Suspension can be taken by HR or the clinical approver. The map above
 * cannot hold two caps for one edge, so suspension is special-cased.
 */
const DUAL_SUSPEND = new Set(['approved>suspended', 'conditional>suspended']);

export function capsFor(actor: TransitionActor): Set<Cap> {
  if (actor === 'system') return new Set(['system']);
  if (actor === 'credentialing_admin' || actor === 'admin') return new Set(['hr']);
  if (actor === 'clinical_approver') return new Set(['clinical']);
  return new Set();
}

export function isPanelStatus(value: string): value is IroPanelStatus {
  return (IRO_PANEL_STATUSES as readonly string[]).includes(value);
}

export interface TransitionDecision {
  ok: boolean;
  code?: 'unknown_status' | 'forbidden_transition' | 'wrong_actor' | 'verification_incomplete';
  responsibility: string;
  needsVerification: boolean;
}

export function evaluateTransition(
  from: IroPanelStatus,
  to: string,
  actor: TransitionActor,
  verificationGaps: readonly string[],
): TransitionDecision {
  const responsibility = isPanelStatus(to) ? STEP_RESPONSIBILITY[to] : STEP_RESPONSIBILITY[from];
  if (!isPanelStatus(to)) {
    return { ok: false, code: 'unknown_status', responsibility, needsVerification: false };
  }
  const key = `${from}>${to}`;
  const edge = TRANSITIONS[key];
  if (!edge && !DUAL_SUSPEND.has(key)) {
    return { ok: false, code: 'forbidden_transition', responsibility, needsVerification: false };
  }
  const caps = capsFor(actor);
  const allowed =
    DUAL_SUSPEND.has(key) ? caps.has('hr') || caps.has('clinical') : edge ? caps.has(edge.cap) : false;
  if (!allowed) {
    return { ok: false, code: 'wrong_actor', responsibility, needsVerification: Boolean(edge?.needsVerification) };
  }
  if (edge?.needsVerification && verificationGaps.length > 0) {
    return { ok: false, code: 'verification_incomplete', responsibility, needsVerification: true };
  }
  return { ok: true, responsibility, needsVerification: Boolean(edge?.needsVerification) };
}
