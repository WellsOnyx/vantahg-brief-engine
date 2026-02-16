'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import type { Case, CaseStatus, CasePriority, CaseVertical } from '@/lib/types';
import { StatusBadge, PriorityBadge } from './StatusBadge';

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
    <div className="w-full">
      {showFilters && (
        <div className="flex flex-wrap items-center gap-3 mb-4 p-4 bg-surface rounded-lg border border-border">
          <span className="text-sm font-medium text-muted">Filters:</span>

          <select
            value={filterVertical}
            onChange={(e) => setFilterVertical(e.target.value as CaseVertical | '')}
            className="text-sm border border-border rounded-md px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-gold/50 focus:border-gold"
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
            className="text-sm border border-border rounded-md px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-gold/50 focus:border-gold"
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
            className="text-sm border border-border rounded-md px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-gold/50 focus:border-gold"
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
              className="text-sm text-gold-dark hover:text-gold underline ml-1"
            >
              Clear filters
            </button>
          )}
        </div>
      )}

      {filteredCases.length === 0 ? (
        <div className="text-center py-16 bg-surface rounded-lg border border-border">
          <svg
            className="mx-auto h-12 w-12 text-muted/40"
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
          <h3 className="mt-3 text-sm font-semibold text-foreground">No cases found</h3>
          <p className="mt-1 text-sm text-muted">
            {hasActiveFilters
              ? 'No cases match the selected filters. Try adjusting your criteria.'
              : 'Get started by submitting a new case for review.'}
          </p>
          {!hasActiveFilters && (
            <div className="mt-4">
              <Link
                href="/cases/new"
                className="inline-flex items-center px-4 py-2 text-sm font-medium rounded-md bg-navy text-gold hover:bg-navy-light transition-colors"
              >
                + New Case
              </Link>
            </div>
          )}
        </div>
      ) : (
        <div className="overflow-x-auto bg-surface rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-gray-50/50">
                <th className="text-left px-4 py-3 font-semibold text-foreground">Case #</th>
                <th className="text-left px-4 py-3 font-semibold text-foreground">Patient</th>
                <th className="text-left px-4 py-3 font-semibold text-foreground">Procedure</th>
                <th className="text-left px-4 py-3 font-semibold text-foreground">Vertical</th>
                <th className="text-left px-4 py-3 font-semibold text-foreground">Status</th>
                <th className="text-left px-4 py-3 font-semibold text-foreground">Priority</th>
                <th className="text-left px-4 py-3 font-semibold text-foreground">Reviewer</th>
                <th className="text-left px-4 py-3 font-semibold text-foreground">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredCases.map((c) => (
                <tr
                  key={c.id}
                  className="hover:bg-gray-50/50 transition-colors group"
                >
                  <td className="px-4 py-3">
                    <Link
                      href={`/cases/${c.id}`}
                      className="font-medium text-navy hover:text-gold-dark transition-colors"
                    >
                      {c.case_number}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-foreground">
                    {c.patient_name || <span className="text-muted italic">Not provided</span>}
                  </td>
                  <td className="px-4 py-3">
                    {c.procedure_codes.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {c.procedure_codes.slice(0, 3).map((code) => (
                          <span
                            key={code}
                            className="inline-block bg-gray-100 text-foreground px-1.5 py-0.5 rounded text-xs font-mono"
                          >
                            {code}
                          </span>
                        ))}
                        {c.procedure_codes.length > 3 && (
                          <span className="text-xs text-muted">
                            +{c.procedure_codes.length - 3} more
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="text-muted italic">None</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className="capitalize text-foreground">{c.vertical}</span>
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={c.status} />
                  </td>
                  <td className="px-4 py-3">
                    <PriorityBadge priority={c.priority} />
                  </td>
                  <td className="px-4 py-3 text-foreground">
                    {c.reviewer?.name || (
                      <span className="text-muted italic">Unassigned</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted whitespace-nowrap">
                    {formatDate(c.created_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="px-4 py-3 border-t border-border text-xs text-muted">
            Showing {filteredCases.length} of {cases.length} case{cases.length !== 1 ? 's' : ''}
          </div>
        </div>
      )}
    </div>
  );
}
