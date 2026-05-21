'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { StatusBadge, PriorityBadge } from '@/components/StatusBadge';
import {
  PageFocused,
  PageHero,
  PageEyebrow,
  PageSectionHeading,
  BackLink,
} from '@/components/layouts/PageLayouts';

/**
 * RN review surface (closes the LPN → RN → MD pipeline gate).
 *
 * Backend POST /api/cases/[id]/rn-review accepts:
 *   { determination: 'approve' | 'escalate_to_md', notes, rn_id }
 *
 * The route existed; this page is the missing UI gate. Without it RNs had
 * nowhere to land — the clinical pipeline stopped at LPN review.
 *
 * Layout: PageFocused. Left = brief recap + LPN handoff + decision card.
 * Right = sticky case context (patient / procedure / SLA).
 */

interface CaseLite {
  id: string;
  case_number: string;
  status: string;
  priority: string;
  patient_name: string | null;
  procedure_description: string | null;
  procedure_codes: string[] | null;
  diagnosis_codes: string[] | null;
  payer_name: string | null;
  turnaround_deadline: string | null;
  ai_brief?: { ai_recommendation?: { recommendation?: string; confidence?: string; rationale?: string } } | null;
  lpn_determination?: { determination?: string; notes?: string; lpn_id?: string; reviewed_at?: string } | null;
  assigned_rn_id?: string | null;
}

type Determination = 'approve' | 'escalate_to_md';

export default function RnReviewPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params.id;

  const [caseData, setCaseData] = useState<CaseLite | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [accessStatus, setAccessStatus] = useState<'unknown' | 'ok' | 'forbidden' | 'unauth'>('unknown');

  const [determination, setDetermination] = useState<Determination | null>(null);
  const [notes, setNotes] = useState('');
  const [rnId, setRnId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(`/api/cases/${id}`, { cache: 'no-store' });
        if (cancelled) return;
        if (res.status === 401) {
          setAccessStatus('unauth');
          return;
        }
        if (res.status === 403) {
          setAccessStatus('forbidden');
          return;
        }
        if (!res.ok) {
          setAccessStatus('ok');
          setLoadError(`Could not load case (${res.status}).`);
          return;
        }
        const data = (await res.json()) as CaseLite;
        if (!cancelled) {
          setCaseData(data);
          setRnId(data.assigned_rn_id ?? '');
          setAccessStatus('ok');
        }
      } catch {
        if (!cancelled) {
          setAccessStatus('ok');
          setLoadError('Network error. Try again.');
        }
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [id]);

  async function handleSubmit() {
    setSubmitError(null);
    setSubmitSuccess(null);

    if (!determination) {
      setSubmitError('Pick a determination: Approve at RN level, or Escalate to MD.');
      return;
    }
    const trimmed = notes.trim();
    if (trimmed.length < 30) {
      setSubmitError('Notes must be at least 30 characters — your reasoning is the audit gate.');
      return;
    }
    if (!rnId) {
      setSubmitError('RN ID is required (auto-populated from your assignment).');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`/api/cases/${id}/rn-review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ determination, notes: trimmed, rn_id: rnId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSubmitError(data.error ?? `Failed (${res.status})`);
        return;
      }
      setSubmitSuccess(data.message ?? 'Review submitted.');
      setTimeout(() => router.push(`/cases/${id}`), 1500);
    } catch {
      setSubmitError('Network error. Try again.');
    } finally {
      setSubmitting(false);
    }
  }

  if (accessStatus === 'unknown') {
    return (
      <PageFocused hero={<PageHero eyebrow="RN Review" title="Loading…" />}>
        <div className="space-y-4">
          <div className="skeleton skeleton-heading" />
          <div className="skeleton skeleton-text" />
        </div>
      </PageFocused>
    );
  }
  if (accessStatus === 'unauth') {
    return (
      <PageFocused hero={<PageHero eyebrow="RN Review" title="Sign in required" />}>
        <div className="card p-8 text-center">
          <Link href={`/login?redirect=/cases/${id}/rn-review`} className="btn btn-primary inline-flex">
            Go to login
          </Link>
        </div>
      </PageFocused>
    );
  }
  if (accessStatus === 'forbidden') {
    return (
      <PageFocused hero={<PageHero eyebrow="RN Review" title="Restricted" />}>
        <div className="card p-8 text-center">
          <p className="text-sm text-muted">
            RN review requires reviewer or admin role. Contact your delivery lead.
          </p>
        </div>
      </PageFocused>
    );
  }
  if (loadError || !caseData) {
    return (
      <PageFocused hero={<PageHero eyebrow="RN Review" title="We hit a snag" subtitle={loadError ?? 'Could not load the case.'} />}>
        <div className="card p-6 text-center">
          <Link href={`/cases/${id}`} className="btn btn-secondary">
            Back to case
          </Link>
        </div>
      </PageFocused>
    );
  }

  const aiRec = caseData.ai_brief?.ai_recommendation;

  return (
    <PageFocused
      hero={
        <PageHero
          eyebrow={`RN Review · ${caseData.case_number}`}
          title={caseData.patient_name || 'Unnamed case'}
          subtitle={caseData.procedure_description || 'No procedure description.'}
          actions={<BackLink href={`/cases/${id}`} label="Back to case" />}
        >
          <div className="flex flex-wrap items-center gap-2 mt-2">
            <StatusBadge status={caseData.status as never} />
            <PriorityBadge priority={caseData.priority as never} />
            {caseData.payer_name && (
              <span className="text-[11px] uppercase tracking-wide text-white/60 border border-white/20 px-2 py-0.5 rounded-full">
                {caseData.payer_name}
              </span>
            )}
          </div>
        </PageHero>
      }
    >
      <PageFocused.Body
        main={
          <>
            {aiRec && (
              <section className="card p-6">
                <PageEyebrow>AI brief recommendation</PageEyebrow>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <span className="text-[11px] uppercase tracking-wide text-muted">Suggests</span>
                  <span className="text-base font-semibold text-navy capitalize">
                    {aiRec.recommendation ?? '—'}
                  </span>
                  {aiRec.confidence && (
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border ${
                        aiRec.confidence === 'high'
                          ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                          : aiRec.confidence === 'medium'
                            ? 'bg-amber-50 text-amber-800 border-amber-200'
                            : 'bg-red-50 text-red-800 border-red-200'
                      }`}
                    >
                      {aiRec.confidence} confidence
                    </span>
                  )}
                </div>
                {aiRec.rationale && (
                  <p className="text-sm text-muted mt-3 whitespace-pre-wrap">{aiRec.rationale}</p>
                )}
                <Link
                  href={`/cases/${id}/brief`}
                  className="text-xs text-navy hover:text-gold-dark underline underline-offset-2 mt-3 inline-block"
                >
                  Open full brief →
                </Link>
              </section>
            )}

            {caseData.lpn_determination && (
              <section className="card p-6 border-teal-200 bg-teal-50/40">
                <PageEyebrow>LPN review</PageEyebrow>
                <div className="mt-3">
                  <span className="text-[11px] uppercase tracking-wide text-muted">Determined</span>
                  <p className="text-base font-semibold text-navy capitalize mt-0.5">
                    {caseData.lpn_determination.determination ?? '—'}
                  </p>
                </div>
                {caseData.lpn_determination.notes && (
                  <p className="text-sm text-foreground mt-3 whitespace-pre-wrap">
                    {caseData.lpn_determination.notes}
                  </p>
                )}
                {caseData.lpn_determination.reviewed_at && (
                  <p className="text-[11px] text-muted mt-2">
                    {new Date(caseData.lpn_determination.reviewed_at).toLocaleString()}
                  </p>
                )}
              </section>
            )}

            <section className="card p-6 md:p-8">
              <PageSectionHeading>Your determination</PageSectionHeading>
              <p className="text-sm text-muted -mt-2 mb-5">
                The LPN passed this up. Your reasoning is the audit gate — at least 30 characters required.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setDetermination('approve')}
                  className={`px-4 py-4 rounded-lg border text-left transition ${
                    determination === 'approve'
                      ? 'bg-emerald-50 border-emerald-300 ring-2 ring-emerald-200'
                      : 'bg-surface border-border hover:border-emerald-300 hover:shadow-sm'
                  }`}
                >
                  <p className="text-sm font-bold text-emerald-900">Approve at RN level</p>
                  <p className="text-xs text-muted mt-1">
                    Case meets criteria. No physician review needed. Routes to determination_made.
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => setDetermination('escalate_to_md')}
                  className={`px-4 py-4 rounded-lg border text-left transition ${
                    determination === 'escalate_to_md'
                      ? 'bg-purple-50 border-purple-300 ring-2 ring-purple-200'
                      : 'bg-surface border-border hover:border-purple-300 hover:shadow-sm'
                  }`}
                >
                  <p className="text-sm font-bold text-purple-900">Escalate to MD</p>
                  <p className="text-xs text-muted mt-1">
                    Needs physician judgment. Status flips to md_review. Document why below.
                  </p>
                </button>
              </div>

              <label className="block mt-5">
                <span className="block text-xs uppercase tracking-wide text-muted font-semibold mb-1.5">
                  Reasoning notes <span className="text-red-700">*</span>
                </span>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={5}
                  placeholder="Walk through your clinical reasoning. What criteria did you weigh? What evidence informed your call?"
                  className="w-full px-3 py-2.5 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gold/40 resize-y"
                />
                <div className="flex items-center justify-between mt-1">
                  <span className="text-[11px] text-muted">≥30 characters required</span>
                  <span className={`text-[11px] font-semibold ${notes.trim().length >= 30 ? 'text-emerald-700' : 'text-muted'}`}>
                    {notes.trim().length}
                  </span>
                </div>
              </label>

              <label className="block mt-4">
                <span className="block text-xs uppercase tracking-wide text-muted font-semibold mb-1.5">
                  Your RN ID
                </span>
                <input
                  type="text"
                  value={rnId}
                  onChange={(e) => setRnId(e.target.value)}
                  placeholder="e.g. user-uuid (auto-populated from assignment)"
                  className="w-full px-3 py-2 border border-border rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-gold/40"
                />
              </label>

              {submitError && (
                <div className="mt-4 rounded-lg bg-red-50 border border-red-200 text-red-800 px-3 py-2 text-sm">
                  {submitError}
                </div>
              )}
              {submitSuccess && (
                <div className="mt-4 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 px-3 py-2 text-sm">
                  {submitSuccess} Returning to case…
                </div>
              )}

              <div className="mt-5 flex flex-col sm:flex-row gap-3 justify-end">
                <Link href={`/cases/${id}`} className="btn btn-secondary text-center">
                  Cancel
                </Link>
                <button
                  onClick={handleSubmit}
                  disabled={submitting || !determination || notes.trim().length < 30}
                  className="btn btn-primary disabled:opacity-50"
                >
                  {submitting ? 'Submitting…' : 'Submit RN review'}
                </button>
              </div>
            </section>
          </>
        }
        aside={
          <div className="space-y-4">
            <div className="card p-5">
              <PageEyebrow>Patient</PageEyebrow>
              <p className="font-semibold text-navy mt-2">{caseData.patient_name ?? '(no name)'}</p>
            </div>

            <div className="card p-5">
              <PageEyebrow>Procedure</PageEyebrow>
              <p className="text-sm text-foreground mt-2">{caseData.procedure_description ?? '—'}</p>
              {caseData.procedure_codes && caseData.procedure_codes.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1">
                  {caseData.procedure_codes.map((c) => (
                    <span key={c} className="inline-block bg-navy/10 text-navy px-2 py-0.5 rounded text-[11px] font-mono">
                      {c}
                    </span>
                  ))}
                </div>
              )}
              {caseData.diagnosis_codes && caseData.diagnosis_codes.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {caseData.diagnosis_codes.map((c) => (
                    <span key={c} className="inline-block bg-gold/10 text-gold-dark px-2 py-0.5 rounded text-[11px] font-mono">
                      {c}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {caseData.turnaround_deadline && (
              <div className="card p-5">
                <PageEyebrow>SLA</PageEyebrow>
                <p className="font-[family-name:var(--font-display)] text-2xl text-navy mt-2">
                  {new Date(caseData.turnaround_deadline).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                </p>
                <p className="text-[11px] text-muted">Determined-by deadline</p>
              </div>
            )}
          </div>
        }
      />
    </PageFocused>
  );
}
