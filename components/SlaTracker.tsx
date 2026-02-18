'use client';

import { useState, useEffect, useMemo } from 'react';
import { getTimeRemaining, formatTimeRemaining, getSlaStatus } from '@/lib/sla-calculator';
import type { UrgencyLevel } from '@/lib/sla-calculator';

interface SlaTrackerProps {
  deadline: string | Date;
  compact?: boolean;
  createdAt?: string | Date;
}

const urgencyStyles: Record<UrgencyLevel, {
  pill: string;
  bar: string;
  icon: string;
  pulse: boolean;
}> = {
  ok: {
    pill: 'bg-green-50 text-green-700 border border-green-200',
    bar: 'bg-green-500',
    icon: 'text-green-600',
    pulse: false,
  },
  caution: {
    pill: 'bg-blue-50 text-blue-700 border border-blue-200',
    bar: 'bg-blue-500',
    icon: 'text-blue-600',
    pulse: false,
  },
  warning: {
    pill: 'bg-amber-50 text-amber-700 border border-amber-200',
    bar: 'bg-amber-500',
    icon: 'text-amber-600',
    pulse: false,
  },
  critical: {
    pill: 'bg-red-50 text-red-700 border border-red-200',
    bar: 'bg-red-500',
    icon: 'text-red-600',
    pulse: true,
  },
  overdue: {
    pill: 'bg-red-100 text-red-900 border border-red-300',
    bar: 'bg-red-700',
    icon: 'text-red-800',
    pulse: true,
  },
};

function ClockIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

export function SlaTracker({ deadline, compact = false, createdAt }: SlaTrackerProps) {
  const [now, setNow] = useState(() => new Date());

  // Update every minute
  useEffect(() => {
    const interval = setInterval(() => {
      setNow(new Date());
    }, 60_000);
    return () => clearInterval(interval);
  }, []);

  const timeRemaining = useMemo(() => getTimeRemaining(deadline), [deadline, now]);
  const formatted = useMemo(() => formatTimeRemaining(timeRemaining), [timeRemaining]);
  const status = useMemo(() => getSlaStatus(deadline), [deadline, now]);
  const style = urgencyStyles[timeRemaining.urgencyLevel];

  // Calculate progress for full mode
  const progress = useMemo(() => {
    if (!createdAt) return null;
    const created = new Date(createdAt).getTime();
    const deadlineMs = new Date(deadline).getTime();
    const nowMs = now.getTime();
    const total = deadlineMs - created;
    if (total <= 0) return 100;
    const elapsed = nowMs - created;
    const pct = Math.min(100, Math.max(0, (elapsed / total) * 100));
    return Math.round(pct);
  }, [createdAt, deadline, now]);

  // ── Compact Mode: pill badge ──
  if (compact) {
    return (
      <span
        className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold tracking-wide whitespace-nowrap ${style.pill} ${style.pulse ? 'animate-pulse' : ''}`}
        title={`SLA: ${formatted}`}
      >
        <ClockIcon className={`w-3 h-3 ${style.icon}`} />
        {timeRemaining.hours > 0 ? `${timeRemaining.hours}h ${timeRemaining.minutes}m` : `${timeRemaining.minutes}m`}
        {timeRemaining.isOverdue && (
          <span className="text-[10px] font-bold uppercase">OD</span>
        )}
      </span>
    );
  }

  // ── Full Mode: progress bar + countdown ──
  return (
    <div className={`rounded-lg border p-3 ${style.pulse ? 'animate-pulse' : ''} ${status.bgColor} ${status.borderColor}`}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <ClockIcon className={`w-4 h-4 ${style.icon}`} />
          <span className={`text-xs font-semibold uppercase tracking-wide ${status.color}`}>
            {status.label}
          </span>
        </div>
        <span className={`text-sm font-bold ${status.color}`}>
          {formatted}
        </span>
      </div>

      {/* Progress bar */}
      {progress !== null && (
        <div className="w-full bg-white/60 rounded-full h-1.5 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${style.bar}`}
            style={{ width: `${Math.min(progress, 100)}%` }}
          />
        </div>
      )}

      {progress !== null && (
        <div className="flex items-center justify-between mt-1.5">
          <span className="text-[10px] text-muted">Created</span>
          <span className={`text-[10px] font-medium ${status.color}`}>
            {progress >= 100 ? 'Past deadline' : `${progress}% elapsed`}
          </span>
          <span className="text-[10px] text-muted">Deadline</span>
        </div>
      )}
    </div>
  );
}
