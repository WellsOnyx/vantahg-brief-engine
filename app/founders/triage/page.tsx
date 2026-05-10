'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import type { Case } from '@/lib/types';
import type { TriageDecision, TriageLane } from '@/lib/founders/triage';

const PENDING_STATUSES = new Set(['intake', 'processing', 'brief_ready']);

const LANE_BADGES: Record<TriageLane, { label: string; className: string }> = {
  csr_review: { label: 'CSR review', className: 'bg-amber-100 text-amber-800 border-amber-200' },
  lpn:        { label: 'LPN',         className: 'bg-sky-100 text-sky-800 border-sky-200' },
  rn:         { label: 'RN',          className: 'bg-indigo-100 text-indigo-800 border-indigo-200' },
  md:         { label: 'MD',          className: 'bg-rose-100 text-rose-800 border-rose-200' },
  auto_approve: { label: 'Auto',      className: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
};

export default function FoundersTriagePage() {
  const [cases, setCases] = useState<Case[]>([]);
  const [loading, setLoading] = useState(true);
  const [decisions, setDecisions] = useState<Record<string, TriageDecision>>({});
  const [running, setRunning] = useState(false);
  const [applying, setApplying] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [resultMessage, setResultMessage] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/cases')
      .then((r) => r.json())
      .then((data: Case[]) => {
        const pending = (data || []).filter((c) => PENDING_STATUSES.has(c.status));
        setCases(pending);
        setSelected(new Set(pending.map((c) => c.id)));
      })
      .catch(() => setCases([]))
      .finally(() => setLoading(false));
  }, []);

  async function runTriage() {
    if (selected.size === 0) return;
    setRunning(true);
    setResultMessage(null);
    try {
      const res = await fetch('/api/founders/triage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ case_ids: Array.from(selected), apply: false }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Triage failed');
      const map: Record<string, TriageDecision> = {};
      for (const d of data.decisions as TriageDecision[]) map[d.case_id] = d;
      setDecisions(map);
    } catch (err) {
      setResultMessage(err instanceof Error ? err.message : 'Triage failed');
    } finally {
      setRunning(false);
    }
  }

  async function applyTriage() {
    if (Object.keys(decisions).length === 0) return;
    setApplying(true);
    setResultMessage(null);
    try {
      const res = await fetch('/api/founders/triage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ case_ids: Object.keys(decisions), apply: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Apply failed');
      setResultMessage(`Applied to ${data.applied_count} cases. ${data.failures?.length ? `${data.failures.length} failed.` : ''}`);
    } catch (err) {
      setResultMessage(err instanceof Error ? err.message : 'Apply failed');
    } finally {
      setApplying(false);
    }
  }

  function toggle(id: string) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const summary = useMemo(() => {
    const ds = Object.values(decisions);
    if (ds.length === 0) return null;
    const byLane = ds.reduce<Record<string, number>>((m, d) => {
      m[d.lane] = (m[d.lane] || 0) + 1;
      return m;
    }, {});
    return { total: ds.length, byLane };
  }, [decisions]);

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="font-serif text-2xl">Bulk triage</h1>
          <p className="text-sm text-slate-600 mt-1">
            Route a batch of pending cases to LPN / RN / MD lanes by service type, SLA, and
            complexity. Preview the decisions before applying.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={runTriage}
            disabled={running || selected.size === 0}
            className="text-sm border border-[#0c2340] text-[#0c2340] rounded px-4 py-2 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {running ? 'Running…' : `Run triage (${selected.size})`}
          </button>
          <button
            type="button"
            onClick={applyTriage}
            disabled={applying || Object.keys(decisions).length === 0}
            className="text-sm bg-[#c9a227] text-[#0c2340] font-medium rounded px-4 py-2 disabled:bg-slate-300 disabled:cursor-not-allowed"
          >
            {applying ? 'Applying…' : `Apply (${Object.keys(decisions).length})`}
          </button>
        </div>
      </div>

      {summary && (
        <div className="bg-white border border-slate-200 rounded-lg p-4 flex items-center gap-6 text-sm">
          <div>
            <span className="text-slate-500">Triaged:</span> <strong>{summary.total}</strong>
          </div>
          {(['csr_review', 'lpn', 'rn', 'md'] as TriageLane[]).map((lane) => (
            <div key={lane} className="flex items-center gap-2">
              <span className={`inline-block text-[10px] uppercase tracking-wide border rounded px-2 py-0.5 ${LANE_BADGES[lane].className}`}>
                {LANE_BADGES[lane].label}
              </span>
              <span><strong>{summary.byLane[lane] || 0}</strong></span>
            </div>
          ))}
        </div>
      )}

      {resultMessage && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 rounded p-3 text-sm">
          {resultMessage}
        </div>
      )}

      {loading ? (
        <div className="text-sm text-slate-500">Loading pending cases&hellip;</div>
      ) : cases.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded p-8 text-center text-sm text-slate-500">
          No pending cases to triage.
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-600">
              <tr>
                <th className="text-left px-3 py-2 w-10">
                  <input
                    type="checkbox"
                    checked={selected.size === cases.length && cases.length > 0}
                    onChange={(e) => {
                      if (e.target.checked) setSelected(new Set(cases.map((c) => c.id)));
                      else setSelected(new Set());
                    }}
                  />
                </th>
                <th className="text-left px-3 py-2">Case #</th>
                <th className="text-left px-3 py-2">Service</th>
                <th className="text-left px-3 py-2">Type</th>
                <th className="text-left px-3 py-2">Recommended lane</th>
                <th className="text-left px-3 py-2">Priority</th>
                <th className="text-left px-3 py-2">Reasons</th>
              </tr>
            </thead>
            <tbody>
              {cases.map((c) => {
                const d = decisions[c.id];
                return (
                  <tr key={c.id} className="border-t border-slate-100 align-top">
                    <td className="px-3 py-3">
                      <input
                        type="checkbox"
                        checked={selected.has(c.id)}
                        onChange={() => toggle(c.id)}
                      />
                    </td>
                    <td className="px-3 py-3 font-mono text-xs">
                      <Link href={`/founders/cases/${c.id}`} className="hover:underline">
                        {c.case_number}
                      </Link>
                    </td>
                    <td className="px-3 py-3">
                      <div className="text-slate-900">{c.procedure_description || '—'}</div>
                      <div className="text-xs text-slate-500">{c.service_category || '—'} · {c.facility_type || '—'}</div>
                    </td>
                    <td className="px-3 py-3 text-xs">{c.review_type || '—'}</td>
                    <td className="px-3 py-3">
                      {d ? (
                        <span className={`inline-block text-[10px] uppercase tracking-wide border rounded px-2 py-0.5 ${LANE_BADGES[d.lane].className}`}>
                          {LANE_BADGES[d.lane].label}
                        </span>
                      ) : (
                        <span className="text-xs text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-xs">
                      {d ? (
                        <span className={d.priority === 'expedited' || d.priority === 'urgent' ? 'text-red-700 font-medium' : 'text-slate-700'}>
                          {d.priority}
                        </span>
                      ) : (
                        <span className="text-slate-400">{c.priority || '—'}</span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-xs text-slate-600 max-w-md">
                      {d ? (
                        <ul className="space-y-0.5">
                          {d.reasons.slice(0, 3).map((r, i) => (
                            <li key={i}>• {r}</li>
                          ))}
                          {d.reasons.length > 3 && <li className="italic">+{d.reasons.length - 3} more</li>}
                        </ul>
                      ) : (
                        <span className="text-slate-400">Run triage to see reasons</span>
                      )}
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
