'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import Link from 'next/link';
import type { Case, CasePriority, ServiceCategory, QueueRole, QueueMeta } from '@/lib/types';
import { StatusBadge, PriorityBadge } from '@/components/StatusBadge';
import { SlaTracker } from '@/components/SlaTracker';
import { getTimeRemaining, type UrgencyLevel } from '@/lib/sla-calculator';
import { PageList, PageHero } from '@/components/layouts/PageLayouts';
import { SectionCard } from '@/components/SectionCard';
import { EmptyState } from '@/components/EmptyState';
import { MetricValue } from '@/components/MetricValue';

// ── Label & color maps ──

const serviceCategoryLabels: Record<ServiceCategory, string> = {
  imaging: 'Imaging', surgery: 'Surgery', specialty_referral: 'Specialty Referral',
  dme: 'DME', infusion: 'Infusion', behavioral_health: 'Behavioral Health',
  rehab_therapy: 'Rehab Therapy', home_health: 'Home Health',
  skilled_nursing: 'Skilled Nursing', transplant: 'Transplant',
  genetic_testing: 'Genetic Testing', pain_management: 'Pain Management',
  cardiology: 'Cardiology', oncology: 'Oncology', ophthalmology: 'Ophthalmology',
  workers_comp: 'Workers Comp', emergency_medicine: 'Emergency Medicine',
  internal_medicine: 'Internal Medicine', other: 'Other',
};

const serviceCategoryColors: Record<ServiceCategory, string> = {
  imaging: 'bg-blue-50 text-blue-700', surgery: 'bg-red-50 text-red-700',
  specialty_referral: 'bg-violet-50 text-violet-700', dme: 'bg-amber-50 text-amber-700',
  infusion: 'bg-teal-50 text-teal-700', behavioral_health: 'bg-purple-50 text-purple-700',
  rehab_therapy: 'bg-green-50 text-green-700', home_health: 'bg-cyan-50 text-cyan-700',
  skilled_nursing: 'bg-indigo-50 text-indigo-700', transplant: 'bg-rose-50 text-rose-700',
  genetic_testing: 'bg-fuchsia-50 text-fuchsia-700', pain_management: 'bg-orange-50 text-orange-700',
  cardiology: 'bg-pink-50 text-pink-700', oncology: 'bg-yellow-50 text-yellow-800',
  ophthalmology: 'bg-sky-50 text-sky-700', workers_comp: 'bg-stone-50 text-stone-700',
  emergency_medicine: 'bg-red-50 text-red-800', internal_medicine: 'bg-emerald-50 text-emerald-700',
  other: 'bg-gray-50 text-gray-700',
};

const urgencyDotColors: Record<UrgencyLevel, string> = {
  overdue: 'bg-red-500 animate-pulse',
  critical: 'bg-red-400',
  warning: 'bg-amber-400',
  caution: 'bg-blue-400',
  ok: 'bg-green-400',
};

const urgencyOrder: Record<UrgencyLevel, number> = {
  overdue: 0, critical: 1, warning: 2, caution: 3, ok: 4,
};

const priorityOrder: Record<CasePriority, number> = {
  urgent: 0, expedited: 1, standard: 2,
};

// ── Demo persona definitions ──

interface Persona {
  label: string;
  role: QueueRole;
  staff_id?: string;
  reviewer_id?: string;
}

const DEMO_PERSONAS: Persona[] = [
  { label: 'Admin (All)', role: 'admin' },
  { label: 'Rosa Martinez (LPN)', role: 'lpn', staff_id: 'staff-001-rosa-martinez-lpn' },
  { label: 'Tamika Jones (LPN)', role: 'lpn', staff_id: 'staff-002-tamika-jones-lpn' },
  { label: 'Michelle Carter (RN)', role: 'rn', staff_id: 'staff-004-michelle-carter-rn' },
  { label: 'Patricia Brown (RN)', role: 'rn', staff_id: 'staff-005-patricia-brown-rn' },
  { label: 'Dr. Richardson (MD)', role: 'md', reviewer_id: 'rev-001-james-richardson' },
  { label: 'Dr. Patel (MD)', role: 'md', reviewer_id: 'rev-002-priya-patel' },
  { label: 'Dr. Torres (MD)', role: 'md', reviewer_id: 'rev-003-michael-torres' },
];

// ── Helpers ──

function getQuickAction(c: Case): { label: string; href: string } {
  if (c.status === 'md_review') {
    return { label: 'Determine', href: `/cases/${c.id}/determination` };
  }
  return { label: 'Review', href: `/cases/${c.id}` };
}

function formatAvgTime(cases: Case[]): string {
  const withDeadlines = cases.filter((c) => c.turnaround_deadline);
  if (withDeadlines.length === 0) return '--';
  const totalMin = withDeadlines.reduce((sum, c) => {
    const tr = getTimeRemaining(c.turnaround_deadline!);
    return sum + Math.max(0, tr.totalMinutes);
  }, 0);
  const avgMin = totalMin / withDeadlines.length;
  const hours = Math.floor(avgMin / 60);
  const mins = Math.round(avgMin % 60);
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

// ── Page Component ──

export default function QueuePage() {
  const [cases, setCases] = useState<Case[]>([]);
  const [meta, setMeta] = useState<QueueMeta>({ total: 0, overdue_count: 0, critical_count: 0, completed_today: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedPersona, setSelectedPersona] = useState<Persona>(DEMO_PERSONAS[0]);

  const fetchQueue = useCallback(async () => {
    try {
      const params = new URLSearchParams({ role: selectedPersona.role });
      if (selectedPersona.staff_id) params.set('staff_id', selectedPersona.staff_id);
      if (selectedPersona.reviewer_id) params.set('reviewer_id', selectedPersona.reviewer_id);

      const res = await fetch(`/api/queue?${params}`);
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      setCases(data.cases ?? []);
      setMeta(data.meta ?? { total: 0, overdue_count: 0, critical_count: 0, completed_today: 0 });
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load queue');
    } finally {
      setLoading(false);
    }
  }, [selectedPersona]);

  // Fetch on mount and when persona changes
  useEffect(() => {
    setLoading(true);
    fetchQueue();
  }, [fetchQueue]);

  // Auto-refresh every 60 seconds
  useEffect(() => {
    const interval = setInterval(fetchQueue, 60_000);
    return () => clearInterval(interval);
  }, [fetchQueue]);

  // Sort cases by urgency then priority
  const sortedCases = useMemo(() => {
    return [...cases].sort((a, b) => {
      const aUrgency = a.turnaround_deadline
        ? getTimeRemaining(a.turnaround_deadline).urgencyLevel
        : 'ok';
      const bUrgency = b.turnaround_deadline
        ? getTimeRemaining(b.turnaround_deadline).urgencyLevel
        : 'ok';
      const urgDiff = urgencyOrder[aUrgency] - urgencyOrder[bUrgency];
      if (urgDiff !== 0) return urgDiff;
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    });
  }, [cases]);

  return (
    <PageList
      hero={
        <PageHero
          eyebrow="My queue"
          title="Your cases, in order of urgency."
          subtitle="Auto-refreshes every 60 seconds. Sort by SLA urgency, then case priority."
          actions={
            <Link href="/cases" className="text-sm text-white/80 hover:text-gold transition-colors">
              View all cases &rarr;
            </Link>
          }
        />
      }
    >
      <SectionCard eyebrow="Demo" title="Viewing as">
        <div className="flex flex-wrap gap-2">
          {DEMO_PERSONAS.map((persona) => (
            <button
              key={persona.label}
              onClick={() => setSelectedPersona(persona)}
              className={`px-3 py-1.5 text-sm rounded-full border transition-all ${
                selectedPersona.label === persona.label
                  ? 'bg-navy text-white border-navy'
                  : 'bg-surface text-foreground border-border hover:border-navy/30'
              }`}
            >
              {persona.label}
            </button>
          ))}
        </div>
      </SectionCard>

      <PageList.Stats>
        <QueueStatCard label="In queue" value={meta.total} />
        <QueueStatCard label="Overdue" value={meta.overdue_count} alert={meta.overdue_count > 0} />
        <QueueStatCard label="Critical" value={meta.critical_count} alert={meta.critical_count > 0} />
        <QueueStatCard label="Avg time left" value={formatAvgTime(cases)} />
      </PageList.Stats>

      {loading && (
        <SectionCard padding="p-0">
          <div className="animate-pulse">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 p-4 border-b border-border last:border-b-0">
                <div className="w-2.5 h-2.5 rounded-full bg-muted/30" />
                <div className="w-24 h-4 rounded bg-muted/20" />
                <div className="w-32 h-4 rounded bg-muted/20" />
                <div className="flex-1" />
                <div className="w-16 h-6 rounded-full bg-muted/20" />
                <div className="w-20 h-6 rounded-full bg-muted/20" />
              </div>
            ))}
          </div>
        </SectionCard>
      )}

      {error && !loading && (
        <SectionCard>
          <div className="flex items-start justify-between gap-4">
            <p className="text-sm text-foreground">{error}</p>
            <button
              onClick={() => { setLoading(true); fetchQueue(); }}
              className="btn-primary text-sm"
            >
              Retry
            </button>
          </div>
        </SectionCard>
      )}

      {!loading && !error && sortedCases.length === 0 && (
        <EmptyState
          title="The queue is quiet."
          body="No cases require your attention right now. The list refreshes every 60 seconds."
        />
      )}

      {!loading && !error && sortedCases.length > 0 && (
        <>
          <div className="hidden md:block bg-surface rounded-xl border border-border overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border bg-muted/5">
                    <th className="text-left text-xs font-medium text-muted uppercase tracking-wider px-4 py-3 w-8"></th>
                    <th className="text-left text-xs font-medium text-muted uppercase tracking-wider px-4 py-3">Case</th>
                    <th className="text-left text-xs font-medium text-muted uppercase tracking-wider px-4 py-3">Patient</th>
                    <th className="text-left text-xs font-medium text-muted uppercase tracking-wider px-4 py-3">Category</th>
                    <th className="text-left text-xs font-medium text-muted uppercase tracking-wider px-4 py-3 hidden lg:table-cell">Procedure</th>
                    <th className="text-left text-xs font-medium text-muted uppercase tracking-wider px-4 py-3">Priority</th>
                    <th className="text-left text-xs font-medium text-muted uppercase tracking-wider px-4 py-3">Status</th>
                    <th className="text-left text-xs font-medium text-muted uppercase tracking-wider px-4 py-3">SLA</th>
                    <th className="text-left text-xs font-medium text-muted uppercase tracking-wider px-4 py-3 w-28"></th>
                  </tr>
                </thead>
                <tbody>
                  {sortedCases.map((c) => {
                    const urgency = c.turnaround_deadline
                      ? getTimeRemaining(c.turnaround_deadline).urgencyLevel
                      : 'ok';
                    const action = getQuickAction(c);
                    return (
                      <tr
                        key={c.id}
                        className="border-b border-border last:border-b-0 hover:bg-muted/5 transition-colors"
                      >
                        {/* Urgency dot */}
                        <td className="px-4 py-3">
                          <span className={`inline-block w-2.5 h-2.5 rounded-full ${urgencyDotColors[urgency]}`} />
                        </td>
                        {/* Case # */}
                        <td className="px-4 py-3">
                          <Link
                            href={`/cases/${c.id}`}
                            className="text-sm font-medium text-navy hover:text-gold transition-colors"
                          >
                            {c.case_number}
                          </Link>
                        </td>
                        {/* Patient */}
                        <td className="px-4 py-3 text-sm text-foreground">
                          {c.patient_name || '—'}
                        </td>
                        {/* Category */}
                        <td className="px-4 py-3">
                          {c.service_category && (
                            <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${serviceCategoryColors[c.service_category]}`}>
                              {serviceCategoryLabels[c.service_category]}
                            </span>
                          )}
                        </td>
                        {/* Procedure (lg only) */}
                        <td className="px-4 py-3 text-sm text-muted hidden lg:table-cell max-w-[200px] truncate">
                          {c.procedure_description
                            ? c.procedure_description.length > 50
                              ? c.procedure_description.slice(0, 50) + '…'
                              : c.procedure_description
                            : '—'}
                        </td>
                        {/* Priority */}
                        <td className="px-4 py-3">
                          <PriorityBadge priority={c.priority} />
                        </td>
                        {/* Status */}
                        <td className="px-4 py-3">
                          <StatusBadge status={c.status} />
                        </td>
                        {/* SLA */}
                        <td className="px-4 py-3">
                          {c.turnaround_deadline && (
                            <SlaTracker deadline={c.turnaround_deadline} compact />
                          )}
                        </td>
                        {/* Action */}
                        <td className="px-4 py-3">
                          <Link
                            href={action.href}
                            className="inline-flex items-center px-3 py-1.5 text-xs font-medium rounded-lg bg-navy text-white hover:bg-navy/90 transition-colors"
                          >
                            {action.label} &rarr;
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile Cards */}
            <div className="md:hidden space-y-3">
              {sortedCases.map((c) => {
                const urgency = c.turnaround_deadline
                  ? getTimeRemaining(c.turnaround_deadline).urgencyLevel
                  : 'ok';
                const action = getQuickAction(c);
                return (
                  <div
                    key={c.id}
                    className="bg-surface rounded-xl border border-border p-4"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className={`inline-block w-2.5 h-2.5 rounded-full ${urgencyDotColors[urgency]}`} />
                        <Link
                          href={`/cases/${c.id}`}
                          className="text-sm font-medium text-navy hover:text-gold"
                        >
                          {c.case_number}
                        </Link>
                      </div>
                      <StatusBadge status={c.status} />
                    </div>
                    <p className="text-sm text-foreground mb-1">{c.patient_name || '—'}</p>
                    <div className="flex items-center gap-2 mb-3">
                      <PriorityBadge priority={c.priority} />
                      {c.service_category && (
                        <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${serviceCategoryColors[c.service_category]}`}>
                          {serviceCategoryLabels[c.service_category]}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center justify-between">
                      {c.turnaround_deadline && (
                        <SlaTracker deadline={c.turnaround_deadline} compact />
                      )}
                      <Link
                        href={action.href}
                        className="inline-flex items-center px-3 py-1.5 text-xs font-medium rounded-lg bg-navy text-white hover:bg-navy/90 transition-colors"
                      >
                        {action.label} &rarr;
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>

          {/* Footer */}
          <div className="mt-4 text-sm text-muted text-center">
            Showing {sortedCases.length} case{sortedCases.length !== 1 ? 's' : ''} &middot; Auto-refreshes every 60s
          </div>
        </>
      )}
    </PageList>
  );
}

// ── QueueStatCard ──
// Local card that pipes the value through MetricValue so 0 renders as
// em-dash ("zero is not broken"). String values (like "2h 14m") pass
// through unchanged via the MetricValue showZero path.

function QueueStatCard({
  label,
  value,
  alert,
}: {
  label: string;
  value: number | string;
  alert?: boolean;
}) {
  return (
    <div className={`rounded-xl border p-4 ${alert ? 'bg-red-50 border-red-200' : 'bg-surface border-border'}`}>
      <p className={`text-[10px] uppercase tracking-[0.12em] font-semibold ${alert ? 'text-red-600' : 'text-muted'}`}>
        {label}
      </p>
      <p className="text-3xl mt-1">
        {typeof value === 'string' && value !== '--' ? (
          <span className={`font-[family-name:var(--font-display)] ${alert ? 'text-red-700' : 'text-navy'}`}>
            {value}
          </span>
        ) : (
          <MetricValue value={typeof value === 'string' ? null : value} />
        )}
      </p>
    </div>
  );
}
