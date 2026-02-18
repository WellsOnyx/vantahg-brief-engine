'use client';

import { useState } from 'react';
import type { AuditLogEntry } from '@/lib/types';

interface AuditTimelineProps {
  entries: AuditLogEntry[];
}

function formatTimestamp(dateStr: string): { date: string; time: string } {
  const d = new Date(dateStr);
  return {
    date: d.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }),
    time: d.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    }),
  };
}

function actionIcon(action: string): string {
  const lower = action.toLowerCase();
  if (lower.includes('create') || lower.includes('submit')) return 'create';
  if (lower.includes('assign') || lower.includes('reviewer')) return 'assign';
  if (lower.includes('brief') || lower.includes('generate')) return 'brief';
  if (lower.includes('determin') || lower.includes('decision')) return 'determination';
  if (lower.includes('deliver') || lower.includes('send')) return 'deliver';
  if (lower.includes('update') || lower.includes('edit')) return 'update';
  return 'default';
}

function ActionIcon({ action }: { action: string }) {
  const type = actionIcon(action);

  const iconMap: Record<string, { bg: string; ring: string; icon: React.ReactNode }> = {
    create: {
      bg: 'bg-blue-500',
      ring: 'ring-blue-100',
      icon: (
        <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
        </svg>
      ),
    },
    assign: {
      bg: 'bg-purple-500',
      ring: 'ring-purple-100',
      icon: (
        <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0" />
        </svg>
      ),
    },
    brief: {
      bg: 'bg-green-500',
      ring: 'ring-green-100',
      icon: (
        <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
        </svg>
      ),
    },
    determination: {
      bg: 'bg-teal-500',
      ring: 'ring-teal-100',
      icon: (
        <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
    },
    deliver: {
      bg: 'bg-emerald-500',
      ring: 'ring-emerald-100',
      icon: (
        <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
        </svg>
      ),
    },
    update: {
      bg: 'bg-amber-500',
      ring: 'ring-amber-100',
      icon: (
        <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" />
        </svg>
      ),
    },
    default: {
      bg: 'bg-gray-400',
      ring: 'ring-gray-100',
      icon: (
        <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
    },
  };

  const { bg, ring, icon } = iconMap[type] || iconMap.default;

  return (
    <div className={`w-8 h-8 rounded-full flex items-center justify-center ${bg} ring-4 ${ring} shrink-0 relative z-10`}>
      {icon}
    </div>
  );
}

function TimelineEntry({ entry, index }: { entry: AuditLogEntry; index: number }) {
  const [expanded, setExpanded] = useState(false);
  const { date, time } = formatTimestamp(entry.created_at);
  const hasDetails = entry.details && Object.keys(entry.details).length > 0;

  return (
    <div
      className="relative flex gap-4 pb-8 last:pb-0 group animate-stagger-in"
      style={{ animationDelay: `${index * 80}ms` }}
    >
      {/* Connecting vertical line */}
      <div className="absolute left-[15px] top-10 bottom-0 w-0.5 bg-gradient-to-b from-border to-border/30 group-last:hidden" />

      <ActionIcon action={entry.action} />

      <div className="flex-1 min-w-0 pt-1">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <p className="text-sm font-semibold text-foreground">{entry.action}</p>
          {entry.actor && (
            <span className="text-xs text-muted bg-gray-100 px-1.5 py-0.5 rounded">
              {entry.actor}
            </span>
          )}
        </div>

        <p className="text-xs text-muted mt-1 flex items-center gap-1.5">
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          {date} at {time}
        </p>

        {hasDetails && (
          <div className="mt-2">
            <button
              onClick={() => setExpanded(!expanded)}
              className="text-xs text-gold-dark hover:text-gold font-medium inline-flex items-center gap-1 transition-colors"
            >
              <svg
                className={`w-3 h-3 transition-transform duration-200 ${expanded ? 'rotate-90' : ''}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
              </svg>
              {expanded ? 'Hide details' : 'Show details'}
            </button>

            {expanded && (
              <div className="mt-2 p-3 bg-gray-50 rounded-lg border border-border text-xs font-mono text-foreground overflow-x-auto animate-fade-in">
                <pre className="whitespace-pre-wrap break-words">
                  {JSON.stringify(entry.details, null, 2)}
                </pre>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export function AuditTimeline({ entries }: AuditTimelineProps) {
  if (entries.length === 0) {
    return (
      <div className="text-center py-12 text-sm text-muted bg-surface rounded-xl border border-border">
        <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-gray-100 flex items-center justify-center">
          <svg className="w-6 h-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        No audit events recorded yet.
      </div>
    );
  }

  // Sort entries newest first
  const sorted = [...entries].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  return (
    <div className="bg-surface rounded-xl border border-border p-6 shadow-sm">
      <div className="flex items-center gap-2.5 mb-5">
        <div className="w-8 h-8 rounded-lg bg-navy/10 flex items-center justify-center">
          <svg className="w-4 h-4 text-navy" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <h3 className="font-[family-name:var(--font-dm-serif)] text-lg text-foreground">
          Audit Trail
        </h3>
        <span className="text-xs text-muted bg-gray-100 px-2 py-0.5 rounded-full font-medium">
          {sorted.length} event{sorted.length !== 1 ? 's' : ''}
        </span>
      </div>
      <div className="stagger-children">
        {sorted.map((entry, index) => (
          <TimelineEntry key={entry.id} entry={entry} index={index} />
        ))}
      </div>
    </div>
  );
}
