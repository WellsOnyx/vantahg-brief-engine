'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import type { Case, CaseStatus, CasePriority, CaseVertical } from '@/lib/types';
import { StatusBadge, PriorityBadge } from './StatusBadge';
import { SlaTracker } from './SlaTracker';

interface CaseTableProps {
  cases: Case[];
  showFilters?: boolean;
}

const allStatuses: CaseStatus[] = [
  'intake',
  'processing',
  'brief_ready',
  'in_review',
  'determination_made',
  'delivered',
];

const allPriorities: CasePriority[] = ['standard', 'urgent', 'expedited'];
const allVerticals: CaseVertical[] = ['dental', 'vision', 'medical'];

const verticalLabels: Record<CaseVertical, string> = {
  dental: 'Dental',
  vision: 'Vision',
  medical: 'Medical',
};

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

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function CaseTable({ cases, showFilters = false }: CaseTableProps) {
  const [filterVertical, setFilterVertical] = useState<CaseVertical | ''>('');
  const [filterStatus, setFilterStatus] = useState<CaseStatus | ''>('');
  const [filterPriority, setFilterPriority] = useState<CasePriority | ''>('');

  const filteredCases = useMemo(() => {
    return cases.filter((c) => {
      if (filterVertical && c.vertical !== filterVertical) return false;
      if (filterStatus && c.status !== filterStatus) return false;
      if (filterPriority && c.priority !== filterPriority) return false;
      return true;
    });
  }, [cases, filterVertical, filterStatus, filterPriority]);

  const hasActiveFilters = filterVertical || filterStatus || filterPriority;

  return (
    <div className="w-full animate-fade-in">
      {showFilters && (
        <div className="flex flex-wrap items-center gap-3 mb-4 p-4 bg-surface rounded-xl border border-border shadow-sm">
          <span className="text-sm font-medium text-muted flex items-center gap-1.5">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 3c2.755 0 5.455.232 8.083.678.533.09.917.556.917 1.096v1.044a2.25 2.25 0 01-.659 1.591l-5.432 5.432a2.25 2.25 0 00-.659 1.591v2.927a2.25 2.25 0 01-1.244 2.013L9.75 21v-6.568a2.25 2.25 0 00-.659-1.591L3.659 7.409A2.25 2.25 0 013 5.818V4.774c0-.54.384-1.006.917-1.096A48.32 48.32 0 0112 3z" />
            </svg>
            Filters
          </span>

          <select
            value={filterVertical}
            onChange={(e) => setFilterVertical(e.target.value as CaseVertical | '')}
            className="text-sm border border-border rounded-lg px-3 py-1.5 bg-white"
          >
            <option value="">All Verticals</option>
            {allVerticals.map((v) => (
              <option key={v} value={v}>
                {verticalLabels[v]}
              </option>
            ))}
          </select>

          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as CaseStatus | '')}
            className="text-sm border border-border rounded-lg px-3 py-1.5 bg-white"
          >
            <option value="">All Statuses</option>
            {allStatuses.map((s) => (
              <option key={s} value={s}>
                {statusLabels[s]}
              </option>
            ))}
          </select>

          <select
            value={filterPriority}
            onChange={(e) => setFilterPriority(e.target.value as CasePriority | '')}
            className="text-sm border border-border rounded-lg px-3 py-1.5 bg-white"
          >
            <option value="">All Priorities</option>
            {allPriorities.map((p) => (
              <option key={p} value={p}>
                {priorityLabels[p]}
              </option>
            ))}
          </select>

          {hasActiveFilters && (
            <button
              onClick={() => {
                setFilterVertical('');
                setFilterStatus('');
                setFilterPriority('');
              }}
              className="text-sm text-gold-dark hover:text-gold font-medium inline-flex items-center gap-1 transition-colors ml-1"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
              Clear filters
            </button>
          )}
        </div>
      )}

      {filteredCases.length === 0 ? (
        <div className="text-center py-20 bg-surface rounded-xl border border-border animate-slide-up">
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
          {!hasActiveFilters && (
            <div className="mt-6">
              <Link
                href="/cases/new"
                className="btn btn-primary"
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
        <div className="overflow-x-auto bg-surface rounded-xl border border-border shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-gray-50/80">
                <th className="text-left px-5 py-3.5 font-semibold text-navy text-xs uppercase tracking-wider">Case #</th>
                <th className="text-left px-5 py-3.5 font-semibold text-navy text-xs uppercase tracking-wider">Patient</th>
                <th className="text-left px-5 py-3.5 font-semibold text-navy text-xs uppercase tracking-wider hidden lg:table-cell">Procedure</th>
                <th className="text-left px-5 py-3.5 font-semibold text-navy text-xs uppercase tracking-wider hidden sm:table-cell">Vertical</th>
                <th className="text-left px-5 py-3.5 font-semibold text-navy text-xs uppercase tracking-wider">Status</th>
                <th className="text-left px-5 py-3.5 font-semibold text-navy text-xs uppercase tracking-wider hidden md:table-cell">Priority</th>
                <th className="text-left px-5 py-3.5 font-semibold text-navy text-xs uppercase tracking-wider hidden md:table-cell">SLA</th>
                <th className="text-left px-5 py-3.5 font-semibold text-navy text-xs uppercase tracking-wider hidden lg:table-cell">Reviewer</th>
                <th className="text-left px-5 py-3.5 font-semibold text-navy text-xs uppercase tracking-wider hidden sm:table-cell">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredCases.map((c) => (
                <tr
                  key={c.id}
                  className="table-row-hover group"
                >
                  <td className="px-5 py-3.5">
                    <Link
                      href={`/cases/${c.id}`}
                      className="font-semibold text-navy hover:text-gold-dark transition-colors duration-200 inline-flex items-center gap-1"
                    >
                      {c.case_number}
                      <svg className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity duration-200 text-gold-dark" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                      </svg>
                    </Link>
                  </td>
                  <td className="px-5 py-3.5 text-foreground">
                    {c.patient_name || <span className="text-muted italic">Not provided</span>}
                  </td>
                  <td className="px-5 py-3.5 hidden lg:table-cell">
                    {c.procedure_codes.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {c.procedure_codes.slice(0, 3).map((code) => (
                          <span
                            key={code}
                            className="inline-block bg-navy/5 text-navy px-2 py-0.5 rounded-md text-xs font-mono font-medium"
                          >
                            {code}
                          </span>
                        ))}
                        {c.procedure_codes.length > 3 && (
                          <span className="text-xs text-muted font-medium">
                            +{c.procedure_codes.length - 3}
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="text-muted italic text-xs">None</span>
                    )}
                  </td>
                  <td className="px-5 py-3.5 hidden sm:table-cell">
                    <span className="capitalize text-foreground text-sm">{c.vertical}</span>
                  </td>
                  <td className="px-5 py-3.5">
                    <StatusBadge status={c.status} />
                  </td>
                  <td className="px-5 py-3.5 hidden md:table-cell">
                    <PriorityBadge priority={c.priority} />
                  </td>
                  <td className="px-5 py-3.5 hidden md:table-cell">
                    {c.turnaround_deadline ? (
                      <SlaTracker deadline={c.turnaround_deadline} compact />
                    ) : (
                      <span className="text-muted italic text-xs">No SLA</span>
                    )}
                  </td>
                  <td className="px-5 py-3.5 hidden lg:table-cell text-foreground">
                    {c.reviewer?.name || (
                      <span className="text-muted italic text-xs">Unassigned</span>
                    )}
                  </td>
                  <td className="px-5 py-3.5 text-muted whitespace-nowrap hidden sm:table-cell">
                    {formatDate(c.created_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="px-5 py-3 border-t border-border text-xs text-muted bg-gray-50/40">
            Showing {filteredCases.length} of {cases.length} case{cases.length !== 1 ? 's' : ''}
          </div>
        </div>
      )}
    </div>
  );
}
