'use client';

import { useState } from 'react';
import type { Reviewer } from '@/lib/types';

interface ReviewerPanelProps {
  reviewers: Reviewer[];
  selectedReviewerId: string | null;
  onAssign: (reviewerId: string) => void;
}

export function ReviewerPanel({ reviewers, selectedReviewerId, onAssign }: ReviewerPanelProps) {
  const [search, setSearch] = useState('');

  const activeReviewers = reviewers.filter((r) => r.status === 'active');

  const filtered = activeReviewers.filter((r) => {
    if (!search) return true;
    const term = search.toLowerCase();
    return (
      r.name.toLowerCase().includes(term) ||
      (r.specialty && r.specialty.toLowerCase().includes(term)) ||
      (r.credentials && r.credentials.toLowerCase().includes(term))
    );
  });

  return (
    <div className="bg-surface rounded-lg border border-border">
      <div className="p-4 border-b border-border">
        <h3 className="font-[family-name:var(--font-dm-serif)] text-lg text-foreground">
          Assign Reviewer
        </h3>
        <p className="text-xs text-muted mt-0.5">
          {activeReviewers.length} active reviewer{activeReviewers.length !== 1 ? 's' : ''} available
        </p>
      </div>

      <div className="p-3 border-b border-border">
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
            placeholder="Search by name, specialty, credentials..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm border border-border rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-gold/50 focus:border-gold"
          />
        </div>
      </div>

      <div className="max-h-80 overflow-y-auto divide-y divide-border">
        {filtered.length === 0 ? (
          <div className="p-6 text-center text-sm text-muted">
            {search ? 'No reviewers match your search.' : 'No active reviewers available.'}
          </div>
        ) : (
          filtered.map((reviewer) => {
            const isSelected = reviewer.id === selectedReviewerId;

            return (
              <button
                key={reviewer.id}
                onClick={() => onAssign(reviewer.id)}
                className={`w-full text-left p-4 transition-colors hover:bg-gray-50 ${
                  isSelected ? 'bg-gold/5 ring-inset ring-1 ring-gold/30' : ''
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <div
                        className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                          isSelected
                            ? 'bg-gold text-navy'
                            : 'bg-navy-light text-white'
                        }`}
                      >
                        {reviewer.name
                          .split(' ')
                          .map((n) => n[0])
                          .join('')
                          .toUpperCase()
                          .slice(0, 2)}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-foreground truncate">
                          {reviewer.name}
                          {reviewer.credentials && (
                            <span className="text-muted font-normal ml-1">
                              , {reviewer.credentials}
                            </span>
                          )}
                        </p>
                        {reviewer.specialty && (
                          <p className="text-xs text-muted truncate">{reviewer.specialty}</p>
                        )}
                      </div>
                    </div>
                  </div>

                  {isSelected && (
                    <span className="shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-gold/20 text-gold-dark">
                      Assigned
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-4 mt-2 ml-10 text-xs text-muted">
                  <span className="flex items-center gap-1">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                    </svg>
                    {reviewer.cases_completed} cases
                  </span>
                  {reviewer.avg_turnaround_hours !== null && (
                    <span className="flex items-center gap-1">
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      ~{Math.round(reviewer.avg_turnaround_hours)}h avg
                    </span>
                  )}
                  {reviewer.license_state.length > 0 && (
                    <span className="flex items-center gap-1">
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
                      </svg>
                      {reviewer.license_state.join(', ')}
                    </span>
                  )}
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
