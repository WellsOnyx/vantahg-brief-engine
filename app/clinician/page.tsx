'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import type { Case, ServiceCategory, Staff } from '@/lib/types';
import type { DayPlan } from '@/lib/clinician/day-planner';
import { StatusBadge, PriorityBadge } from '@/components/StatusBadge';
import { SlaTracker } from '@/components/SlaTracker';
import { PageDashboard, PageHero } from '@/components/layouts/PageLayouts';
import { SectionCard } from '@/components/SectionCard';
import { EmptyState } from '@/components/EmptyState';
import { MetricValue } from '@/components/MetricValue';

const serviceCategoryLabels: Partial<Record<ServiceCategory, string>> = {
  imaging: 'Imaging', surgery: 'Surgery', specialty_referral: 'Specialty Referral',
  dme: 'DME', infusion: 'Infusion', behavioral_health: 'Behavioral Health',
  rehab_therapy: 'Rehab Therapy', home_health: 'Home Health',
  skilled_nursing: 'Skilled Nursing', transplant: 'Transplant',
  genetic_testing: 'Genetic Testing', pain_management: 'Pain Management',
  cardiology: 'Cardiology', oncology: 'Oncology', other: 'Other',
};

interface QualitySummary {
  audit_count: number;
  avg_overall_score: number | null;
  sla_compliance_rate: number | null;
  last_audit_at: string | null;
}

interface ClinicianSummary {
  staff: Staff;
  plan: DayPlan<Case>;
  quality: QualitySummary;
}

const feasibilityCopy: Record<DayPlan['feasibility'], { title: string; banner: string; classes: string }> = {
  on_track: {
    title: 'Your day is on track.',
    banner: 'Worked in this order, every case in your queue lands before its deadline.',
    classes: 'bg-green-50 border-green-200 text-green-800',
  },
  tight: {
    title: 'Today is tight.',
    banner: 'Every deadline is reachable, but your thinnest margin is under an hour. Work the plan in order.',
    classes: 'bg-amber-50 border-amber-200 text-amber-800',
  },
  at_risk: {
    title: 'SLA risk ahead.',
    banner: 'Even in the optimal order, at least one case is projected to miss its deadline. Flag your Delivery Lead for reassignment.',
    classes: 'bg-red-50 border-red-200 text-red-800',
  },
};

function formatHours(hours: number): string {
  const sign = hours < 0 ? '-' : '';
  const abs = Math.abs(hours);
  const h = Math.floor(abs);
  const m = Math.round((abs - h) * 60);
  if (h === 0) return `${sign}${m}m`;
  return `${sign}${h}h ${m}m`;
}

function formatClock(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function slackBadge(slack: number | null, miss: boolean) {
  if (slack === null) {
    return <span className="text-xs text-muted">No deadline</span>;
  }
  const classes = miss
    ? 'bg-red-50 text-red-700 border-red-200'
    : slack < 1
      ? 'bg-amber-50 text-amber-700 border-amber-200'
      : 'bg-green-50 text-green-700 border-green-200';
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border ${classes}`}>
      {miss ? `${formatHours(slack)} late` : `${formatHours(slack)} slack`}
    </span>
  );
}

export default function ClinicianDashboardPage() {
  const [clinicians, setClinicians] = useState<Staff[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [summary, setSummary] = useState<ClinicianSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load the clinician roster once; default to the first LPN.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/staff');
        if (!res.ok) throw new Error('Failed to load staff roster');
        const data: Staff[] = await res.json();
        const eligible = data.filter(
          (s) => (s.role === 'lpn' || s.role === 'rn') && s.status === 'active'
        );
        if (cancelled) return;
        setClinicians(eligible);
        setSelectedId((prev) => prev ?? eligible[0]?.id ?? null);
        if (eligible.length === 0) {
          setLoading(false);
          setError('No active LPN or RN staff found.');
        }
      } catch (err) {
        if (!cancelled) {
          setLoading(false);
          setError(err instanceof Error ? err.message : 'Failed to load staff roster');
        }
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const fetchSummary = useCallback(async (staffId: string) => {
    setError(null);
    try {
      const res = await fetch(`/api/clinician/summary?staff_id=${encodeURIComponent(staffId)}`);
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? 'Failed to load day plan');
      }
      setSummary(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load day plan');
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch on selection + refresh every 60s, same cadence as /queue.
  useEffect(() => {
    if (!selectedId) return;
    setLoading(true);
    fetchSummary(selectedId);
    const interval = setInterval(() => fetchSummary(selectedId), 60_000);
    return () => clearInterval(interval);
  }, [selectedId, fetchSummary]);

  const plan = summary?.plan ?? null;
  const feasibility = plan ? feasibilityCopy[plan.feasibility] : null;
  const nextCase = plan?.ordered[0] ?? null;
  const firstName = summary?.staff.name.split(/[\s,]/)[0] ?? null;

  return (
    <PageDashboard
      hero={
        <PageHero
          eyebrow="My day"
          title={feasibility && !loading ? feasibility.title : 'Plan the shift.'}
          subtitle={
            firstName && plan
              ? `${firstName} — ${plan.capacity.active_count} active case${plan.capacity.active_count === 1 ? '' : 's'} projected at ${formatHours(plan.turnaround_hours)} each. Refreshes every 60 seconds.`
              : 'Your queue, projected onto the clock: work order, finish times, and whether every deadline is reachable.'
          }
          actions={
            <Link href="/queue" className="text-sm text-white/80 hover:text-gold transition-colors">
              Full queue &rarr;
            </Link>
          }
        />
      }
    >
      <SectionCard eyebrow="Clinician" title="Viewing as">
        <div className="flex flex-wrap gap-2">
          {clinicians.map((s) => (
            <button
              key={s.id}
              onClick={() => setSelectedId(s.id)}
              className={`px-3 py-1.5 text-sm rounded-full border transition-all ${
                selectedId === s.id
                  ? 'bg-navy text-white border-navy'
                  : 'bg-surface text-foreground border-border hover:border-navy/30'
              }`}
            >
              {s.name}
            </button>
          ))}
        </div>
      </SectionCard>

      {error && !loading && (
        <SectionCard>
          <div className="flex items-start justify-between gap-4">
            <p className="text-sm text-foreground">{error}</p>
            {selectedId && (
              <button onClick={() => { setLoading(true); fetchSummary(selectedId); }} className="btn-primary text-sm">
                Retry
              </button>
            )}
          </div>
        </SectionCard>
      )}

      {loading && (
        <SectionCard padding="p-0">
          <div className="animate-pulse p-6 space-y-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4">
                <div className="w-8 h-8 rounded-full bg-muted/20" />
                <div className="w-24 h-4 rounded bg-muted/20" />
                <div className="w-40 h-4 rounded bg-muted/20" />
                <div className="flex-1" />
                <div className="w-20 h-6 rounded-full bg-muted/20" />
              </div>
            ))}
          </div>
        </SectionCard>
      )}

      {!loading && !error && plan && summary && (
        <>
          {/* Feasibility verdict */}
          <div className={`rounded-xl border px-6 py-4 ${feasibility!.classes}`}>
            <p className="text-sm font-medium">
              {feasibility!.banner}
              {plan.assumed_turnaround && (
                <span className="font-normal opacity-80">
                  {' '}Projections use an assumed pace of {formatHours(plan.turnaround_hours)} per case — no turnaround history yet.
                </span>
              )}
            </p>
          </div>

          {/* Stat row */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 stagger-children">
            <StatCard label="In my plan" value={plan.capacity.active_count} />
            <StatCard
              label="Projected misses"
              value={plan.projected_misses}
              alert={plan.projected_misses > 0}
            />
            <StatCard
              label="Thinnest margin"
              value={plan.min_slack_hours === null ? '--' : formatHours(plan.min_slack_hours)}
              alert={plan.min_slack_hours !== null && plan.min_slack_hours < 0}
            />
            <StatCard label="Projected work" value={formatHours(plan.total_projected_hours)} />
            <StatCard
              label="Quality score"
              value={summary.quality.avg_overall_score === null ? '--' : `${summary.quality.avg_overall_score}%`}
            />
          </div>

          {/* Capacity bar */}
          {plan.capacity.max_cases_per_day !== null && (
            <SectionCard eyebrow="Capacity" title={`${plan.capacity.active_count} of ${plan.capacity.max_cases_per_day} daily cases`}>
              <div className="h-3 rounded-full bg-muted/15 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    (plan.capacity.utilization ?? 0) >= 1
                      ? 'bg-red-400'
                      : (plan.capacity.utilization ?? 0) >= 0.75
                        ? 'bg-amber-400'
                        : 'bg-green-400'
                  }`}
                  style={{ width: `${Math.min(100, (plan.capacity.utilization ?? 0) * 100)}%` }}
                />
              </div>
            </SectionCard>
          )}

          {/* Up next */}
          {nextCase && (
            <SectionCard eyebrow="Up next" title={nextCase.case.case_number}>
              <div className="flex flex-wrap items-center gap-4">
                <div className="flex-1 min-w-[200px]">
                  <p className="text-sm text-foreground">
                    {nextCase.case.patient_name ?? 'Unknown patient'}
                    {nextCase.case.service_category && (
                      <span className="text-muted">
                        {' '}&middot; {serviceCategoryLabels[nextCase.case.service_category] ?? nextCase.case.service_category}
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-muted mt-1">
                    Projected finish {formatClock(nextCase.projected_finish_at)}
                    {nextCase.slack_hours !== null && <> &middot; {formatHours(nextCase.slack_hours)} {nextCase.projected_miss ? 'past deadline' : 'of slack'}</>}
                  </p>
                </div>
                {nextCase.case.turnaround_deadline && (
                  <SlaTracker deadline={nextCase.case.turnaround_deadline} compact />
                )}
                <Link href={`/cases/${nextCase.case.id}`} className="btn-primary text-sm">
                  Start review
                </Link>
              </div>
            </SectionCard>
          )}

          {/* Day plan table */}
          <SectionCard eyebrow="The plan" title="Recommended work order" padding="p-0">
            {plan.ordered.length === 0 ? (
              <div className="p-6">
                <EmptyState
                  title="Nothing on your plate."
                  body="No active cases are assigned to you right now. New assignments appear here automatically."
                />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border bg-muted/5 text-left text-xs uppercase tracking-wide text-muted">
                      <th className="px-4 py-3 font-semibold">#</th>
                      <th className="px-4 py-3 font-semibold">Case</th>
                      <th className="px-4 py-3 font-semibold hidden md:table-cell">Status</th>
                      <th className="px-4 py-3 font-semibold hidden sm:table-cell">Priority</th>
                      <th className="px-4 py-3 font-semibold">Deadline</th>
                      <th className="px-4 py-3 font-semibold">Proj. finish</th>
                      <th className="px-4 py-3 font-semibold">Margin</th>
                      <th className="px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {plan.ordered.map((p) => (
                      <tr key={p.case.id} className={p.projected_miss ? 'bg-red-50/40' : undefined}>
                        <td className="px-4 py-3 text-sm font-semibold text-muted">{p.position}</td>
                        <td className="px-4 py-3">
                          <Link href={`/cases/${p.case.id}`} className="font-semibold text-navy text-sm hover:text-gold-dark transition-colors">
                            {p.case.case_number}
                          </Link>
                          <div className="text-xs text-muted truncate max-w-[180px]">
                            {p.case.patient_name ?? 'Unknown patient'}
                          </div>
                        </td>
                        <td className="px-4 py-3 hidden md:table-cell"><StatusBadge status={p.case.status} /></td>
                        <td className="px-4 py-3 hidden sm:table-cell"><PriorityBadge priority={p.case.priority} /></td>
                        <td className="px-4 py-3">
                          {p.case.turnaround_deadline
                            ? <SlaTracker deadline={p.case.turnaround_deadline} compact />
                            : <span className="text-xs text-muted">--</span>}
                        </td>
                        <td className="px-4 py-3 text-sm text-foreground whitespace-nowrap">{formatClock(p.projected_finish_at)}</td>
                        <td className="px-4 py-3">{slackBadge(p.slack_hours, p.projected_miss)}</td>
                        <td className="px-4 py-3 text-right">
                          <Link href={`/cases/${p.case.id}`} className="text-sm text-navy hover:text-gold-dark font-medium transition-colors">
                            Review &rarr;
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </SectionCard>

          {/* Quality corner */}
          <SectionCard eyebrow="Quality" title="My audit standing">
            {summary.quality.audit_count === 0 ? (
              <p className="text-sm text-muted">No completed quality audits yet.</p>
            ) : (
              <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
                <div>
                  <div className="text-2xl font-bold text-navy">
                    <MetricValue value={summary.quality.avg_overall_score} />%
                  </div>
                  <div className="text-xs text-muted uppercase tracking-wide mt-0.5">Avg score</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-navy">
                    {Math.round((summary.quality.sla_compliance_rate ?? 0) * 100)}%
                  </div>
                  <div className="text-xs text-muted uppercase tracking-wide mt-0.5">SLA compliance</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-navy">
                    <MetricValue value={summary.quality.audit_count} />
                  </div>
                  <div className="text-xs text-muted uppercase tracking-wide mt-0.5">Audits completed</div>
                </div>
                <div className="flex-1" />
                <Link href="/quality" className="text-sm text-navy hover:text-gold-dark font-medium transition-colors">
                  Quality dashboard &rarr;
                </Link>
              </div>
            )}
          </SectionCard>
        </>
      )}
    </PageDashboard>
  );
}

function StatCard({ label, value, alert = false }: { label: string; value: number | string; alert?: boolean }) {
  return (
    <div className={`rounded-xl border p-5 transition-all hover:shadow-md ${alert ? 'bg-red-50 border-red-200' : 'bg-surface border-border'}`}>
      <div className={`text-3xl tracking-tight ${alert ? 'text-red-700 font-bold' : 'text-navy'}`}>
        {typeof value === 'number' ? <MetricValue value={value} /> : value}
      </div>
      <div className={`text-sm font-medium mt-1 ${alert ? 'text-red-600' : 'text-muted'}`}>{label}</div>
    </div>
  );
}
