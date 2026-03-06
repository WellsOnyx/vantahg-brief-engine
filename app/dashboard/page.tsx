'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { CaseTable } from '@/components/CaseTable';
import { SlaTracker } from '@/components/SlaTracker';
import { getTimeRemaining } from '@/lib/sla-calculator';
import type { Case, CaseStatus } from '@/lib/types';

const statusCards: { status: CaseStatus; label: string; color: string; icon: React.ReactNode }[] = [
  {
    status: 'intake',
    label: 'Intake',
    color: 'bg-blue-50 text-blue-800 border-blue-200',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v6m3-3H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  {
    status: 'processing',
    label: 'Processing',
    color: 'bg-yellow-50 text-yellow-800 border-yellow-200',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182" />
      </svg>
    ),
  },
  {
    status: 'brief_ready',
    label: 'Brief Ready',
    color: 'bg-green-50 text-green-800 border-green-200',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  {
    status: 'md_review',
    label: 'MD Review',
    color: 'bg-purple-50 text-purple-800 border-purple-200',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
  },
  {
    status: 'determination_made',
    label: 'Completed',
    color: 'bg-teal-50 text-teal-800 border-teal-200',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11.35 3.836c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15a2.25 2.25 0 012.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m8.9-4.414c.376.023.75.05 1.124.08 1.131.094 1.976 1.057 1.976 2.192V16.5A2.25 2.25 0 0118 18.75h-2.25m-7.5-10.5H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V18.75m-7.5-10.5h6.375c.621 0 1.125.504 1.125 1.125v9.375m-8.25-3l1.5 1.5 3-3.75" />
      </svg>
    ),
  },
];

// ============================================================================
// SLA Alerts Component
// ============================================================================

function SlaAlerts({ cases, loading }: { cases: Case[]; loading: boolean }) {
  // Only consider active (non-completed) cases with deadlines
  const activeCasesWithDeadlines = cases.filter(
    (c) =>
      c.turnaround_deadline &&
      c.status !== 'determination_made' &&
      c.status !== 'delivered'
  );

  const categorized = activeCasesWithDeadlines.map((c) => ({
    case_: c,
    timeRemaining: getTimeRemaining(c.turnaround_deadline!),
  }));

  const overdueCases = categorized.filter((c) => c.timeRemaining.urgencyLevel === 'overdue');
  const criticalCases = categorized.filter((c) => c.timeRemaining.urgencyLevel === 'critical');
  const warningCases = categorized.filter((c) => c.timeRemaining.urgencyLevel === 'warning');

  // Top 5 most urgent: sort by total minutes ascending (most overdue first)
  const topUrgent = [...categorized]
    .sort((a, b) => a.timeRemaining.totalMinutes - b.timeRemaining.totalMinutes)
    .slice(0, 5);

  if (loading) return null;
  if (activeCasesWithDeadlines.length === 0) return null;

  const serviceCategoryLabels: Record<string, string> = {
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

  return (
    <div className="mb-8 animate-fade-in">
      <div className="bg-surface rounded-xl border border-border shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-border bg-gray-50/30">
          <div className="flex items-center gap-3">
            <svg className="w-5 h-5 text-navy/60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <h3 className="font-semibold text-lg text-navy">SLA Alerts</h3>
          </div>
        </div>

        {/* Summary counters */}
        <div className="grid grid-cols-3 gap-4 p-4 border-b border-border">
          <div className={`rounded-lg border p-4 text-center ${overdueCases.length > 0 ? 'bg-red-50 border-red-200' : 'bg-gray-50 border-border'}`}>
            <div className={`text-2xl font-bold ${overdueCases.length > 0 ? 'text-red-700' : 'text-muted'}`}>
              {overdueCases.length}
            </div>
            <div className={`text-xs font-semibold uppercase tracking-wide mt-1 ${overdueCases.length > 0 ? 'text-red-600' : 'text-muted'}`}>
              Overdue
            </div>
          </div>
          <div className={`rounded-lg border p-4 text-center ${criticalCases.length > 0 ? 'bg-amber-50 border-amber-200' : 'bg-gray-50 border-border'}`}>
            <div className={`text-2xl font-bold ${criticalCases.length > 0 ? 'text-amber-700' : 'text-muted'}`}>
              {criticalCases.length}
            </div>
            <div className={`text-xs font-semibold uppercase tracking-wide mt-1 ${criticalCases.length > 0 ? 'text-amber-600' : 'text-muted'}`}>
              Critical (&lt;4hr)
            </div>
          </div>
          <div className={`rounded-lg border p-4 text-center ${warningCases.length > 0 ? 'bg-yellow-50 border-yellow-200' : 'bg-gray-50 border-border'}`}>
            <div className={`text-2xl font-bold ${warningCases.length > 0 ? 'text-yellow-700' : 'text-muted'}`}>
              {warningCases.length}
            </div>
            <div className={`text-xs font-semibold uppercase tracking-wide mt-1 ${warningCases.length > 0 ? 'text-yellow-600' : 'text-muted'}`}>
              At Risk (&lt;12hr)
            </div>
          </div>
        </div>

        {/* Top 5 most urgent cases */}
        {topUrgent.length > 0 && (
          <div className="divide-y divide-border">
            {topUrgent.map(({ case_, timeRemaining }) => (
              <Link
                key={case_.id}
                href={`/cases/${case_.id}`}
                className="flex items-center gap-4 px-6 py-3 hover:bg-gold/[0.04] transition-colors group"
              >
                {/* SLA badge */}
                <div className="flex-shrink-0">
                  <SlaTracker deadline={case_.turnaround_deadline!} compact />
                </div>

                {/* Case info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-navy text-sm group-hover:text-gold-dark transition-colors">
                      {case_.case_number}
                    </span>
                    <span className="text-muted text-xs hidden sm:inline">|</span>
                    <span className="text-foreground text-sm truncate hidden sm:inline">
                      {case_.patient_name || 'Unknown Patient'}
                    </span>
                  </div>
                  <div className="text-xs text-muted mt-0.5 truncate">
                    {case_.service_category ? serviceCategoryLabels[case_.service_category] || case_.service_category : 'Medical'}
                    {case_.procedure_codes.length > 0 && (
                      <span className="ml-2 font-mono">{case_.procedure_codes[0]}</span>
                    )}
                  </div>
                </div>

                {/* Arrow */}
                <svg className="w-4 h-4 text-muted group-hover:text-gold-dark transition-colors flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                </svg>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Dashboard Page
// ============================================================================

export default function DashboardPage() {
  const [cases, setCases] = useState<Case[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchCases();
  }, []);

  async function fetchCases() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/cases');
      if (!res.ok) {
        throw new Error('Failed to load cases');
      }
      const data = await res.json();
      setCases(data);
    } catch (err) {
      console.error('Failed to fetch cases:', err);
      setError(err instanceof Error ? err.message : 'Failed to load cases');
    } finally {
      setLoading(false);
    }
  }

  function countByStatus(status: CaseStatus): number {
    return cases.filter((c) => c.status === status).length;
  }

  return (
    <div className="py-16 md:py-24 bg-background">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Dashboard header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-10">
          <div>
            <h2 className="font-[family-name:var(--font-dm-serif)] text-3xl text-navy">
              Clinical Review Dashboard
            </h2>
            <p className="text-muted mt-1">Medical utilization review case management and AI brief generation</p>
          </div>
          <Link
            href="/cases/new"
            className="inline-flex items-center gap-2 bg-navy text-white px-5 py-2.5 rounded-lg font-medium hover:bg-navy-light transition-colors shadow-sm"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            New Case
          </Link>
        </div>

        {/* Error State */}
        {error && (
          <div className="mb-8 animate-fade-in">
            <div className="bg-surface rounded-xl border border-red-200 shadow-sm p-6">
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0 w-10 h-10 rounded-full bg-red-50 flex items-center justify-center">
                  <svg className="w-5 h-5 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                  </svg>
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-foreground">Something went wrong</h3>
                  <p className="text-sm text-muted mt-1">{error}</p>
                </div>
                <button
                  onClick={fetchCases}
                  className="inline-flex items-center gap-2 bg-navy text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-navy-light transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182" />
                  </svg>
                  Retry
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Status Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4 mb-8">
          {statusCards.map(({ status, label, color, icon }) => (
            <div key={status} className={`rounded-xl border p-5 ${color} transition-all hover:shadow-md`}>
              <div className="flex items-center justify-between mb-2">
                <span className="opacity-60">{icon}</span>
              </div>
              <div className="text-3xl font-bold tracking-tight">
                {loading ? <span className="skeleton inline-block w-8 h-8 rounded" /> : countByStatus(status)}
              </div>
              <div className="text-sm font-medium mt-1">{label}</div>
            </div>
          ))}
        </div>

        {/* SLA Alerts Section */}
        <SlaAlerts cases={cases} loading={loading} />

        {/* Cases Table */}
        <div className="bg-surface rounded-xl border border-border shadow-sm overflow-hidden">
          <div className="px-6 py-5 border-b border-border bg-gray-50/30">
            <div className="flex items-center gap-3">
              <svg className="w-5 h-5 text-navy/60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zM3.75 12h.007v.008H3.75V12zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm-.375 5.25h.007v.008H3.75v-.008zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
              </svg>
              <h3 className="font-semibold text-lg text-navy">Recent Cases</h3>
            </div>
          </div>
          {loading ? (
            <div className="p-6 space-y-4 animate-fade-in">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="flex items-center gap-4">
                  <div className="skeleton w-24 h-4 rounded" />
                  <div className="skeleton w-32 h-4 rounded" />
                  <div className="skeleton w-20 h-4 rounded hidden md:block" />
                  <div className="skeleton skeleton-badge hidden sm:block" />
                  <div className="skeleton skeleton-badge" />
                  <div className="flex-1" />
                  <div className="skeleton w-16 h-4 rounded hidden sm:block" />
                </div>
              ))}
            </div>
          ) : (
            <CaseTable cases={cases} showFilters />
          )}
        </div>
      </div>
    </div>
  );
}
