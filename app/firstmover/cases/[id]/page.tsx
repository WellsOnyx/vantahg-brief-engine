'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { CaseBrief } from '@/components/CaseBrief';
import { DeterminationForm, type DeterminationFields } from '@/components/DeterminationForm';
import { SlaTracker } from '@/components/SlaTracker';
import { AuditTimeline } from '@/components/AuditTimeline';
import type { Case, AuditLogEntry } from '@/lib/types';

export default function FirstMoverCaseDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [caseData, setCaseData] = useState<Case | null>(null);
  const [audit, setAudit] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [caseRes, auditRes] = await Promise.all([
        fetch(`/api/cases/${id}`),
        fetch(`/api/cases/${id}/audit`),
      ]);
      const caseJson = await caseRes.json();
      const auditJson = await auditRes.json();
      setCaseData(caseJson);
      setAudit(Array.isArray(auditJson) ? auditJson : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load case');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  async function submitDetermination(fields: DeterminationFields) {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/cases/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          determination: fields.determination,
          determination_rationale: fields.rationale,
          denial_reason: fields.denial_reason,
          denial_criteria_cited: fields.denial_criteria_cited,
          alternative_recommended: fields.alternative_recommended,
          status: 'determination_made',
          determination_at: new Date().toISOString(),
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to save determination');
      }
      router.push('/firstmover/queue');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Submit failed');
    } finally {
      setSubmitting(false);
    }
  }

  async function pauseSla(reason: string) {
    setSubmitting(true);
    try {
      const res = await fetch(`/api/cases/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sla_paused_at: new Date().toISOString(),
          sla_pause_reason: reason,
          status: 'pend',
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Pause failed');
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Pause failed');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <div className="text-sm text-slate-500">Loading case&hellip;</div>;
  if (!caseData) return <div className="text-sm text-red-700">Case not found.</div>;

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between">
        <div>
          <Link href="/firstmover/queue" className="text-xs text-slate-500 hover:text-slate-900">
            ← Back to queue
          </Link>
          <h1 className="font-serif text-2xl mt-1">{caseData.case_number}</h1>
          <p className="text-sm text-slate-600">
            {caseData.patient_name} · {caseData.procedure_description || '—'}
          </p>
        </div>
        <div className="text-right text-sm">
          {caseData.turnaround_deadline && (
            <SlaTracker deadline={caseData.turnaround_deadline} compact />
          )}
          {caseData.sla_paused_at && (
            <div className="text-xs text-amber-700 mt-1">
              Paused: {caseData.sla_pause_reason || 'reason not recorded'}
            </div>
          )}
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded p-3 text-sm text-red-800">{error}</div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-5">
        <div className="space-y-5">
          {caseData.ai_brief && (
            <section className="bg-white border border-slate-200 rounded-lg p-4">
              <h2 className="font-serif text-lg mb-3">Clinical brief</h2>
              <CaseBrief
                brief={caseData.ai_brief}
                caseNumber={caseData.case_number}
                factCheck={caseData.fact_check ?? null}
              />
            </section>
          )}

          <section className="bg-white border border-slate-200 rounded-lg p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-serif text-lg">Determination</h2>
              {!caseData.sla_paused_at && (
                <button
                  type="button"
                  onClick={() => {
                    const reason = window.prompt('Pause reason (e.g., "Awaiting clinicals from Dr. Smith"):');
                    if (reason) pauseSla(reason);
                  }}
                  disabled={submitting}
                  className="text-xs border border-slate-300 rounded px-3 py-1.5 hover:bg-slate-50"
                >
                  Pend & pause SLA
                </button>
              )}
            </div>
            <DeterminationForm onSubmit={submitDetermination} isSubmitting={submitting} />
          </section>
        </div>

        <aside className="space-y-4">
          <section className="bg-white border border-slate-200 rounded-lg p-4">
            <h3 className="font-serif text-base mb-2">Audit timeline</h3>
            <AuditTimeline entries={audit} />
          </section>
        </aside>
      </div>
    </div>
  );
}
