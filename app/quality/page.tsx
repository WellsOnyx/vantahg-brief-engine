'use client';

import { useEffect, useState } from 'react';
import type { QualityAudit, Staff } from '@/lib/types';

interface QualityMetrics {
  total_audits: number;
  avg_criteria_accuracy: number;
  avg_documentation_quality: number;
  avg_overall_score: number;
  sla_compliance_rate: number;
  determination_accuracy_rate: number;
  audits_by_auditor: { auditor_id: string; count: number; avg_score: number }[];
  audits_by_staff: { staff_id: string; count: number; avg_score: number }[];
}

export default function QualityPage() {
  const [audits, setAudits] = useState<QualityAudit[]>([]);
  const [metrics, setMetrics] = useState<QualityMetrics | null>(null);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'audits'>('dashboard');

  useEffect(() => {
    Promise.all([fetchAudits(), fetchMetrics(), fetchStaff()]).finally(() => setLoading(false));
  }, []);

  async function fetchAudits() {
    try {
      const res = await fetch('/api/quality/audits');
      if (res.ok) setAudits(await res.json());
    } catch { /* ok */ }
  }

  async function fetchMetrics() {
    try {
      const res = await fetch('/api/quality/metrics');
      if (res.ok) setMetrics(await res.json());
    } catch { /* ok */ }
  }

  async function fetchStaff() {
    try {
      const res = await fetch('/api/staff');
      if (res.ok) setStaff(await res.json());
    } catch { /* ok */ }
  }

  function getStaffName(id: string): string {
    return staff.find((s) => s.id === id)?.name || id.slice(0, 8);
  }

  function getStaffRole(id: string): string {
    return staff.find((s) => s.id === id)?.role?.toUpperCase() || '';
  }

  function scoreColor(score: number): string {
    if (score >= 90) return 'text-green-600';
    if (score >= 70) return 'text-yellow-600';
    return 'text-red-600';
  }

  function scoreBg(score: number): string {
    if (score >= 90) return 'bg-green-500';
    if (score >= 70) return 'bg-yellow-500';
    return 'bg-red-500';
  }

  return (
    <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="font-[family-name:var(--font-dm-serif)] text-3xl text-navy">Quality Assurance</h1>
          <p className="text-muted mt-1">URAC compliance monitoring, audit history, and per-staff quality trends</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-surface rounded-lg border border-border p-1 w-fit">
        {(['dashboard', 'audits'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              activeTab === tab ? 'bg-navy text-white' : 'text-muted hover:text-foreground hover:bg-gray-100'
            }`}
          >
            {tab === 'dashboard' ? 'Quality Dashboard' : 'Audit History'}
          </button>
        ))}
      </div>

      {error && (
        <div className="mb-6 bg-surface rounded-xl border border-red-200 shadow-sm p-6">
          <p className="text-sm text-red-700">{error}</p>
          <button onClick={() => { setError(null); setLoading(true); Promise.all([fetchAudits(), fetchMetrics()]).finally(() => setLoading(false)); }} className="mt-2 text-sm text-navy hover:underline">Retry</button>
        </div>
      )}

      {loading ? (
        <div className="space-y-6 animate-fade-in">
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="bg-surface rounded-lg border border-border p-4">
                <div className="skeleton w-20 h-3 rounded mb-2" />
                <div className="skeleton w-16 h-6 rounded" />
              </div>
            ))}
          </div>
          <div className="bg-surface rounded-lg border border-border p-6">
            <div className="skeleton w-48 h-5 rounded mb-4" />
            <div className="space-y-3">{[...Array(3)].map((_, i) => (<div key={i} className="skeleton w-full h-3 rounded" />))}</div>
          </div>
        </div>
      ) : activeTab === 'dashboard' ? (
        <div className="space-y-6">
          {/* KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: 'Total Audits', value: metrics?.total_audits ?? audits.length, color: 'text-navy', suffix: '' },
              { label: 'Avg Quality Score', value: metrics?.avg_overall_score ?? 0, color: scoreColor(metrics?.avg_overall_score ?? 0), suffix: '%' },
              { label: 'SLA Compliance', value: metrics?.sla_compliance_rate ?? 0, color: scoreColor(metrics?.sla_compliance_rate ?? 0), suffix: '%' },
              { label: 'Determination Accuracy', value: metrics?.determination_accuracy_rate ?? 0, color: scoreColor(metrics?.determination_accuracy_rate ?? 0), suffix: '%' },
            ].map((kpi) => (
              <div key={kpi.label} className="bg-surface rounded-lg border border-border p-5">
                <div className="text-xs font-medium text-muted uppercase tracking-wider">{kpi.label}</div>
                <div className={`text-3xl font-bold ${kpi.color} mt-1 tabular-nums`}>
                  {typeof kpi.value === 'number' ? kpi.value.toFixed(kpi.suffix === '%' ? 1 : 0) : kpi.value}{kpi.suffix}
                </div>
              </div>
            ))}
          </div>

          {/* Criteria & Documentation */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-surface rounded-lg border border-border p-6">
              <h3 className="font-[family-name:var(--font-dm-serif)] text-lg text-navy mb-4">Criteria Accuracy</h3>
              <div className="flex items-center gap-4">
                <div className="w-20 h-20 rounded-full border-4 border-navy/10 flex items-center justify-center">
                  <span className={`text-2xl font-bold ${scoreColor(metrics?.avg_criteria_accuracy ?? 0)}`}>{(metrics?.avg_criteria_accuracy ?? 0).toFixed(0)}%</span>
                </div>
                <div className="flex-1">
                  <div className="w-full h-3 bg-gray-200 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${scoreBg(metrics?.avg_criteria_accuracy ?? 0)}`} style={{ width: `${metrics?.avg_criteria_accuracy ?? 0}%` }} />
                  </div>
                  <p className="text-xs text-muted mt-2">Average accuracy of LPN criteria matching against InterQual/MCG guidelines</p>
                </div>
              </div>
            </div>
            <div className="bg-surface rounded-lg border border-border p-6">
              <h3 className="font-[family-name:var(--font-dm-serif)] text-lg text-navy mb-4">Documentation Quality</h3>
              <div className="flex items-center gap-4">
                <div className="w-20 h-20 rounded-full border-4 border-navy/10 flex items-center justify-center">
                  <span className={`text-2xl font-bold ${scoreColor(metrics?.avg_documentation_quality ?? 0)}`}>{(metrics?.avg_documentation_quality ?? 0).toFixed(0)}%</span>
                </div>
                <div className="flex-1">
                  <div className="w-full h-3 bg-gray-200 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${scoreBg(metrics?.avg_documentation_quality ?? 0)}`} style={{ width: `${metrics?.avg_documentation_quality ?? 0}%` }} />
                  </div>
                  <p className="text-xs text-muted mt-2">Average quality of clinical documentation and review notes</p>
                </div>
              </div>
            </div>
          </div>

          {/* Per-Staff Scores */}
          <div className="bg-surface rounded-lg border border-border overflow-hidden">
            <div className="px-6 py-4 border-b border-border">
              <h3 className="font-[family-name:var(--font-dm-serif)] text-lg text-navy">Staff Quality Scores</h3>
              <p className="text-xs text-muted mt-0.5">Per-staff audit results from RN quality reviews</p>
            </div>
            {(metrics?.audits_by_staff && metrics.audits_by_staff.length > 0) ? (
              <div className="divide-y divide-border">
                {metrics.audits_by_staff.map((entry) => (
                  <div key={entry.staff_id} className="px-6 py-3 flex items-center gap-4">
                    <div className="flex-1">
                      <div className="font-medium text-sm">{getStaffName(entry.staff_id)}</div>
                      <div className="text-xs text-muted">{getStaffRole(entry.staff_id)} &middot; {entry.count} audits</div>
                    </div>
                    <div className="w-32 h-2 bg-gray-200 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${scoreBg(entry.avg_score)}`} style={{ width: `${entry.avg_score}%` }} />
                    </div>
                    <span className={`text-sm font-bold tabular-nums min-w-[48px] text-right ${scoreColor(entry.avg_score)}`}>{entry.avg_score.toFixed(0)}%</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-8 text-center text-sm text-muted">No per-staff data available. Quality audits will populate this view.</div>
            )}
          </div>
        </div>
      ) : (
        /* Audit History Tab */
        <div className="bg-surface rounded-lg border border-border shadow-sm overflow-hidden">
          {audits.length === 0 ? (
            <div className="p-12 text-center animate-slide-up">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-navy/5 flex items-center justify-center">
                <svg className="w-8 h-8 text-navy/30" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              </div>
              <h3 className="font-semibold text-base font-[family-name:var(--font-dm-serif)]">No audits yet</h3>
              <p className="text-sm text-muted mt-2 max-w-sm mx-auto">Quality audits will appear here as RNs review LPN case work for URAC compliance.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-gray-50">
                    <th className="text-left px-5 py-3 font-medium text-muted">Date</th>
                    <th className="text-left px-5 py-3 font-medium text-muted">Auditor (RN)</th>
                    <th className="text-left px-5 py-3 font-medium text-muted">Staff Audited</th>
                    <th className="text-right px-5 py-3 font-medium text-muted">Criteria</th>
                    <th className="text-right px-5 py-3 font-medium text-muted">Docs</th>
                    <th className="text-center px-5 py-3 font-medium text-muted">SLA</th>
                    <th className="text-center px-5 py-3 font-medium text-muted">Determ.</th>
                    <th className="text-right px-5 py-3 font-medium text-muted">Overall</th>
                    <th className="text-left px-5 py-3 font-medium text-muted">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {audits.map((audit) => (
                    <tr key={audit.id} className="border-b border-border hover:bg-gray-50/70 transition-colors">
                      <td className="px-5 py-3 text-muted text-xs whitespace-nowrap">{new Date(audit.created_at).toLocaleDateString()}</td>
                      <td className="px-5 py-3 font-medium">{getStaffName(audit.auditor_id)}</td>
                      <td className="px-5 py-3">
                        <div>{getStaffName(audit.audited_staff_id)}</div>
                        <div className="text-xs text-muted">{getStaffRole(audit.audited_staff_id)}</div>
                      </td>
                      <td className={`px-5 py-3 text-right font-medium tabular-nums ${scoreColor(audit.criteria_accuracy)}`}>{audit.criteria_accuracy}%</td>
                      <td className={`px-5 py-3 text-right font-medium tabular-nums ${scoreColor(audit.documentation_quality)}`}>{audit.documentation_quality}%</td>
                      <td className="px-5 py-3 text-center">
                        <span className={audit.sla_compliance ? 'text-green-600 font-bold' : 'text-red-600 font-bold'}>{audit.sla_compliance ? '\u2713' : '\u2717'}</span>
                      </td>
                      <td className="px-5 py-3 text-center">
                        <span className={audit.determination_appropriate ? 'text-green-600 font-bold' : 'text-red-600 font-bold'}>{audit.determination_appropriate ? '\u2713' : '\u2717'}</span>
                      </td>
                      <td className="px-5 py-3 text-right">
                        <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-bold ${audit.overall_score >= 90 ? 'bg-green-100 text-green-800' : audit.overall_score >= 70 ? 'bg-yellow-100 text-yellow-800' : 'bg-red-100 text-red-800'}`}>{audit.overall_score}%</span>
                      </td>
                      <td className="px-5 py-3 text-xs text-muted max-w-[200px] truncate">{audit.notes || '---'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {audits.length > 0 && (
            <div className="px-5 py-3 border-t border-border bg-gray-50/50 text-xs text-muted">{audits.length} audit{audits.length !== 1 ? 's' : ''} total</div>
          )}
        </div>
      )}
    </div>
  );
}
