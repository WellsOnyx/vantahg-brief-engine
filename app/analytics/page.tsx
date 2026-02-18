'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { Case, Reviewer, CaseStatus } from '@/lib/types';
import { getTimeRemaining } from '@/lib/sla-calculator';

// ============================================================================
// Label maps
// ============================================================================

const SERVICE_CATEGORY_LABELS: Record<string, string> = {
  imaging: 'Imaging',
  surgery: 'Surgery',
  specialty_referral: 'Specialty Referral',
  dme: 'DME',
  infusion: 'Infusion',
  behavioral_health: 'Behavioral Health',
  rehab_therapy: 'Rehab Therapy',
  home_health: 'Home Health',
  skilled_nursing: 'Skilled Nursing',
  transplant: 'Transplant',
  genetic_testing: 'Genetic Testing',
  pain_management: 'Pain Management',
  cardiology: 'Cardiology',
  oncology: 'Oncology',
  other: 'Other',
};

const STATUS_LABELS: Record<CaseStatus, string> = {
  intake: 'Intake',
  processing: 'Processing',
  brief_ready: 'Brief Ready',
  in_review: 'In Review',
  determination_made: 'Determination',
  delivered: 'Delivered',
};

const STATUS_COLORS: Record<CaseStatus, string> = {
  intake: 'bg-blue-500',
  processing: 'bg-yellow-500',
  brief_ready: 'bg-green-500',
  in_review: 'bg-purple-500',
  determination_made: 'bg-teal-500',
  delivered: 'bg-emerald-600',
};

const DETERMINATION_LABELS: Record<string, string> = {
  approve: 'Approve',
  deny: 'Deny',
  partial_approve: 'Partial Approve',
  modify: 'Modify',
  pend: 'Pend',
  peer_to_peer_requested: 'Peer-to-Peer',
};

const DETERMINATION_COLORS: Record<string, string> = {
  approve: 'bg-green-500',
  deny: 'bg-red-500',
  partial_approve: 'bg-amber-500',
  modify: 'bg-amber-500',
  pend: 'bg-amber-500',
  peer_to_peer_requested: 'bg-amber-500',
};

const DETERMINATION_TEXT_COLORS: Record<string, string> = {
  approve: 'text-green-700',
  deny: 'text-red-700',
  partial_approve: 'text-amber-700',
  modify: 'text-amber-700',
  pend: 'text-amber-700',
  peer_to_peer_requested: 'text-amber-700',
};

// ============================================================================
// Pipeline statuses in order
// ============================================================================

const PIPELINE_STATUSES: CaseStatus[] = [
  'intake',
  'processing',
  'brief_ready',
  'in_review',
  'determination_made',
  'delivered',
];

// ============================================================================
// Metric calculation helpers
// ============================================================================

function computeMetrics(cases: Case[], reviewers: Reviewer[]) {
  const totalCases = cases.length;

  // Average turnaround: for cases with determination, compute created_at -> determination_at
  const casesWithDetermination = cases.filter(
    (c) => c.determination_at && c.created_at
  );
  let avgTurnaroundHours = 0;
  if (casesWithDetermination.length > 0) {
    const totalHours = casesWithDetermination.reduce((sum, c) => {
      const created = new Date(c.created_at).getTime();
      const determined = new Date(c.determination_at!).getTime();
      return sum + (determined - created) / (1000 * 60 * 60);
    }, 0);
    avgTurnaroundHours = totalHours / casesWithDetermination.length;
  }

  // SLA compliance: for cases with determination, check if determination was before deadline
  let slaCompliance = 0;
  if (casesWithDetermination.length > 0) {
    const onTimeCount = casesWithDetermination.filter((c) => {
      if (!c.turnaround_deadline) return true;
      const deadline = new Date(c.turnaround_deadline).getTime();
      const determined = new Date(c.determination_at!).getTime();
      return determined <= deadline;
    }).length;
    slaCompliance = (onTimeCount / casesWithDetermination.length) * 100;
  }

  // Approval rate: among cases with a determination
  const casesWithOutcome = cases.filter((c) => c.determination);
  let approvalRate = 0;
  if (casesWithOutcome.length > 0) {
    const approvedCount = casesWithOutcome.filter(
      (c) => c.determination === 'approve' || c.determination === 'partial_approve'
    ).length;
    approvalRate = (approvedCount / casesWithOutcome.length) * 100;
  }

  // Cases by service category
  const categoryMap: Record<string, number> = {};
  cases.forEach((c) => {
    const cat = c.service_category || 'other';
    categoryMap[cat] = (categoryMap[cat] || 0) + 1;
  });
  const categoryCounts = Object.entries(categoryMap)
    .map(([key, count]) => ({
      key,
      label: SERVICE_CATEGORY_LABELS[key] || key,
      count,
    }))
    .sort((a, b) => b.count - a.count);

  // Cases by status (pipeline)
  const statusMap: Record<CaseStatus, number> = {
    intake: 0,
    processing: 0,
    brief_ready: 0,
    in_review: 0,
    determination_made: 0,
    delivered: 0,
  };
  cases.forEach((c) => {
    if (statusMap[c.status] !== undefined) {
      statusMap[c.status]++;
    }
  });

  // Determination outcomes
  const determinationMap: Record<string, number> = {};
  casesWithOutcome.forEach((c) => {
    const det = c.determination!;
    determinationMap[det] = (determinationMap[det] || 0) + 1;
  });
  const determinationCounts = Object.entries(determinationMap)
    .map(([key, count]) => ({
      key,
      label: DETERMINATION_LABELS[key] || key,
      count,
      percentage: casesWithOutcome.length > 0 ? (count / casesWithOutcome.length) * 100 : 0,
    }))
    .sort((a, b) => b.count - a.count);

  // Reviewer performance
  const reviewerPerformance = reviewers
    .filter((r) => r.status === 'active')
    .map((r) => {
      const reviewerCases = cases.filter(
        (c) => c.assigned_reviewer_id === r.id && c.determination_at
      );
      let reviewerAvgTurnaround = r.avg_turnaround_hours || 0;
      if (reviewerCases.length > 0) {
        const totalHrs = reviewerCases.reduce((sum, c) => {
          const created = new Date(c.created_at).getTime();
          const determined = new Date(c.determination_at!).getTime();
          return sum + (determined - created) / (1000 * 60 * 60);
        }, 0);
        reviewerAvgTurnaround = totalHrs / reviewerCases.length;
      }
      let reviewerSlaCompliance = 100;
      if (reviewerCases.length > 0) {
        const onTime = reviewerCases.filter((c) => {
          if (!c.turnaround_deadline) return true;
          return new Date(c.determination_at!).getTime() <= new Date(c.turnaround_deadline).getTime();
        }).length;
        reviewerSlaCompliance = (onTime / reviewerCases.length) * 100;
      }
      return {
        id: r.id,
        name: r.name,
        credentials: r.credentials,
        specialty: r.specialty,
        casesCompleted: r.cases_completed,
        avgTurnaroundHours: reviewerAvgTurnaround,
        slaCompliance: reviewerSlaCompliance,
      };
    })
    .sort((a, b) => b.casesCompleted - a.casesCompleted);

  // SLA performance
  const activeCasesWithDeadlines = cases.filter(
    (c) =>
      c.turnaround_deadline &&
      c.status !== 'determination_made' &&
      c.status !== 'delivered'
  );
  const casesAtRisk = activeCasesWithDeadlines.filter((c) => {
    const tr = getTimeRemaining(c.turnaround_deadline!);
    return tr.isAtRisk;
  });

  let onTimeCount = 0;
  let lateCount = 0;
  casesWithDetermination.forEach((c) => {
    if (!c.turnaround_deadline) {
      onTimeCount++;
      return;
    }
    const deadline = new Date(c.turnaround_deadline).getTime();
    const determined = new Date(c.determination_at!).getTime();
    if (determined <= deadline) {
      onTimeCount++;
    } else {
      lateCount++;
    }
  });

  return {
    totalCases,
    avgTurnaroundHours,
    slaCompliance,
    approvalRate,
    categoryCounts,
    statusMap,
    determinationCounts,
    casesWithOutcome: casesWithOutcome.length,
    reviewerPerformance,
    slaPerformance: {
      onTime: onTimeCount,
      late: lateCount,
      avgTimeToDetermination: avgTurnaroundHours,
      casesAtRisk: casesAtRisk.length,
      totalActiveCases: activeCasesWithDeadlines.length,
    },
  };
}

// ============================================================================
// Component
// ============================================================================

export default function AnalyticsPage() {
  const [cases, setCases] = useState<Case[]>([]);
  const [reviewers, setReviewers] = useState<Reviewer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      setError(null);
      try {
        const [casesRes, reviewersRes] = await Promise.all([
          fetch('/api/cases'),
          fetch('/api/reviewers'),
        ]);
        if (!casesRes.ok) throw new Error('Failed to load cases');
        if (!reviewersRes.ok) throw new Error('Failed to load reviewers');
        const casesData = await casesRes.json();
        const reviewersData = await reviewersRes.json();
        setCases(Array.isArray(casesData) ? casesData : []);
        setReviewers(Array.isArray(reviewersData) ? reviewersData : []);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load data');
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  const metrics = computeMetrics(cases, reviewers);

  // Find max values for bar scaling
  const maxCategoryCount = Math.max(...metrics.categoryCounts.map((c) => c.count), 1);
  const maxStatusCount = Math.max(...Object.values(metrics.statusMap), 1);

  return (
    <div className="py-10 md:py-16 bg-background min-h-screen">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* ============================================================ */}
        {/* Header                                                       */}
        {/* ============================================================ */}
        <div className="mb-10">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h1 className="font-[family-name:var(--font-dm-serif)] text-3xl md:text-4xl text-navy">
                Analytics &amp; Reporting
              </h1>
              <p className="text-muted mt-1 text-lg">
                Utilization review performance metrics
              </p>
            </div>
            <Link
              href="/"
              className="inline-flex items-center gap-2 text-sm font-medium text-muted hover:text-navy transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Back to Dashboard
            </Link>
          </div>
        </div>

        {/* Error state */}
        {error && (
          <div className="mb-8 bg-surface rounded-xl border border-red-200 shadow-sm p-6">
            <div className="flex items-center gap-3">
              <svg className="w-5 h-5 text-red-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
              </svg>
              <p className="text-sm text-red-700">{error}</p>
            </div>
          </div>
        )}

        {/* ============================================================ */}
        {/* Summary Cards                                                */}
        {/* ============================================================ */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6 mb-10">
          {/* Total Cases */}
          <div className="bg-surface rounded-xl border border-border p-6 shadow-sm">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-lg bg-navy/10 flex items-center justify-center">
                <svg className="w-5 h-5 text-navy" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
                </svg>
              </div>
              <span className="text-sm font-medium text-muted">Total Cases</span>
            </div>
            <div className="text-3xl font-bold text-navy tracking-tight">
              {loading ? <span className="skeleton inline-block w-12 h-8 rounded" /> : metrics.totalCases}
            </div>
          </div>

          {/* Average Turnaround */}
          <div className="bg-surface rounded-xl border border-border p-6 shadow-sm">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-lg bg-gold/10 flex items-center justify-center">
                <svg className="w-5 h-5 text-gold-dark" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <span className="text-sm font-medium text-muted">Avg Turnaround</span>
            </div>
            <div className="text-3xl font-bold text-navy tracking-tight">
              {loading ? (
                <span className="skeleton inline-block w-16 h-8 rounded" />
              ) : (
                <>
                  {metrics.avgTurnaroundHours.toFixed(1)}
                  <span className="text-base font-medium text-muted ml-1">hrs</span>
                </>
              )}
            </div>
          </div>

          {/* SLA Compliance */}
          <div className="bg-surface rounded-xl border border-border p-6 shadow-sm">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-lg bg-green-50 flex items-center justify-center">
                <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <span className="text-sm font-medium text-muted">SLA Compliance</span>
            </div>
            <div className="text-3xl font-bold text-navy tracking-tight">
              {loading ? (
                <span className="skeleton inline-block w-14 h-8 rounded" />
              ) : (
                <>
                  {metrics.slaCompliance.toFixed(0)}
                  <span className="text-base font-medium text-muted ml-0.5">%</span>
                </>
              )}
            </div>
          </div>

          {/* Approval Rate */}
          <div className="bg-surface rounded-xl border border-border p-6 shadow-sm">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-lg bg-teal-50 flex items-center justify-center">
                <svg className="w-5 h-5 text-teal-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6.633 10.5c.806 0 1.533-.446 2.031-1.08a9.041 9.041 0 012.861-2.4c.723-.384 1.35-.956 1.653-1.715a4.498 4.498 0 00.322-1.672V3a.75.75 0 01.75-.75A2.25 2.25 0 0116.5 4.5c0 1.152-.26 2.243-.723 3.218-.266.558.107 1.282.725 1.282h3.126c1.026 0 1.945.694 2.054 1.715.045.422.068.85.068 1.285a11.95 11.95 0 01-2.649 7.521c-.388.482-.987.729-1.605.729H14.23c-.483 0-.964-.078-1.423-.23l-3.114-1.04a4.501 4.501 0 00-1.423-.23H5.904M14.25 9h2.25M5.904 18.75c.083.205.173.405.27.602.197.4-.078.898-.523.898h-.908c-.889 0-1.713-.518-1.972-1.368a12 12 0 01-.521-3.507c0-1.553.295-3.036.831-4.398C3.387 10.089 4.17 9.75 4.992 9.75H5.9" />
                </svg>
              </div>
              <span className="text-sm font-medium text-muted">Approval Rate</span>
            </div>
            <div className="text-3xl font-bold text-navy tracking-tight">
              {loading ? (
                <span className="skeleton inline-block w-14 h-8 rounded" />
              ) : (
                <>
                  {metrics.approvalRate.toFixed(0)}
                  <span className="text-base font-medium text-muted ml-0.5">%</span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* ============================================================ */}
        {/* Two-column layout: Service Category + Pipeline               */}
        {/* ============================================================ */}
        <div className="grid lg:grid-cols-2 gap-6 md:gap-8 mb-10">
          {/* Cases by Service Category */}
          <div className="bg-surface rounded-xl border border-border shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-border bg-gray-50/30">
              <div className="flex items-center gap-3">
                <svg className="w-5 h-5 text-navy/60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
                </svg>
                <h3 className="font-semibold text-lg text-navy">Cases by Service Category</h3>
              </div>
            </div>
            <div className="p-6">
              {loading ? (
                <div className="space-y-4">
                  {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="flex items-center gap-4">
                      <div className="skeleton w-28 h-4 rounded" />
                      <div className="skeleton flex-1 h-6 rounded" />
                      <div className="skeleton w-8 h-4 rounded" />
                    </div>
                  ))}
                </div>
              ) : metrics.categoryCounts.length === 0 ? (
                <p className="text-muted text-sm text-center py-8">No case data available</p>
              ) : (
                <div className="space-y-4">
                  {metrics.categoryCounts.map((cat, index) => (
                    <div key={cat.key} className="flex items-center gap-4">
                      <div className="w-32 text-sm font-medium text-foreground truncate flex-shrink-0">
                        {cat.label}
                      </div>
                      <div className="flex-1 h-7 bg-border/40 rounded overflow-hidden relative">
                        <div
                          className="h-full rounded transition-all duration-700 ease-out"
                          style={{
                            width: `${(cat.count / maxCategoryCount) * 100}%`,
                            background: index % 2 === 0
                              ? 'var(--color-navy)'
                              : 'var(--color-gold)',
                            animationDelay: `${index * 100}ms`,
                          }}
                        />
                      </div>
                      <div className="w-8 text-sm font-bold text-navy text-right flex-shrink-0">
                        {cat.count}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Cases by Status (Pipeline) */}
          <div className="bg-surface rounded-xl border border-border shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-border bg-gray-50/30">
              <div className="flex items-center gap-3">
                <svg className="w-5 h-5 text-navy/60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 4.5h14.25M3 9h9.75M3 13.5h5.25m5.25-.75L17.25 9m0 0L21 12.75M17.25 9v12" />
                </svg>
                <h3 className="font-semibold text-lg text-navy">Cases by Status</h3>
              </div>
            </div>
            <div className="p-6">
              {loading ? (
                <div className="space-y-4">
                  {[1, 2, 3, 4, 5, 6].map((i) => (
                    <div key={i} className="flex items-center gap-4">
                      <div className="skeleton w-28 h-4 rounded" />
                      <div className="skeleton flex-1 h-6 rounded" />
                      <div className="skeleton w-8 h-4 rounded" />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="space-y-3">
                  {PIPELINE_STATUSES.map((status, index) => {
                    const count = metrics.statusMap[status];
                    return (
                      <div key={status}>
                        {/* Arrow connector between stages */}
                        {index > 0 && (
                          <div className="flex justify-center -mt-1 mb-1">
                            <svg className="w-4 h-4 text-border" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                            </svg>
                          </div>
                        )}
                        <div className="flex items-center gap-4">
                          <div className="w-28 text-sm font-medium text-foreground truncate flex-shrink-0">
                            {STATUS_LABELS[status]}
                          </div>
                          <div className="flex-1 h-7 bg-border/40 rounded overflow-hidden">
                            <div
                              className={`h-full rounded transition-all duration-700 ease-out ${STATUS_COLORS[status]}`}
                              style={{
                                width: count > 0 ? `${(count / maxStatusCount) * 100}%` : '0%',
                              }}
                            />
                          </div>
                          <div className="w-8 text-sm font-bold text-navy text-right flex-shrink-0">
                            {count}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ============================================================ */}
        {/* Reviewer Performance Table                                   */}
        {/* ============================================================ */}
        <div className="bg-surface rounded-xl border border-border shadow-sm overflow-hidden mb-10">
          <div className="px-6 py-4 border-b border-border bg-gray-50/30">
            <div className="flex items-center gap-3">
              <svg className="w-5 h-5 text-navy/60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
              </svg>
              <h3 className="font-semibold text-lg text-navy">Reviewer Performance</h3>
            </div>
          </div>
          {loading ? (
            <div className="p-6 space-y-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex items-center gap-4">
                  <div className="skeleton w-40 h-4 rounded" />
                  <div className="skeleton w-20 h-4 rounded" />
                  <div className="skeleton w-20 h-4 rounded" />
                  <div className="skeleton w-20 h-4 rounded" />
                </div>
              ))}
            </div>
          ) : metrics.reviewerPerformance.length === 0 ? (
            <div className="p-8 text-center">
              <p className="text-muted text-sm">No reviewer data available</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border">
                    <th className="px-6 py-3.5 text-left text-xs font-semibold text-muted uppercase tracking-wider">
                      Reviewer
                    </th>
                    <th className="px-6 py-3.5 text-left text-xs font-semibold text-muted uppercase tracking-wider hidden sm:table-cell">
                      Specialty
                    </th>
                    <th className="px-6 py-3.5 text-right text-xs font-semibold text-muted uppercase tracking-wider">
                      Cases Completed
                    </th>
                    <th className="px-6 py-3.5 text-right text-xs font-semibold text-muted uppercase tracking-wider">
                      Avg Turnaround
                    </th>
                    <th className="px-6 py-3.5 text-right text-xs font-semibold text-muted uppercase tracking-wider">
                      SLA Compliance
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {metrics.reviewerPerformance.map((reviewer) => (
                    <tr key={reviewer.id} className="table-row-hover">
                      <td className="px-6 py-4">
                        <div className="font-medium text-foreground text-sm">{reviewer.name}</div>
                        <div className="text-xs text-muted mt-0.5">{reviewer.credentials}</div>
                      </td>
                      <td className="px-6 py-4 text-sm text-muted hidden sm:table-cell">
                        {reviewer.specialty || '--'}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <span className="text-sm font-semibold text-navy">
                          {reviewer.casesCompleted.toLocaleString()}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <span className="text-sm font-medium text-foreground">
                          {reviewer.avgTurnaroundHours.toFixed(1)}h
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                            reviewer.slaCompliance >= 95
                              ? 'bg-green-50 text-green-700 border border-green-200'
                              : reviewer.slaCompliance >= 80
                              ? 'bg-amber-50 text-amber-700 border border-amber-200'
                              : 'bg-red-50 text-red-700 border border-red-200'
                          }`}
                        >
                          {reviewer.slaCompliance.toFixed(0)}%
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* ============================================================ */}
        {/* Two-column layout: Determination Outcomes + SLA Performance  */}
        {/* ============================================================ */}
        <div className="grid lg:grid-cols-2 gap-6 md:gap-8">
          {/* Determination Outcomes */}
          <div className="bg-surface rounded-xl border border-border shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-border bg-gray-50/30">
              <div className="flex items-center gap-3">
                <svg className="w-5 h-5 text-navy/60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.125 2.25h-4.5c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125v-9M10.125 2.25h.375a9 9 0 019 9v.375M10.125 2.25A3.375 3.375 0 0113.5 5.625v1.5c0 .621.504 1.125 1.125 1.125h1.5a3.375 3.375 0 013.375 3.375M9 15l2.25 2.25L15 12" />
                </svg>
                <h3 className="font-semibold text-lg text-navy">Determination Outcomes</h3>
                {!loading && metrics.casesWithOutcome > 0 && (
                  <span className="text-xs text-muted ml-auto">
                    {metrics.casesWithOutcome} total determination{metrics.casesWithOutcome !== 1 ? 's' : ''}
                  </span>
                )}
              </div>
            </div>
            <div className="p-6">
              {loading ? (
                <div className="space-y-4">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="flex items-center gap-4">
                      <div className="skeleton w-24 h-4 rounded" />
                      <div className="skeleton flex-1 h-6 rounded" />
                      <div className="skeleton w-10 h-4 rounded" />
                    </div>
                  ))}
                </div>
              ) : metrics.determinationCounts.length === 0 ? (
                <p className="text-muted text-sm text-center py-8">No determinations made yet</p>
              ) : (
                <div className="space-y-4">
                  {metrics.determinationCounts.map((det) => (
                    <div key={det.key}>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className={`text-sm font-semibold ${DETERMINATION_TEXT_COLORS[det.key] || 'text-foreground'}`}>
                          {det.label}
                        </span>
                        <span className="text-sm font-medium text-muted">
                          {det.count} ({det.percentage.toFixed(0)}%)
                        </span>
                      </div>
                      <div className="h-5 bg-border/40 rounded overflow-hidden">
                        <div
                          className={`h-full rounded transition-all duration-700 ease-out ${DETERMINATION_COLORS[det.key] || 'bg-gray-400'}`}
                          style={{ width: `${det.percentage}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* SLA Performance */}
          <div className="bg-surface rounded-xl border border-border shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-border bg-gray-50/30">
              <div className="flex items-center gap-3">
                <svg className="w-5 h-5 text-navy/60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <h3 className="font-semibold text-lg text-navy">SLA Performance</h3>
              </div>
            </div>
            <div className="p-6">
              {loading ? (
                <div className="space-y-6">
                  {[1, 2, 3].map((i) => (
                    <div key={i}>
                      <div className="skeleton w-32 h-4 rounded mb-2" />
                      <div className="skeleton w-20 h-8 rounded" />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="space-y-6">
                  {/* On-time vs Late */}
                  <div>
                    <div className="text-sm font-medium text-muted mb-3">Completion Breakdown</div>
                    <div className="flex items-center gap-4 mb-3">
                      <div className="flex-1">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm font-medium text-green-700">On-Time</span>
                          <span className="text-sm font-bold text-green-700">{metrics.slaPerformance.onTime}</span>
                        </div>
                        <div className="h-5 bg-border/40 rounded overflow-hidden">
                          <div
                            className="h-full bg-green-500 rounded transition-all duration-700 ease-out"
                            style={{
                              width:
                                metrics.slaPerformance.onTime + metrics.slaPerformance.late > 0
                                  ? `${(metrics.slaPerformance.onTime / (metrics.slaPerformance.onTime + metrics.slaPerformance.late)) * 100}%`
                                  : '0%',
                            }}
                          />
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="flex-1">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm font-medium text-red-700">Late</span>
                          <span className="text-sm font-bold text-red-700">{metrics.slaPerformance.late}</span>
                        </div>
                        <div className="h-5 bg-border/40 rounded overflow-hidden">
                          <div
                            className="h-full bg-red-500 rounded transition-all duration-700 ease-out"
                            style={{
                              width:
                                metrics.slaPerformance.onTime + metrics.slaPerformance.late > 0
                                  ? `${(metrics.slaPerformance.late / (metrics.slaPerformance.onTime + metrics.slaPerformance.late)) * 100}%`
                                  : '0%',
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Avg Time to Determination */}
                  <div className="pt-4 border-t border-border">
                    <div className="text-sm font-medium text-muted mb-2">Avg Time to Determination</div>
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-2xl font-bold text-navy">
                        {metrics.slaPerformance.avgTimeToDetermination.toFixed(1)}
                      </span>
                      <span className="text-sm font-medium text-muted">hours</span>
                    </div>
                  </div>

                  {/* Cases at Risk */}
                  <div className="pt-4 border-t border-border">
                    <div className="text-sm font-medium text-muted mb-2">Active Cases at Risk</div>
                    <div className="flex items-center gap-3">
                      <span
                        className={`text-2xl font-bold ${
                          metrics.slaPerformance.casesAtRisk > 0 ? 'text-red-600' : 'text-green-600'
                        }`}
                      >
                        {metrics.slaPerformance.casesAtRisk}
                      </span>
                      <span className="text-sm text-muted">
                        of {metrics.slaPerformance.totalActiveCases} active case{metrics.slaPerformance.totalActiveCases !== 1 ? 's' : ''}
                      </span>
                    </div>
                    {metrics.slaPerformance.casesAtRisk > 0 && (
                      <div className="mt-2">
                        <Link
                          href="/"
                          className="text-sm font-medium text-gold-dark hover:text-gold transition-colors inline-flex items-center gap-1"
                        >
                          View in Dashboard
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                          </svg>
                        </Link>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
