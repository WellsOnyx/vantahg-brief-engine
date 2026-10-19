import { DEFAULT_IRO_ACCESS_POLICY } from '@/lib/iro/config/access-policy';

/**
 * IRO activation uses the existing four panel approvers.
 * Replacing a name is a change to that policy, not a second list here.
 */
export const IRO_ACTIVATION_APPROVERS = DEFAULT_IRO_ACCESS_POLICY.panel_approvers;

/**
 * Medical Review activation is not a counted panel.
 * TODO: keep the existing rule in lib/assignment-engine.ts
 * (reviewer status active, service-category match, daily capacity).
 * Do not set an approval count in this file.
 */
export const MEDICAL_REVIEW_ACTIVATION = {
  kind: 'pluggable' as const,
  required_approver_count: null,
  rule_ref: 'lib/assignment-engine.ts' as const,
};

/**
 * Sagility reads the shared record. It is not a fourth case line.
 * TODO: Sagility's own activation rule is not written. Do not invent a count.
 */
export const SAGILITY_ACTIVATION = {
  kind: 'pluggable' as const,
  required_approver_count: null,
  rule_ref: null,
};

/**
 * Decision (f), vendor versus delegated credentialing, is open.
 * Items store either source. This object does not pick one.
 */
export const CREDENTIALING_RUNTIME = {
  vendor: null,
  live_call: false,
  source_decision: 'open' as const,
};
