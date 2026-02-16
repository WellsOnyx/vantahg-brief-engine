'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { CaseTable } from '@/components/CaseTable';
import type { Case, CaseStatus } from '@/lib/types';

const statusCards: { status: CaseStatus; label: string; color: string }[] = [
  { status: 'intake', label: 'Intake', color: 'bg-blue-50 text-blue-800 border-blue-200' },
  { status: 'processing', label: 'Processing', color: 'bg-yellow-50 text-yellow-800 border-yellow-200' },
  { status: 'brief_ready', label: 'Brief Ready', color: 'bg-green-50 text-green-800 border-green-200' },
  { status: 'in_review', label: 'In Review', color: 'bg-purple-50 text-purple-800 border-purple-200' },
  { status: 'determination_made', label: 'Completed', color: 'bg-teal-50 text-teal-800 border-teal-200' },
];

export default function Dashboard() {
  const [cases, setCases] = useState<Case[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchCases();
  }, []);

  async function fetchCases() {
    try {
      const res = await fetch('/api/cases');
      if (res.ok) {
        const data = await res.json();
        setCases(data);
      }
    } catch (err) {
      console.error('Failed to fetch cases:', err);
    } finally {
      setLoading(false);
    }
  }

  function countByStatus(status: CaseStatus): number {
    return cases.filter((c) => c.status === status).length;
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="font-[family-name:var(--font-dm-serif)] text-3xl text-navy">
            Clinical Review Dashboard
          </h1>
          <p className="text-muted mt-1">Utilization review case management and AI brief generation</p>
        </div>
        <Link
          href="/cases/new"
          className="inline-flex items-center gap-2 bg-navy text-white px-5 py-2.5 rounded-lg font-medium hover:bg-navy-light transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          New Case
        </Link>
      </div>

      {/* Status Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
        {statusCards.map(({ status, label, color }) => (
          <div key={status} className={`rounded-lg border p-4 ${color}`}>
            <div className="text-3xl font-bold">{loading ? '—' : countByStatus(status)}</div>
            <div className="text-sm font-medium mt-1">{label}</div>
          </div>
        ))}
      </div>

      {/* Cases Table */}
      <div className="bg-surface rounded-lg border border-border shadow-sm">
        <div className="px-6 py-4 border-b border-border">
          <h2 className="font-semibold text-lg">Recent Cases</h2>
        </div>
        {loading ? (
          <div className="p-12 text-center text-muted">Loading cases...</div>
        ) : (
          <CaseTable cases={cases} showFilters />
        )}
      </div>
    </div>
  );
}
