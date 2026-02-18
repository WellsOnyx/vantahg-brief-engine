/**
 * Data retention policy definitions for SOC 2 + HIPAA compliance.
 *
 * These constants codify how long each category of data is retained.
 * Future cron/cleanup jobs can reference these to purge expired records.
 */

export interface RetentionPolicy {
  days: number;
  description: string;
}

export const RETENTION_POLICIES = {
  cases: { days: 2555, description: '7 years (HIPAA requirement)' } as RetentionPolicy,
  audit_log: { days: 2555, description: '7 years (SOC 2 + HIPAA)' } as RetentionPolicy,
  session_logs: { days: 365, description: '1 year' } as RetentionPolicy,
  temp_uploads: { days: 30, description: '30 days after processing' } as RetentionPolicy,
} as const;

export type RetentionPolicyKey = keyof typeof RETENTION_POLICIES;

/**
 * Returns true if a record created at `createdAt` is still within its
 * retention window for the given policy.
 */
export function isWithinRetention(
  createdAt: Date,
  policyKey: RetentionPolicyKey
): boolean {
  const policy = RETENTION_POLICIES[policyKey];
  const deadline = new Date(createdAt);
  deadline.setDate(deadline.getDate() + policy.days);
  return new Date() < deadline;
}

/**
 * Returns the date after which records of this type are eligible for
 * deletion/archival.  Records created *before* this date have exceeded
 * the retention window and may be purged.
 */
export function getRetentionDeadline(policyKey: RetentionPolicyKey): Date {
  const policy = RETENTION_POLICIES[policyKey];
  const deadline = new Date();
  deadline.setDate(deadline.getDate() - policy.days);
  return deadline;
}
