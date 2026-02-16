'use client';

import type { CaseStatus, CasePriority } from '@/lib/types';

const statusLabels: Record<CaseStatus, string> = {
  intake: 'Intake',
  processing: 'Processing',
  brief_ready: 'Brief Ready',
  in_review: 'In Review',
  determination_made: 'Determination Made',
  delivered: 'Delivered',
};

interface StatusBadgeProps {
  status: CaseStatus;
}

export function StatusBadge({ status }: StatusBadgeProps) {
  return (
    <span
      className={`status-${status} inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold tracking-wide`}
    >
      {statusLabels[status]}
    </span>
  );
}

const priorityLabels: Record<CasePriority, string> = {
  standard: 'Standard',
  urgent: 'Urgent',
  expedited: 'Expedited',
};

interface PriorityBadgeProps {
  priority: CasePriority;
}

export function PriorityBadge({ priority }: PriorityBadgeProps) {
  return (
    <span
      className={`priority-${priority} inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold tracking-wide`}
    >
      {priorityLabels[priority]}
    </span>
  );
}
