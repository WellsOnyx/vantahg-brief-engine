'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getTimeRemaining } from '@/lib/sla-calculator';
import type { Case } from '@/lib/types';

const ACTIVE_STATUSES = new Set(['intake', 'processing', 'brief_ready', 'in_review']);

export default function FirstMoverQueuePage() {
  const [cases, setCases] = useState<Case[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'inpatient' | 'expedited'>('all');

  useEffect(() => {
    fetch('/api/cases')
      .then((r) => r.json())
      .then((data) => setCases(Array.isArray(data) ? data : []))
      .catch(() => setCases([]))
      .finally(() => setLoading(false));
  }, []);

  const visible = cases
    .filter((c) => ACTIVE_STATUSES.has(c.status))
    .filter((c) => {
      if (filter === 'inpatient') return c.facility_type === 'inpatient';
      if (filter === 'expedited') return c.priority === 'expedited' || c.priority === 'urgent';
      return true;
    })
    .sort((a, b) => {
      const ta = a.turnaround_deadline ? new Date(a.turnaround_deadline).getTime() : Infinity;
      const tb = b.turnaround_deadline ? new Date(b.turnaround_deadline).getTime() : Infinity;
      return ta - tb;
    });

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="font-serif text-2xl">Clinician queue</h1>
          <p className="text-sm text-slate-600 mt-1">
            Active cases sorted by SLA urgency. Five outcomes available per case: approve, deny,
            partial, pend, peer-to-peer.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {(['all', 'inpatient', 'expedited'] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={`text-xs uppercase tracking-wide border rounded px-3 py-1.5 ${
                filter === f
                  ? 'bg-[#0c2340] text-white border-[#0c2340]'
                  : 'bg-white border-slate-300 hover:border-[#c9a227]'
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="text-sm text-slate-500">Loading queue&hellip;</div>
      ) : visible.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded p-8 text-center text-sm text-slate-500">
          Queue is clear. Nice work.
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-600">
              <tr>
                <th className="text-left px-4 py-2">Case #</th>
                <th className="text-left px-4 py-2">Patient</th>
                <th className="text-left px-4 py-2">Service</th>
                <th className="text-left px-4 py-2">Status</th>
                <th className="text-left px-4 py-2">SLA</th>
                <th className="text-left px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {visible.map((c) => {
                const remaining = c.turnaround_deadline ? getTimeRemaining(c.turnaround_deadline) : null;
                return (
                  <tr key={c.id} className="border-t border-slate-100">
                    <td className="px-4 py-3 font-mono text-xs">{c.case_number}</td>
                    <td className="px-4 py-3">{c.patient_name || '—'}</td>
                    <td className="px-4 py-3">
                      <div>{c.procedure_description || '—'}</div>
                      <div className="text-xs text-slate-500">
                        {c.facility_type || '—'} · {c.priority}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs uppercase tracking-wide bg-slate-100 px-2 py-0.5 rounded">
                        {c.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {remaining ? (
                        <span
                          className={
                            remaining.urgencyLevel === 'overdue' || remaining.urgencyLevel === 'critical'
                              ? 'text-red-700 font-medium'
                              : remaining.urgencyLevel === 'warning'
                              ? 'text-amber-700'
                              : 'text-slate-700'
                          }
                        >
                          {remaining.isOverdue ? 'Overdue' : `${remaining.hours}h ${remaining.minutes}m`}
                        </span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/firstmover/cases/${c.id}`}
                        className="text-xs bg-[#0c2340] text-white rounded px-3 py-1.5 hover:bg-[#173869]"
                      >
                        Review
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
