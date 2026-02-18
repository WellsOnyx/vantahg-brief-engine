'use client';

import type { CaseStatus, CasePriority } from '@/lib/types';

const statusConfig: Record<CaseStatus, { label: string; icon: string }> = {
  intake: { label: 'Intake', icon: '\u25CF' },
  processing: { label: 'Processing', icon: '\u231B' },
  brief_ready: { label: 'Brief Ready', icon: '\u2713' },
  in_review: { label: 'In Review', icon: '\u25CF' },
  determination_made: { label: 'Determination Made', icon: '\u2713' },
  delivered: { label: 'Delivered', icon: '\u2713' },
};

interface StatusBadgeProps {
  status: CaseStatus;
}

export function StatusBadge({ status }: StatusBadgeProps) {
  const config = statusConfig[status];

  return (
    <span
      className={`status-${status} inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold tracking-wide transition-all duration-300 animate-scale-in`}
    >
      <span className="text-[10px] leading-none" aria-hidden="true">
        {config.icon}
      </span>
      {config.label}
    </span>
  );
}

const priorityConfig: Record<CasePriority, { label: string; icon: string }> = {
  standard: { label: 'Standard', icon: '\u25CF' },
  urgent: { label: 'Urgent', icon: '\u25CF' },
  expedited: { label: 'Expedited', icon: '\u25CF' },
};

interface PriorityBadgeProps {
  priority: CasePriority;
}

export function PriorityBadge({ priority }: PriorityBadgeProps) {
  const config = priorityConfig[priority];

  return (
    <span
      className={`priority-${priority} inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold tracking-wide transition-all duration-300 animate-scale-in`}
    >
      <span className="text-[8px] leading-none" aria-hidden="true">
        {config.icon}
      </span>
      {config.label}
    </span>
  );
}
