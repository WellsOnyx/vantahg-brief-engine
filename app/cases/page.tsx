'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import Link from 'next/link';
import type {
  Case,
  CaseStatus,
  CasePriority,
  ServiceCategory,
  ReviewType,
  Reviewer,
} from '@/lib/types';
import { StatusBadge, PriorityBadge } from '@/components/StatusBadge';
import { SlaTracker } from '@/components/SlaTracker';

// ── Label maps ──

const statusLabels: Record<CaseStatus, string> = {
  intake: 'Intake',
  processing: 'Processing',
  brief_ready: 'Brief Ready',
  in_review: 'In Review',
  determination_made: 'Determination Made',
  delivered: 'Delivered',
};

const priorityLabels: Record<CasePriority, string> = {
  standard: 'Standard',
  urgent: 'Urgent',
  expedited: 'Expedited',
};

const serviceCategoryLabels: Record<ServiceCategory, string> = {
  imaging: 'Imaging',
  surgery: 'Surgery',
  specialty_referral: 'Specialty Referral',
  dme: 'Durable Medical Equipment',
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

const serviceCategoryColors: Record<ServiceCategory, string> = {
  imaging: 'bg-blue-50 text-blue-700 border-blue-200',
  surgery: 'bg-red-50 text-red-700 border-red-200',
  specialty_referral: 'bg-violet-50 text-violet-700 border-violet-200',
  dme: 'bg-amber-50 text-amber-700 border-amber-200',
  infusion: 'bg-teal-50 text-teal-700 border-teal-200',
  behavioral_health: 'bg-purple-50 text-purple-700 border-purple-200',
  rehab_therapy: 'bg-green-50 text-green-700 border-green-200',
  home_health: 'bg-cyan-50 text-cyan-700 border-cyan-200',
  skilled_nursing: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  transplant: 'bg-rose-50 text-rose-700 border-rose-200',
  genetic_testing: 'bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200',
  pain_management: 'bg-orange-50 text-orange-700 border-orange-200',
  cardiology: 'bg-pink-50 text-pink-700 border-pink-200',
  oncology: 'bg-yellow-50 text-yellow-800 border-yellow-200',
  other: 'bg-gray-50 text-gray-700 border-gray-200',
};

const reviewTypeLabels: Record<ReviewType, string> = {
  prior_auth: 'Prior Auth',
  medical_necessity: 'Medical Necessity',
  concurrent: 'Concurrent',
  retrospective: 'Retrospective',
  peer_to_peer: 'Peer-to-Peer',
  appeal: 'Appeal',
  second_level_review: '2nd Level Review',
};

const allStatuses: CaseStatus[] = [
  'intake',
  'processing',
  'brief_ready',
  'in_review',
  'determination_made',
  'delivered',
];

const allPriorities: CasePriority[] = ['standard', 'urgent', 'expedited'];

const allServiceCategories: ServiceCategory[] = [
  'imaging',
  'surgery',
  'specialty_referral',
  'dme',
  'infusion',
  'behavioral_health',
  'rehab_therapy',
  'home_health',
  'skilled_nursing',
  'transplant',
  'genetic_testing',
  'pain_management',
  'cardiology',
  'oncology',
  'other',
];

const allReviewTypes: ReviewType[] = [
  'prior_auth',
  'medical_necessity',
  'concurrent',
  'retrospective',
  'peer_to_peer',
  'appeal',
  'second_level_review',
];

type SortOption = 'newest' | 'oldest' | 'deadline_soonest' | 'priority';

const sortLabels: Record<SortOption, string> = {
  newest: 'Newest First',
  oldest: 'Oldest First',
  deadline_soonest: 'Deadline Soonest',
  priority: 'Priority',
};

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

const priorityOrder: Record<CasePriority, number> = {
  urgent: 0,
  expedited: 1,
  standard: 2,
};

export default function CasesListPage() {
  const [cases, setCases] = useState<Case[]>([]);
  const [reviewers, setReviewers] = useState<Reviewer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<CaseStatus | ''>('');
  const [filterCategory, setFilterCategory] = useState<ServiceCategory | ''>('');
  const [filterPriority, setFilterPriority] = useState<CasePriority | ''>('');
  const [filterReviewType, setFilterReviewType] = useState<ReviewType | ''>('');
  const [filterReviewer, setFilterReviewer] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('newest');

  // Debounced search
  const [debouncedSearch, setDebouncedSearch] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Fetch reviewers once
  useEffect(() => {
    fetch('/api/reviewers')
      .then((res) => res.json())
      .then(setReviewers)
      .catch(() => setReviewers([]));
  }, []);

  // Build query params and fetch cases
  const fetchCases = useCallback(async () => {
    setLoading(true);
    setError(null);

    const params = new URLSearchParams();
    if (debouncedSearch) params.set('search', debouncedSearch);
    if (filterStatus) params.set('status', filterStatus);
    if (filterCategory) params.set('service_category', filterCategory);
    if (filterPriority) params.set('priority', filterPriority);
    if (filterReviewType) params.set('review_type', filterReviewType);
    if (filterReviewer) params.set('assigned_reviewer_id', filterReviewer);
    if (dateFrom) params.set('date_from', dateFrom);
    if (dateTo) params.set('date_to', dateTo);

    try {
      const res = await fetch(`/api/cases?${params.toString()}`);
      if (!res.ok) {
        throw new Error('Failed to fetch cases');
      }
      const data = await res.json();
      setCases(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load cases');
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, filterStatus, filterCategory, filterPriority, filterReviewType, filterReviewer, dateFrom, dateTo]);

  useEffect(() => {
    fetchCases();
  }, [fetchCases]);

  // Client-side sorting
  const sortedCases = useMemo(() => {
    const sorted = [...cases];
    switch (sortBy) {
      case 'newest':
        sorted.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        break;
      case 'oldest':
        sorted.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
        break;
      case 'deadline_soonest':
        sorted.sort((a, b) => {
          if (!a.turnaround_deadline && !b.turnaround_deadline) return 0;
          if (!a.turnaround_deadline) return 1;
          if (!b.turnaround_deadline) return -1;
          return new Date(a.turnaround_deadline).getTime() - new Date(b.turnaround_deadline).getTime();
        });
        break;
      case 'priority':
        sorted.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);
        break;
    }
    return sorted;
  }, [cases, sortBy]);

  const hasActiveFilters =
    filterStatus || filterCategory || filterPriority || filterReviewType || filterReviewer || dateFrom || dateTo || debouncedSearch;

  function clearAllFilters() {
    setSearch('');
    setFilterStatus('');
    setFilterCategory('');
    setFilterPriority('');
    setFilterReviewType('');
    setFilterReviewer('');
    setDateFrom('');
    setDateTo('');
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="font-[family-name:var(--font-dm-serif)] text-3xl text-navy">
            Case Management
          </h1>
          <p className="text-muted mt-1">View and manage all utilization review cases</p>
        </div>
        <Link
          href="/cases/new"
          className="inline-flex items-center gap-2 bg-navy text-gold px-5 py-2.5 rounded-lg font-semibold text-sm hover:bg-navy-light transition-colors shadow-sm"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          New Case
        </Link>
      </div>

      {/* Filter Bar */}
      <div className="bg-surface rounded-xl border border-border shadow-sm p-4 mb-6">
        {/* Search */}
        <div className="mb-4">
          <div className="relative">
            <svg
              className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"
              />
            </svg>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by case number, patient name, or member ID..."
              className="w-full pl-10 pr-4 py-2.5 text-sm border border-border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-gold/50 focus:border-gold transition-colors"
            />
          </div>
        </div>

        {/* Filter Dropdowns */}
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm font-medium text-muted flex items-center gap-1.5">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 3c2.755 0 5.455.232 8.083.678.533.09.917.556.917 1.096v1.044a2.25 2.25 0 01-.659 1.591l-5.432 5.432a2.25 2.25 0 00-.659 1.591v2.927a2.25 2.25 0 01-1.244 2.013L9.75 21v-6.568a2.25 2.25 0 00-.659-1.591L3.659 7.409A2.25 2.25 0 013 5.818V4.774c0-.54.384-1.006.917-1.096A48.32 48.32 0 0112 3z"
              />
            </svg>
            Filters
          </span>

          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as CaseStatus | '')}
            className="text-sm border border-border rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-gold/50"
          >
            <option value="">All Statuses</option>
            {allStatuses.map((s) => (
              <option key={s} value={s}>
                {statusLabels[s]}
              </option>
            ))}
          </select>

          <select
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value as ServiceCategory | '')}
            className="text-sm border border-border rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-gold/50"
          >
            <option value="">All Categories</option>
            {allServiceCategories.map((c) => (
              <option key={c} value={c}>
                {serviceCategoryLabels[c]}
              </option>
            ))}
          </select>

          <select
            value={filterPriority}
            onChange={(e) => setFilterPriority(e.target.value as CasePriority | '')}
            className="text-sm border border-border rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-gold/50"
          >
            <option value="">All Priorities</option>
            {allPriorities.map((p) => (
              <option key={p} value={p}>
                {priorityLabels[p]}
              </option>
            ))}
          </select>

          <select
            value={filterReviewType}
            onChange={(e) => setFilterReviewType(e.target.value as ReviewType | '')}
            className="text-sm border border-border rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-gold/50"
          >
            <option value="">All Review Types</option>
            {allReviewTypes.map((r) => (
              <option key={r} value={r}>
                {reviewTypeLabels[r]}
              </option>
            ))}
          </select>

          <select
            value={filterReviewer}
            onChange={(e) => setFilterReviewer(e.target.value)}
            className="text-sm border border-border rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-gold/50"
          >
            <option value="">All Reviewers</option>
            {reviewers.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>

          {/* Date Range */}
          <div className="flex items-center gap-1.5">
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="text-sm border border-border rounded-lg px-2.5 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-gold/50"
              title="Submitted from"
            />
            <span className="text-xs text-muted">to</span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="text-sm border border-border rounded-lg px-2.5 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-gold/50"
              title="Submitted to"
            />
          </div>

          {hasActiveFilters && (
            <button
              onClick={clearAllFilters}
              className="text-sm text-gold-dark hover:text-gold font-medium inline-flex items-center gap-1 transition-colors ml-1"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
              Clear all
            </button>
          )}
        </div>

        {/* Sort */}
        <div className="flex items-center gap-2 mt-3 pt-3 border-t border-border">
          <span className="text-xs font-medium text-muted">Sort:</span>
          {(Object.keys(sortLabels) as SortOption[]).map((option) => (
            <button
              key={option}
              onClick={() => setSortBy(option)}
              className={`text-xs px-2.5 py-1 rounded-md font-medium transition-colors ${
                sortBy === option
                  ? 'bg-navy text-white'
                  : 'bg-gray-100 text-muted hover:bg-gray-200'
              }`}
            >
              {sortLabels[option]}
            </button>
          ))}
        </div>
      </div>

      {/* Error State */}
      {error && (
        <div className="mb-6 animate-fade-in">
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

      {/* Loading State */}
      {loading ? (
        <div className="bg-surface rounded-xl border border-border shadow-sm overflow-hidden animate-fade-in">
          {/* Skeleton table header */}
          <div className="border-b border-border bg-gray-50/80 px-4 py-3 flex items-center gap-4">
            <div className="skeleton w-16 h-3 rounded" />
            <div className="skeleton w-20 h-3 rounded" />
            <div className="skeleton w-20 h-3 rounded hidden md:block" />
            <div className="skeleton w-16 h-3 rounded hidden lg:block" />
            <div className="skeleton w-16 h-3 rounded hidden sm:block" />
            <div className="skeleton w-16 h-3 rounded" />
            <div className="flex-1" />
            <div className="skeleton w-16 h-3 rounded hidden sm:block" />
          </div>
          {/* Skeleton rows */}
          <div className="divide-y divide-border">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="px-4 py-3 flex items-center gap-4">
                <div className="skeleton w-24 h-4 rounded" />
                <div className="skeleton w-28 h-4 rounded" />
                <div className="skeleton skeleton-badge hidden md:block" />
                <div className="skeleton w-16 h-4 rounded hidden lg:block font-mono" />
                <div className="skeleton skeleton-badge hidden sm:block" />
                <div className="skeleton skeleton-badge" />
                <div className="flex-1" />
                <div className="skeleton w-14 h-4 rounded hidden sm:block" />
                <div className="skeleton w-10 h-4 rounded" />
              </div>
            ))}
          </div>
          {/* Skeleton footer */}
          <div className="px-4 py-3 border-t border-border bg-gray-50/40">
            <div className="skeleton w-32 h-3 rounded" />
          </div>
        </div>
      ) : sortedCases.length === 0 ? (
        /* Empty State */
        <div className="bg-surface rounded-xl border border-border shadow-sm text-center py-20 animate-slide-up">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-navy/5 flex items-center justify-center">
            <svg
              className="h-8 w-8 text-navy/30"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m5.231 13.481L15 17.25m-4.5-15H5.625c-.621 0-1.125.504-1.125 1.125v16.5c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9zm3.75 11.625a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z"
              />
            </svg>
          </div>
          <h3 className="text-base font-semibold text-foreground font-[family-name:var(--font-dm-serif)]">
            No cases found
          </h3>
          <p className="mt-2 text-sm text-muted max-w-sm mx-auto">
            {hasActiveFilters
              ? 'No cases match the selected filters. Try adjusting your criteria.'
              : 'Get started by submitting a new case for clinical review.'}
          </p>
          {hasActiveFilters ? (
            <button
              onClick={clearAllFilters}
              className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-gold-dark hover:text-gold transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
              Clear all filters
            </button>
          ) : (
            <div className="mt-6">
              <Link
                href="/cases/new"
                className="inline-flex items-center gap-2 bg-navy text-gold px-5 py-2.5 rounded-lg font-semibold text-sm hover:bg-navy-light transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
                New Case
              </Link>
            </div>
          )}
        </div>
      ) : (
        /* Results Table */
        <div className="bg-surface rounded-xl border border-border shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-gray-50/80">
                  <th className="text-left px-4 py-3 font-semibold text-navy text-xs uppercase tracking-wider">
                    Case #
                  </th>
                  <th className="text-left px-4 py-3 font-semibold text-navy text-xs uppercase tracking-wider">
                    Patient
                  </th>
                  <th className="text-left px-4 py-3 font-semibold text-navy text-xs uppercase tracking-wider hidden md:table-cell">
                    Category
                  </th>
                  <th className="text-left px-4 py-3 font-semibold text-navy text-xs uppercase tracking-wider hidden lg:table-cell">
                    Procedure
                  </th>
                  <th className="text-left px-4 py-3 font-semibold text-navy text-xs uppercase tracking-wider hidden lg:table-cell">
                    Review Type
                  </th>
                  <th className="text-left px-4 py-3 font-semibold text-navy text-xs uppercase tracking-wider hidden sm:table-cell">
                    Priority
                  </th>
                  <th className="text-left px-4 py-3 font-semibold text-navy text-xs uppercase tracking-wider">
                    Status
                  </th>
                  <th className="text-left px-4 py-3 font-semibold text-navy text-xs uppercase tracking-wider hidden xl:table-cell">
                    Reviewer
                  </th>
                  <th className="text-left px-4 py-3 font-semibold text-navy text-xs uppercase tracking-wider hidden xl:table-cell">
                    SLA
                  </th>
                  <th className="text-left px-4 py-3 font-semibold text-navy text-xs uppercase tracking-wider hidden sm:table-cell">
                    Submitted
                  </th>
                  <th className="text-left px-4 py-3 font-semibold text-navy text-xs uppercase tracking-wider">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {sortedCases.map((c) => (
                  <tr key={c.id} className="table-row-hover group">
                    <td className="px-4 py-3">
                      <Link
                        href={`/cases/${c.id}`}
                        className="font-semibold text-navy hover:text-gold-dark transition-colors duration-200 inline-flex items-center gap-1"
                      >
                        {c.case_number}
                        <svg
                          className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity duration-200 text-gold-dark"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth={2}
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                        </svg>
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-foreground">
                      {c.patient_name || <span className="text-muted italic">Not provided</span>}
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      {c.service_category ? (
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${
                            serviceCategoryColors[c.service_category] || 'bg-gray-50 text-gray-700 border-gray-200'
                          }`}
                        >
                          {serviceCategoryLabels[c.service_category] || c.service_category}
                        </span>
                      ) : (
                        <span className="text-muted italic text-xs">--</span>
                      )}
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell">
                      {c.procedure_codes.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {c.procedure_codes.slice(0, 2).map((code) => (
                            <span
                              key={code}
                              className="inline-block bg-navy/5 text-navy px-2 py-0.5 rounded-md text-xs font-mono font-medium"
                            >
                              {code}
                            </span>
                          ))}
                          {c.procedure_codes.length > 2 && (
                            <span className="text-xs text-muted font-medium">
                              +{c.procedure_codes.length - 2}
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-muted italic text-xs">None</span>
                      )}
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell">
                      {c.review_type ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-700 border border-slate-200">
                          {reviewTypeLabels[c.review_type] || c.review_type}
                        </span>
                      ) : (
                        <span className="text-muted italic text-xs">--</span>
                      )}
                    </td>
                    <td className="px-4 py-3 hidden sm:table-cell">
                      <PriorityBadge priority={c.priority} />
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={c.status} />
                    </td>
                    <td className="px-4 py-3 hidden xl:table-cell text-foreground">
                      {c.reviewer?.name || (
                        <span className="text-muted italic text-xs">Unassigned</span>
                      )}
                    </td>
                    <td className="px-4 py-3 hidden xl:table-cell">
                      {c.turnaround_deadline ? (
                        <SlaTracker deadline={c.turnaround_deadline} compact />
                      ) : (
                        <span className="text-muted italic text-xs">--</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted whitespace-nowrap hidden sm:table-cell">
                      {formatDate(c.created_at)}
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/cases/${c.id}`}
                        className="inline-flex items-center gap-1 text-xs font-medium text-gold-dark hover:text-gold transition-colors"
                      >
                        View
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                        </svg>
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Footer count */}
          <div className="px-4 py-3 border-t border-border text-xs text-muted bg-gray-50/40">
            Showing {sortedCases.length} of {sortedCases.length} case{sortedCases.length !== 1 ? 's' : ''}
          </div>
        </div>
      )}
    </div>
  );
}
