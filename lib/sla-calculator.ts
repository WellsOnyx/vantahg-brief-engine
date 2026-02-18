import type { ReviewType, CasePriority } from './types';

// ============================================================================
// SLA rules by review type (hours)
// ============================================================================

const SLA_DEFAULTS: Record<string, Record<CasePriority, number>> = {
  prior_auth: { standard: 120, urgent: 24, expedited: 48 },       // 5 business days / 24hr / 48hr
  medical_necessity: { standard: 120, urgent: 24, expedited: 48 },
  concurrent: { standard: 24, urgent: 24, expedited: 24 },         // 24hr for all concurrent
  retrospective: { standard: 720, urgent: 720, expedited: 720 },   // 30 days
  peer_to_peer: { standard: 24, urgent: 24, expedited: 24 },
  appeal: { standard: 720, urgent: 72, expedited: 72 },            // 30 days / 72hr expedited
  second_level_review: { standard: 120, urgent: 48, expedited: 48 },
};

// ============================================================================
// Types
// ============================================================================

export type UrgencyLevel = 'overdue' | 'critical' | 'warning' | 'caution' | 'ok';

export interface TimeRemaining {
  hours: number;
  minutes: number;
  totalMinutes: number;
  isOverdue: boolean;
  isAtRisk: boolean;
  urgencyLevel: UrgencyLevel;
}

export interface SlaStatus {
  level: UrgencyLevel;
  label: string;
  color: string;
  bgColor: string;
  borderColor: string;
}

// ============================================================================
// Core Functions
// ============================================================================

/**
 * Calculate the SLA deadline for a case.
 * Uses client SLA hours if provided; otherwise falls back to review-type defaults.
 * Priority overrides for urgent/expedited cases.
 */
export function calculateDeadline(
  createdAt: string | Date,
  reviewType: ReviewType | null,
  priority: CasePriority,
  clientSlaHours?: number | null,
): Date {
  const created = new Date(createdAt);

  let slaHours: number;

  if (clientSlaHours && clientSlaHours > 0) {
    // Client-contracted SLA takes precedence for standard priority
    slaHours = clientSlaHours;

    // But urgent/expedited priority overrides if the default is shorter
    if (priority !== 'standard' && reviewType) {
      const defaultHours = SLA_DEFAULTS[reviewType]?.[priority];
      if (defaultHours && defaultHours < slaHours) {
        slaHours = defaultHours;
      }
    }
  } else if (reviewType && SLA_DEFAULTS[reviewType]) {
    slaHours = SLA_DEFAULTS[reviewType][priority];
  } else {
    // Fallback: 120 hours (5 business days)
    slaHours = 120;
  }

  const deadline = new Date(created.getTime() + slaHours * 60 * 60 * 1000);
  return deadline;
}

/**
 * Get time remaining until deadline with urgency classification.
 */
export function getTimeRemaining(deadline: string | Date): TimeRemaining {
  const deadlineDate = new Date(deadline);
  const now = new Date();
  const diffMs = deadlineDate.getTime() - now.getTime();
  const totalMinutes = Math.floor(diffMs / (1000 * 60));
  const isOverdue = diffMs < 0;
  const absTotalMinutes = Math.abs(totalMinutes);
  const hours = Math.floor(absTotalMinutes / 60);
  const minutes = absTotalMinutes % 60;

  const hoursRemaining = totalMinutes / 60;
  let urgencyLevel: UrgencyLevel;

  if (isOverdue) {
    urgencyLevel = 'overdue';
  } else if (hoursRemaining < 4) {
    urgencyLevel = 'critical';
  } else if (hoursRemaining < 12) {
    urgencyLevel = 'warning';
  } else if (hoursRemaining < 24) {
    urgencyLevel = 'caution';
  } else {
    urgencyLevel = 'ok';
  }

  const isAtRisk = urgencyLevel === 'critical' || urgencyLevel === 'warning' || urgencyLevel === 'overdue';

  return {
    hours,
    minutes,
    totalMinutes,
    isOverdue,
    isAtRisk,
    urgencyLevel,
  };
}

/**
 * Format time remaining as a human-readable string.
 */
export function formatTimeRemaining(timeRemaining: TimeRemaining): string {
  const { hours, minutes, isOverdue } = timeRemaining;

  if (hours === 0 && minutes === 0) {
    return isOverdue ? 'Just overdue' : 'Due now';
  }

  const parts: string[] = [];
  if (hours > 0) {
    parts.push(`${hours}h`);
  }
  parts.push(`${minutes}m`);

  const timeStr = parts.join(' ');

  if (isOverdue) {
    return `${timeStr} overdue`;
  }
  return `${timeStr} remaining`;
}

/**
 * Get SLA status with color mapping for UI rendering.
 */
export function getSlaStatus(deadline: string | Date): SlaStatus {
  const timeRemaining = getTimeRemaining(deadline);

  const statusMap: Record<UrgencyLevel, SlaStatus> = {
    ok: {
      level: 'ok',
      label: 'On Track',
      color: 'text-green-700',
      bgColor: 'bg-green-50',
      borderColor: 'border-green-200',
    },
    caution: {
      level: 'caution',
      label: 'Due Soon',
      color: 'text-blue-700',
      bgColor: 'bg-blue-50',
      borderColor: 'border-blue-200',
    },
    warning: {
      level: 'warning',
      label: 'At Risk',
      color: 'text-amber-700',
      bgColor: 'bg-amber-50',
      borderColor: 'border-amber-200',
    },
    critical: {
      level: 'critical',
      label: 'Critical',
      color: 'text-red-700',
      bgColor: 'bg-red-50',
      borderColor: 'border-red-200',
    },
    overdue: {
      level: 'overdue',
      label: 'Overdue',
      color: 'text-red-900',
      bgColor: 'bg-red-100',
      borderColor: 'border-red-300',
    },
  };

  return statusMap[timeRemaining.urgencyLevel];
}

/**
 * Get the default SLA hours for a given review type and priority.
 */
export function getDefaultSlaHours(
  reviewType: ReviewType | null,
  priority: CasePriority,
): number {
  if (reviewType && SLA_DEFAULTS[reviewType]) {
    return SLA_DEFAULTS[reviewType][priority];
  }
  return 120; // fallback
}
