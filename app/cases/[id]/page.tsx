'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { CaseBrief } from '@/components/CaseBrief';
import { StatusBadge, PriorityBadge } from '@/components/StatusBadge';
import { AuditTimeline } from '@/components/AuditTimeline';
import { ReviewerPanel } from '@/components/ReviewerPanel';
import { DeterminationForm } from '@/components/DeterminationForm';
import type { DeterminationFields } from '@/components/DeterminationForm';
import { ConciergeValidationForm } from '@/components/ConciergeValidationForm';
import { AppealHandoffBanner } from '@/components/AppealHandoffBanner';
import { AppealContextBanner } from '@/components/AppealContextBanner';
import { FileFirstAppealModal } from '@/components/FileFirstAppealModal';
import { SlaTracker } from '@/components/SlaTracker';
import { CopilotSidebar } from '@/components/chat/CopilotSidebar';
import { useStreamingBrief } from '@/lib/hooks/use-streaming-brief';
import type { Case, Reviewer, AuditLogEntry } from '@/lib/types';
import { PageHero, BackLink } from '@/components/layouts/PageLayouts';

const SERVICE_CATEGORY_LABELS: Record<string, string> = {
  imaging: 'Imaging',
  surgery: 'Surgery',
  specialty_referral: 'Specialty Referral',
  dme: 'Durable Medical Equipment',
  infusion: 'Infusion Therapy',
  behavioral_health: 'Behavioral Health',
  rehab_therapy: 'Rehabilitation Therapy',
  home_health: 'Home Health',
  skilled_nursing: 'Skilled Nursing',
  transplant: 'Transplant',
  genetic_testing: 'Genetic Testing',
  pain_management: 'Pain Management',
  cardiology: 'Cardiology',
  oncology: 'Oncology',
  other: 'Other',
};

const FACILITY_TYPE_LABELS: Record<string, string> = {
  inpatient: 'Inpatient',
  outpatient: 'Outpatient',
  asc: 'Ambulatory Surgery Center',
  office: 'Office',
  home: 'Home',
};

export default function CaseDetailPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const id = params.id as string;

  const [caseData, setCaseData] = useState<Case | null>(null);
  const [reviewers, setReviewers] = useState<Reviewer[]>([]);
  const [auditLog, setAuditLog] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [submittingDetermination, setSubmittingDetermination] = useState(false);
  const [submittingValidation, setSubmittingValidation] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Appeal flow state
  const [showAppealModal, setShowAppealModal] = useState(false);
  const [appealSuccessInfo, setAppealSuccessInfo] = useState<{ caseId: string; caseNumber: string } | null>(null);

  // AI Automation Layer: Streaming brief for white-glove live generation UX (Track A)
  const streamingBrief = useStreamingBrief();

  const fetchCase = useCallback(async () => {
    try {
      const res = await fetch(`/api/cases/${id}`);
      if (!res.ok) {
        if (res.status === 404) {
          setError('Case not found');
        } else {
          setError('Failed to load case details');
        }
        return;
      }
      const data = await res.json();
      setCaseData(data);
      setError(null);
    } catch (err) {
      console.error('Failed to fetch case:', err);
      setError('Failed to load case details. Please check your connection and try again.');
    }
  }, [id]);

  const fetchAudit = useCallback(async () => {
    try {
      const res = await fetch(`/api/cases/${id}/audit`);
      if (res.ok) {
        const data = await res.json();
        setAuditLog(data);
      }
    } catch {
      // Audit log may not exist yet
    }
  }, [id]);

  useEffect(() => {
    async function loadAll() {
      setLoading(true);
      await Promise.all([
        fetchCase(),
        fetchAudit(),
        fetch('/api/reviewers').then((r) => r.json()).then(setReviewers).catch(() => []),
      ]);
      setLoading(false);
    }
    loadAll();
  }, [fetchCase, fetchAudit]);

  // Auto-open / scroll to concierge validation when arriving from review queue (?action=validate)
  useEffect(() => {
    if (searchParams?.get('action') === 'validate' && caseData?.status === 'brief_ready') {
      const el = document.getElementById('concierge-validation');
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        // brief highlight
        el.classList.add('ring-2', 'ring-emerald-400/70', 'ring-offset-2');
        setTimeout(() => el.classList.remove('ring-2', 'ring-emerald-400/70', 'ring-offset-2'), 1800);
      }
    }
  }, [searchParams, caseData?.status]);

  async function handleAssignReviewer(reviewerId: string) {
    try {
      await fetch(`/api/cases/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assigned_reviewer_id: reviewerId, status: 'md_review' }),
      });
      await fetchCase();
      await fetchAudit();
    } catch {
      setError('Failed to assign reviewer');
    }
  }

  async function handleDetermination(fields: DeterminationFields) {
    setSubmittingDetermination(true);
    try {
      await fetch(`/api/cases/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          determination: fields.determination,
          determination_rationale: fields.rationale,
          determination_at: new Date().toISOString(),
          determined_by: caseData?.assigned_reviewer_id,
          status: 'determination_made',
          ...(fields.denial_reason && { denial_reason: fields.denial_reason }),
          ...(fields.denial_criteria_cited && { denial_criteria_cited: fields.denial_criteria_cited }),
          ...(fields.alternative_recommended && { alternative_recommended: fields.alternative_recommended }),
          ...(fields.modification_details && { modification_details: fields.modification_details }),
          ...(fields.p2p_reason && { p2p_reason: fields.p2p_reason }),
          // AI Automation Layer (Track A): carry risk ack + notes into determination payload (persisted via audit in API; signals human reviewed the AI appeal likelihood)
          ...(fields.ai_risk_acknowledged && { ai_risk_acknowledged: fields.ai_risk_acknowledged }),
          ...(fields.ai_risk_notes && { ai_risk_notes: fields.ai_risk_notes }),
        }),
      });
      await fetchCase();
      await fetchAudit();

      // AI Automation Layer (Track C starter): Capture physician AI feedback from required rationale + determination choice.
      // Feeds the learning loop (analytics/appeals already consumes; future prompt augmentation + override dashboards).
      // Always after human has provided explicit reasoning (from 21-45 gate). Non-blocking, tenant-safe via auth.
      if (caseData?.ai_brief?.ai_recommendation?.recommendation) {
        const aiRec = caseData.ai_brief.ai_recommendation.recommendation;
        const humanDet = fields.determination;
        const agreement = humanDet === aiRec ? 'agree' : (humanDet === 'modify' || humanDet === 'peer_to_peer_requested' ? 'modified' : 'disagree');
        fetch(`/api/cases/${id}/physician-feedback`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            agreement,
            notes: (fields.rationale || fields.ai_risk_notes || 'Human determination submitted with explicit required rationale.').slice(0, 300),
          }),
        }).catch(() => {/* non-blocking */});
      }
    } catch {
      setError('Failed to submit determination');
    } finally {
      setSubmittingDetermination(false);
    }
  }

  async function handleRegenerateBrief() {
    try {
      setError(null);
      // AI Automation: Use streaming path for production-grade live "AI at work" UX.
      // The stream internally calls generate-brief (real or demo), persists to DB,
      // then yields sections progressively. On completion we refetch authoritative state.
      await streamingBrief.startStreaming(id);
      // After stream finishes (hook sets isStreaming=false), sync the persisted brief+factCheck
      // by refetching. This ensures full data (including any server-side enrichment) is authoritative.
      await fetchCase();
      await fetchAudit();
    } catch {
      setError('Failed to regenerate brief');
      streamingBrief.reset();
    }
  }

  // Phase 2: Lighter concierge validation gate — required reasoning before routing to clinical tiers
  async function handleConciergeValidation(payload: {
    rationale: string;
    flags: string[];
    fact_check_acknowledged?: boolean;
    fact_check_review_notes?: string;
  }) {
    setSubmittingValidation(true);
    try {
      const res = await fetch(`/api/cases/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'lpn_review',
          concierge_validation_rationale: payload.rationale,
          validation_flags: payload.flags,
          // Fact-check acknowledgment (when triggered by the form gate)
          fact_check_acknowledged: payload.fact_check_acknowledged,
          fact_check_review_notes: payload.fact_check_review_notes,
          updated_by: 'concierge',
        }),
      });
      if (!res.ok) {
        throw new Error('Validation submission failed');
      }
      await fetchCase();
      await fetchAudit();
      setError(null);
    } catch {
      setError('Failed to submit concierge validation. Please try again.');
    } finally {
      setSubmittingValidation(false);
    }
  }

  // First Appeal trigger + success handler (updates local state + refetches for fresh data + banners)
  function openAppealModal() {
    setShowAppealModal(true);
  }

  function handleAppealSuccess(appealCaseId: string, appealCaseNumber: string) {
    setAppealSuccessInfo({ caseId: appealCaseId, caseNumber: appealCaseNumber });
    // Refetch to pick up appeal_status on original and any other updates
    void fetchCase();
    void fetchAudit();
  }

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 animate-fade-in">
        {/* Header skeleton */}
        <div className="mb-6">
          <div className="skeleton w-24 h-4 rounded mb-3" />
          <div className="skeleton skeleton-heading w-64" />
          <div className="flex items-center gap-3 mt-2">
            <div className="skeleton skeleton-badge" />
            <div className="skeleton skeleton-badge" />
            <div className="skeleton w-16 h-4 rounded" />
          </div>
        </div>

        {/* Content skeleton */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left column skeletons */}
          <div className="lg:col-span-1 space-y-6">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="bg-surface rounded-lg border border-border p-5">
                <div className="skeleton w-32 h-3 rounded mb-4" />
                <div className="space-y-3">
                  <div className="skeleton skeleton-text w-full" />
                  <div className="skeleton skeleton-text w-3/4" />
                  <div className="skeleton skeleton-text w-1/2" />
                </div>
              </div>
            ))}
          </div>
          {/* Right column skeleton */}
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-surface rounded-lg border border-border p-6">
              <div className="skeleton skeleton-heading w-48 mb-4" />
              <div className="space-y-3">
                <div className="skeleton skeleton-text w-full" />
                <div className="skeleton skeleton-text w-full" />
                <div className="skeleton skeleton-text w-5/6" />
                <div className="skeleton skeleton-text w-2/3" />
              </div>
            </div>
            <div className="bg-surface rounded-lg border border-border p-6">
              <div className="skeleton skeleton-heading w-40 mb-4" />
              <div className="space-y-3">
                <div className="skeleton skeleton-text w-full" />
                <div className="skeleton skeleton-text w-4/5" />
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error && !caseData) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-center gap-3 mb-6">
          <Link href="/cases" className="text-muted hover:text-navy text-sm">&larr; Back to Cases</Link>
        </div>
        <div className="bg-surface rounded-xl border border-red-200 shadow-sm p-8 text-center animate-slide-up">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-50 flex items-center justify-center">
            <svg className="w-8 h-8 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
            </svg>
          </div>
 <h3 className="font-semibold text-lg text-foreground">
            {error === 'Case not found' ? 'Case Not Found' : 'Something went wrong'}
          </h3>
          <p className="text-sm text-muted mt-2 max-w-md mx-auto">
            {error === 'Case not found'
              ? 'The case you are looking for does not exist or may have been removed.'
              : error}
          </p>
          <div className="flex items-center justify-center gap-3 mt-6">
            <Link
              href="/cases"
              className="inline-flex items-center gap-2 bg-white border border-border px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
            >
              View All Cases
            </Link>
            {error !== 'Case not found' && (
              <button
                onClick={() => {
                  setError(null);
                  setLoading(true);
                  Promise.all([fetchCase(), fetchAudit()]).finally(() => setLoading(false));
                }}
                className="inline-flex items-center gap-2 bg-navy text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-navy-light transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182" />
                </svg>
                Retry
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (!caseData) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-center gap-3 mb-6">
          <Link href="/cases" className="text-muted hover:text-navy text-sm">&larr; Back to Cases</Link>
        </div>
        <div className="bg-surface rounded-xl border border-border shadow-sm p-8 text-center animate-slide-up">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-navy/5 flex items-center justify-center">
            <svg className="w-8 h-8 text-navy/30" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m5.231 13.481L15 17.25m-4.5-15H5.625c-.621 0-1.125.504-1.125 1.125v16.5c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9zm3.75 11.625a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
            </svg>
          </div>
 <h3 className="font-semibold text-lg text-foreground">Case Not Found</h3>
          <p className="text-sm text-muted mt-2">The case you are looking for does not exist or may have been removed.</p>
          <Link
            href="/cases"
            className="inline-flex items-center gap-2 bg-navy text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-navy-light transition-colors mt-6"
          >
            View All Cases
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-background min-h-screen">
      {/* ── Hero band (Phase 1 retrofit — editorial arrival moment) ─── */}
      <PageHero
        eyebrow={caseData.case_number}
        title={caseData.patient_name || `Case ${caseData.case_number}`}
        subtitle={
          caseData.procedure_description ? (
            <span className="text-white/75">{caseData.procedure_description}</span>
          ) : undefined
        }
        actions={<BackLink href="/cases" label="All cases" />}
      >
        <div className="flex flex-wrap items-center gap-2 mt-3">
          <StatusBadge status={caseData.status} />
          <PriorityBadge priority={caseData.priority} />
          {caseData.vertical && (
            <span className="text-[11px] uppercase tracking-wide text-white/70 border border-white/20 px-2 py-0.5 rounded-full capitalize">
              {caseData.vertical}
            </span>
          )}
          {caseData.review_type && (
            <span className="text-[11px] uppercase tracking-wide text-white/70 border border-white/20 px-2 py-0.5 rounded-full">
              {caseData.review_type.replace(/_/g, ' ')}
            </span>
          )}
        </div>
      </PageHero>

    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 -mt-8 pb-8">
      {/* Action toolbar (was the right side of the old header — kept on white card for legibility) */}
      <div className="card p-4 mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-end gap-3">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full sm:w-auto">
          {caseData.ai_brief && (
            <Link
              href={`/cases/${id}/brief`}
              className="inline-flex items-center gap-2 bg-white border border-border px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
              </svg>
              Print Brief
            </Link>
          )}
          {caseData.ai_brief && (
            <a
              href={`/api/cases/${id}/brief-pdf`}
              download={`brief-${caseData.case_number}.pdf`}
              className="inline-flex items-center gap-2 bg-navy text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-navy-light transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Download PDF Brief
            </a>
          )}
          {caseData.determination && (
            <Link
              href={`/cases/${id}/determination`}
              className="inline-flex items-center gap-2 bg-white border border-border px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Print Determination
            </Link>
          )}
          {caseData.ai_brief && (
            <button
              onClick={async () => {
                try {
                  await fetch('/api/fact-check', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ case_id: id }),
                  });
                  await fetchCase();
                } catch {
                  setError('Failed to re-run fact check');
                }
              }}
              className="inline-flex items-center gap-2 bg-white border border-border px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
              </svg>
              Re-run Fact Check
            </button>
          )}
          <button
            onClick={handleRegenerateBrief}
            disabled={streamingBrief.isStreaming}
            className="inline-flex items-center gap-2 bg-gold text-navy px-4 py-2 rounded-lg text-sm font-medium hover:bg-gold-light transition-colors disabled:opacity-60"
          >
            {streamingBrief.isStreaming ? 'Streaming AI Brief…' : (caseData.ai_brief ? 'Regenerate Brief (Live)' : 'Generate Brief (Live)')}
          </button>
        </div>
      </div>

      {/* Appeal Handoff / Context Banners (clean bidirectional navigation) */}
      {caseData.review_type === 'appeal' && (
        <div className="mb-6">
          <AppealContextBanner
            originalCaseId={caseData.appeal_of_case_id}
            originalCaseNumber={caseData.case_number ? caseData.case_number.replace(/-APPEAL/i, '') : undefined}
            originalDetermination={caseData.determination}
            originalDeterminationAt={caseData.determination_at}
          />
        </div>
      )}

      {!!caseData.appeal_status && !caseData.appeal_of_case_id && (
        <div className="mb-6">
          <AppealHandoffBanner
            appealCaseNumber={`${caseData.case_number}-APPEAL`}
            appealStatus={caseData.appeal_status}
            appealCaseId={(caseData as any).resolved_appeal_case_id || undefined}
          />
        </div>
      )}

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-800 text-sm">
          {error}
          <button onClick={() => setError(null)} className="ml-4 underline">Dismiss</button>
        </div>
      )}

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Panel — Case Metadata */}
        <div className="lg:col-span-1 space-y-6">
          {/* Patient Info */}
          <div className="bg-surface rounded-lg border border-border p-5">
            <h3 className="font-semibold text-sm text-muted uppercase tracking-wide mb-3">Patient Information</h3>
            <dl className="space-y-2 text-sm">
              <div>
                <dt className="text-muted">Name</dt>
                <dd className="font-medium">{caseData.patient_name || '—'}</dd>
              </div>
              <div>
                <dt className="text-muted">Date of Birth</dt>
                <dd className="font-medium">{caseData.patient_dob || '—'}</dd>
              </div>
              <div>
                <dt className="text-muted">Gender</dt>
                <dd className="font-medium capitalize">{caseData.patient_gender || '—'}</dd>
              </div>
              <div>
                <dt className="text-muted">Member ID</dt>
                <dd className="font-medium font-mono text-xs">{caseData.patient_member_id || '—'}</dd>
              </div>
            </dl>
          </div>

          {/* Provider Information */}
          <div className="bg-surface rounded-lg border border-border p-5">
            <h3 className="font-semibold text-sm text-muted uppercase tracking-wide mb-3">Provider Information</h3>
            <dl className="space-y-2 text-sm">
              <div className="pb-2 border-b border-border">
                <dt className="text-muted text-xs uppercase tracking-wide mb-1">Requesting Provider</dt>
                <dd className="font-medium">{caseData.requesting_provider || '—'}</dd>
                {caseData.requesting_provider_npi && (
                  <dd className="text-xs text-muted mt-0.5">NPI: <span className="font-mono">{caseData.requesting_provider_npi}</span></dd>
                )}
                {caseData.requesting_provider_specialty && (
                  <dd className="text-xs text-muted mt-0.5">Specialty: <span className="capitalize">{caseData.requesting_provider_specialty}</span></dd>
                )}
              </div>
              {caseData.servicing_provider && caseData.servicing_provider !== caseData.requesting_provider && (
                <div className="pb-2 border-b border-border">
                  <dt className="text-muted text-xs uppercase tracking-wide mb-1">Servicing Provider</dt>
                  <dd className="font-medium">{caseData.servicing_provider}</dd>
                  {caseData.servicing_provider_npi && (
                    <dd className="text-xs text-muted mt-0.5">NPI: <span className="font-mono">{caseData.servicing_provider_npi}</span></dd>
                  )}
                </div>
              )}
              {caseData.facility_name && (
                <div>
                  <dt className="text-muted text-xs uppercase tracking-wide mb-1">Facility</dt>
                  <dd className="font-medium">{caseData.facility_name}</dd>
                  {caseData.facility_type && (
                    <dd className="mt-1">
                      <span className="inline-block bg-gray-100 text-gray-700 px-2 py-0.5 rounded text-xs">
                        {FACILITY_TYPE_LABELS[caseData.facility_type] || caseData.facility_type}
                      </span>
                    </dd>
                  )}
                </div>
              )}
            </dl>
          </div>

          {/* Payer & Plan */}
          <div className="bg-surface rounded-lg border border-border p-5">
            <h3 className="font-semibold text-sm text-muted uppercase tracking-wide mb-3">Payer &amp; Plan</h3>
            <dl className="space-y-2 text-sm">
              <div>
                <dt className="text-muted">Payer</dt>
                <dd className="font-medium">{caseData.payer_name || '—'}</dd>
              </div>
              <div>
                <dt className="text-muted">Plan Type</dt>
                <dd className="font-medium">{caseData.plan_type ? caseData.plan_type.toUpperCase() : '—'}</dd>
              </div>
              <div className="flex flex-wrap gap-1.5 pt-1">
                {caseData.review_type && (
                  <span className="inline-block bg-navy/10 text-navy px-2 py-0.5 rounded text-xs font-medium capitalize">
                    {caseData.review_type.replace(/_/g, ' ')}
                  </span>
                )}
                {caseData.service_category && (
                  <span className="inline-block bg-gold/20 text-amber-800 px-2 py-0.5 rounded text-xs font-medium">
                    {SERVICE_CATEGORY_LABELS[caseData.service_category] || caseData.service_category}
                  </span>
                )}
              </div>
            </dl>
          </div>

          {/* SLA / Turnaround */}
          <div className="bg-surface rounded-lg border border-border p-5">
            <h3 className="font-semibold text-sm text-muted uppercase tracking-wide mb-3">SLA &amp; Turnaround</h3>
            {caseData.turnaround_deadline && (
              <div className="mb-3">
                <SlaTracker deadline={caseData.turnaround_deadline} />
              </div>
            )}
            <dl className="space-y-2 text-sm">
              <div>
                <dt className="text-muted">Deadline</dt>
                <dd className="font-medium">
                  {caseData.turnaround_deadline
                    ? new Date(caseData.turnaround_deadline).toLocaleString()
                    : '—'}
                </dd>
              </div>
              <div>
                <dt className="text-muted">SLA Hours Contracted</dt>
                <dd className="font-medium">{caseData.sla_hours != null ? `${caseData.sla_hours}h` : '—'}</dd>
              </div>
            </dl>
          </div>

          {/* Nursing Review Pipeline */}
          {(caseData.assigned_pod_id || caseData.assigned_lpn_id || caseData.assigned_rn_id || caseData.lpn_determination || caseData.rn_determination) && (
            <div className="bg-surface rounded-lg border border-border p-5">
              <h3 className="font-semibold text-sm text-muted uppercase tracking-wide mb-3">Nursing Review Pipeline</h3>

              {/* Authorization Number */}
              {caseData.authorization_number && (
                <div className="mb-3 pb-3 border-b border-border">
                  <dt className="text-xs text-muted uppercase tracking-wide">Auth Number</dt>
                  <dd className="font-mono text-sm font-medium text-navy">{caseData.authorization_number}</dd>
                </div>
              )}

              {/* Pod Assignment */}
              {caseData.assigned_pod_id && (
                <div className="mb-3 pb-3 border-b border-border text-sm">
                  <dt className="text-muted text-xs uppercase tracking-wide mb-1">Assigned Pod</dt>
                  <dd className="font-medium">{caseData.assigned_pod_id.slice(0, 8)}</dd>
                </div>
              )}

              {/* Pipeline steps */}
              <div className="space-y-3">
                {/* LPN Review */}
                <div className={`rounded-lg p-3 ${caseData.lpn_determination ? 'bg-teal-50 border border-teal-200' : caseData.status === 'lpn_review' ? 'bg-teal-50/50 border border-teal-100' : 'bg-gray-50 border border-border'}`}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-semibold text-teal-700 uppercase tracking-wider">LPN Review</span>
                    {caseData.lpn_determination && (
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                        caseData.lpn_determination === 'criteria_met' ? 'bg-green-100 text-green-700' :
                        caseData.lpn_determination === 'criteria_not_met' ? 'bg-red-100 text-red-700' :
                        'bg-yellow-100 text-yellow-700'
                      }`}>
                        {caseData.lpn_determination.replace(/_/g, ' ')}
                      </span>
                    )}
                  </div>
                  {caseData.lpn_review_notes && <p className="text-xs text-gray-700 mt-1">{caseData.lpn_review_notes}</p>}
                  {caseData.lpn_review_at && <p className="text-xs text-muted mt-1">{new Date(caseData.lpn_review_at).toLocaleString()}</p>}
                  {!caseData.lpn_determination && caseData.status !== 'lpn_review' && <p className="text-xs text-muted italic">Pending</p>}
                </div>

                {/* RN Review */}
                <div className={`rounded-lg p-3 ${caseData.rn_determination ? 'bg-blue-50 border border-blue-200' : caseData.status === 'rn_review' ? 'bg-blue-50/50 border border-blue-100' : 'bg-gray-50 border border-border'}`}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-semibold text-blue-700 uppercase tracking-wider">RN Review</span>
                    {caseData.rn_determination && (
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                        caseData.rn_determination === 'approve' ? 'bg-green-100 text-green-700' : 'bg-purple-100 text-purple-700'
                      }`}>
                        {caseData.rn_determination === 'approve' ? 'Approved' : 'Escalated to MD'}
                      </span>
                    )}
                  </div>
                  {caseData.rn_review_notes && <p className="text-xs text-gray-700 mt-1">{caseData.rn_review_notes}</p>}
                  {caseData.rn_review_at && <p className="text-xs text-muted mt-1">{new Date(caseData.rn_review_at).toLocaleString()}</p>}
                  {!caseData.rn_determination && caseData.status !== 'rn_review' && <p className="text-xs text-muted italic">Pending</p>}
                </div>

                {/* MD Review (only if escalated) */}
                {(caseData.status === 'md_review' || caseData.rn_determination === 'escalate_to_md' || caseData.assigned_reviewer_id) && (
                  <div className={`rounded-lg p-3 ${caseData.determination ? 'bg-purple-50 border border-purple-200' : caseData.status === 'md_review' ? 'bg-purple-50/50 border border-purple-100' : 'bg-gray-50 border border-border'}`}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-semibold text-purple-700 uppercase tracking-wider">MD Review</span>
                      {caseData.determination && (
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                          caseData.determination === 'approve' ? 'bg-green-100 text-green-700' :
                          caseData.determination === 'deny' ? 'bg-red-100 text-red-700' :
                          'bg-yellow-100 text-yellow-700'
                        }`}>
                          {caseData.determination.replace(/_/g, ' ')}
                        </span>
                      )}
                    </div>
                    {caseData.determination_at && <p className="text-xs text-muted mt-1">{new Date(caseData.determination_at).toLocaleString()}</p>}
                    {!caseData.determination && caseData.status !== 'md_review' && <p className="text-xs text-muted italic">Pending</p>}
                  </div>
                )}
              </div>

              {/* SLA Pause Banner */}
              {caseData.status === 'pend_missing_info' && (
                <div className="mt-3 bg-amber-50 border border-amber-200 rounded-lg p-3">
                  <div className="flex items-center gap-2">
                    <svg className="w-4 h-4 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                    </svg>
                    <span className="text-xs font-semibold text-amber-800">SLA Clock Paused</span>
                  </div>
                  <p className="text-xs text-amber-700 mt-1">Waiting for missing information from provider. Clock paused{caseData.sla_paused_at ? ` since ${new Date(caseData.sla_paused_at).toLocaleString()}` : ''}.</p>
                  {caseData.sla_pause_total_hours > 0 && (
                    <p className="text-xs text-amber-600 mt-0.5">Total pause time: {caseData.sla_pause_total_hours.toFixed(1)}h</p>
                  )}
                </div>
              )}

              {/* P2P Status */}
              {caseData.peer_to_peer_status && (
                <div className="mt-3 bg-purple-50 border border-purple-200 rounded-lg p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-purple-700 uppercase tracking-wider">Peer-to-Peer</span>
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full capitalize ${
                      caseData.peer_to_peer_status === 'completed' ? 'bg-green-100 text-green-700' :
                      caseData.peer_to_peer_status === 'scheduled' ? 'bg-blue-100 text-blue-700' :
                      caseData.peer_to_peer_status === 'declined' || caseData.peer_to_peer_status === 'no_response' ? 'bg-red-100 text-red-700' :
                      'bg-yellow-100 text-yellow-700'
                    }`}>
                      {caseData.peer_to_peer_status.replace(/_/g, ' ')}
                    </span>
                  </div>
                  {caseData.peer_to_peer_scheduled_at && (
                    <p className="text-xs text-purple-600 mt-1">Scheduled: {new Date(caseData.peer_to_peer_scheduled_at).toLocaleString()}</p>
                  )}
                </div>
              )}

              {/* Intake Channel */}
              {caseData.intake_channel && (
                <div className="mt-3 text-xs text-muted flex items-center gap-2">
                  <span>Intake:</span>
                  <span className="bg-gray-100 px-2 py-0.5 rounded text-xs font-medium capitalize">{caseData.intake_channel.replace(/_/g, ' ')}</span>
                  {caseData.intake_confirmation_sent && <span className="text-green-600 text-[10px]">(confirmed)</span>}
                </div>
              )}
            </div>
          )}

          {/* Procedure Info */}
          <div className="bg-surface rounded-lg border border-border p-5">
            <h3 className="font-semibold text-sm text-muted uppercase tracking-wide mb-3">Procedure Details</h3>
            <dl className="space-y-2 text-sm">
              <div>
                <dt className="text-muted">Procedure Codes</dt>
                <dd className="font-medium">
                  {caseData.procedure_codes?.length ? (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {caseData.procedure_codes.map((code) => (
                        <span key={code} className="inline-block bg-navy/10 text-navy px-2 py-0.5 rounded text-xs font-mono">
                          {code}
                        </span>
                      ))}
                    </div>
                  ) : '—'}
                </dd>
              </div>
              <div>
                <dt className="text-muted">Diagnosis Codes</dt>
                <dd className="font-medium">
                  {caseData.diagnosis_codes?.length ? (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {caseData.diagnosis_codes.map((code) => (
                        <span key={code} className="inline-block bg-gray-100 text-gray-700 px-2 py-0.5 rounded text-xs font-mono">
                          {code}
                        </span>
                      ))}
                    </div>
                  ) : '—'}
                </dd>
              </div>
              <div>
                <dt className="text-muted">Description</dt>
                <dd className="font-medium">{caseData.procedure_description || '—'}</dd>
              </div>
              <div>
                <dt className="text-muted">Clinical Question</dt>
                <dd className="font-medium">{caseData.clinical_question || '—'}</dd>
              </div>
            </dl>
          </div>

          {/* Denial Details (only when denied/partial) */}
          {(caseData.determination === 'deny' || caseData.determination === 'partial_approve') && (
            <div className="bg-red-50 rounded-lg border border-red-200 p-5">
              <h3 className="font-semibold text-sm text-red-800 uppercase tracking-wide mb-3 flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                </svg>
                Denial Details
              </h3>
              <dl className="space-y-3 text-sm">
                {caseData.denial_reason && (
                  <div>
                    <dt className="text-red-700 text-xs font-medium uppercase tracking-wide">Reason</dt>
                    <dd className="font-medium text-red-900 mt-0.5">{caseData.denial_reason}</dd>
                  </div>
                )}
                {caseData.denial_criteria_cited && (
                  <div>
                    <dt className="text-red-700 text-xs font-medium uppercase tracking-wide">Criteria Cited</dt>
                    <dd className="text-red-900 mt-0.5 text-xs leading-relaxed">{caseData.denial_criteria_cited}</dd>
                  </div>
                )}
                {caseData.alternative_recommended && (
                  <div>
                    <dt className="text-red-700 text-xs font-medium uppercase tracking-wide">Alternative Recommended</dt>
                    <dd className="text-red-900 mt-0.5 text-xs leading-relaxed">{caseData.alternative_recommended}</dd>
                  </div>
                )}
              </dl>
              <button
                className="mt-4 w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-purple-600 text-white text-sm font-medium hover:bg-purple-700 transition-colors"
                onClick={() => {
                  // Navigate or trigger P2P request flow
                  handleDetermination({
                    determination: 'peer_to_peer_requested',
                    rationale: `Peer-to-peer requested following ${caseData.determination?.replace(/_/g, ' ')} determination.`,
                  });
                }}
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 8.511c.884.284 1.5 1.128 1.5 2.097v4.286c0 1.136-.847 2.1-1.98 2.193-.34.027-.68.052-1.02.072v3.091l-3-3c-1.354 0-2.694-.055-4.02-.163a2.115 2.115 0 01-.825-.242m9.345-8.334a2.126 2.126 0 00-.476-.095 48.64 48.64 0 00-8.048 0c-1.131.094-1.976 1.057-1.976 2.192v4.286c0 .837.46 1.58 1.155 1.951m9.345-8.334V6.637c0-1.621-1.152-3.026-2.76-3.235A48.455 48.455 0 0011.25 3c-2.115 0-4.198.137-6.24.402-1.608.209-2.76 1.614-2.76 3.235v6.226c0 1.621 1.152 3.026 2.76 3.235.577.075 1.157.14 1.74.194V21l4.155-4.155" />
                </svg>
                Request Peer-to-Peer
              </button>

              {/* File First Appeal — production end-to-end with required reasoning (Phase 3) */}
              {!caseData.appeal_status && (
                <button
                  onClick={openAppealModal}
                  className="mt-3 w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-purple-700 text-white text-sm font-semibold hover:bg-purple-800 transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                  </svg>
                  File First Appeal (Provide Required Justification)
                </button>
              )}
            </div>
          )}

          {/* Reviewer Assignment */}
          <div className="bg-surface rounded-lg border border-border p-5">
            <h3 className="font-semibold text-sm text-muted uppercase tracking-wide mb-3">Reviewer Assignment</h3>
            <ReviewerPanel
              reviewers={reviewers}
              selectedReviewerId={caseData.assigned_reviewer_id}
              onAssign={handleAssignReviewer}
            />
          </div>

          {/* Documents */}
          <div className="bg-surface rounded-lg border border-border p-5">
            <h3 className="font-semibold text-sm text-muted uppercase tracking-wide mb-3">Documents</h3>
            {caseData.submitted_documents?.length ? (
              <ul className="space-y-2 text-sm">
                {caseData.submitted_documents.map((doc, i) => (
                  <DocumentRow key={i} caseId={id} path={doc} index={i} />
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted">No documents attached</p>
            )}
          </div>
        </div>

        {/* Right Panel — AI Brief + Determination */}
        <div className="lg:col-span-2 space-y-6">
          {/* AI Brief */}
          {caseData.status === 'processing' && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-8 text-center">
              <div className="animate-pulse text-yellow-700">
                <svg className="w-8 h-8 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
                <p className="font-medium">AI is generating the clinical brief...</p>
                <p className="text-sm mt-1">This may take a moment</p>
              </div>
            </div>
          )}

          {/* AI Automation Layer (46-65): Live streaming brief preview — white-glove "watch the AI improve itself" experience.
              Multi-pass self-critique + structured clinical reasoning now visible in real time.
              Reuses upgraded useStreamingBrief + brief-stream (drives the full generateBriefForCase self-improvement engine).
              On completion, authoritative CaseBrief (with Self-Refined badge + log) renders from DB. */}
          {streamingBrief.isStreaming && (
            <div className="bg-surface rounded-xl border border-border shadow-sm overflow-hidden animate-slide-up">
              <div className="px-6 py-5 border-b border-border bg-gradient-to-r from-navy/[0.03] to-transparent flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-navy/10 flex items-center justify-center">
                    <svg className="w-4 h-4 text-navy animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                    </svg>
                  </div>
                  <div>
 <div className="text-xl text-navy">AI Clinical Brief — Self-Improving Live</div>
                    <div className="text-xs text-muted mt-0.5">Multi-pass clinical reasoning loop • AI strengthens its own output for defensibility before your validation gate</div>
                  </div>
                </div>
                <div className="flex items-center gap-3 text-sm">
                  <div className="font-mono text-navy tabular-nums">{streamingBrief.progress}%</div>
                  <div className="h-1.5 w-24 bg-gray-200 rounded-full overflow-hidden">
                    <div className="h-full bg-navy transition-all" style={{ width: `${streamingBrief.progress}%` }} />
                  </div>
                  {streamingBrief.currentPass && (
                    <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 text-[10px] font-semibold">Pass {streamingBrief.currentPass}</span>
                  )}
                  {streamingBrief.currentSection && (
                    <span className="text-muted text-xs uppercase tracking-wider">Building: {streamingBrief.currentSection.replace(/_/g, ' ')}</span>
                  )}
                </div>
              </div>

              <div className="p-6 text-sm text-muted space-y-4">
                {/* Refinement / Self-Critique Log (the star of the 46-65 track) */}
                {streamingBrief.refinementLog.length > 0 && (
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-4">
                    <div className="uppercase text-emerald-700 text-[10px] tracking-[1px] font-semibold mb-2">AI Self-Improvement Activity</div>
                    <div className="space-y-2 text-xs">
                      {streamingBrief.refinementLog.map((evt, idx) => (
                        <div key={idx} className="flex gap-2">
                          <span className="font-mono text-emerald-600 shrink-0">P{evt.passNumber}</span>
                          <span className="text-emerald-900">{evt.message}</span>
                          {evt.scoreAfter != null && evt.scoreBefore != null && evt.scoreAfter !== evt.scoreBefore && (
                            <span className="text-emerald-700 font-semibold">+{evt.scoreAfter - evt.scoreBefore}pts</span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {Object.keys(streamingBrief.sections).length > 0 ? (
                  <div className="space-y-4">
                    {Object.entries(streamingBrief.sections).map(([key, val]) => (
                      <div key={key} className="border-l-2 border-navy/30 pl-3">
                        <div className="uppercase text-[10px] tracking-[1px] text-navy/70 mb-1">{key.replace(/_/g, ' ')}</div>
                        <div className="text-navy/90 text-sm leading-relaxed">
                          {typeof val === 'string' ? val : JSON.stringify(val).slice(0, 280) + (JSON.stringify(val).length > 280 ? '…' : '')}
                        </div>
                      </div>
                    ))}
                    {streamingBrief.factCheck && (
                      <div className="mt-4 pt-4 border-t text-emerald-700 text-xs">Fact-check complete • Score: {streamingBrief.factCheck.overall_score} • Status: {streamingBrief.factCheck.overall_status}</div>
                    )}
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <div className="animate-spin rounded-full h-4 w-4 border-2 border-navy border-t-transparent" />
                    Initializing AI clinical analysis + self-critique engine...
                  </div>
                )}
              </div>

              <div className="px-6 py-3 bg-gray-50 border-t text-[11px] text-muted flex items-center justify-between">
                <span>Secure multi-pass pipeline (generate + critique + fact-check) • Persisted automatically • Human validation gate remains mandatory</span>
                <button onClick={() => streamingBrief.reset()} className="text-navy hover:underline">Cancel</button>
              </div>
            </div>
          )}

          {caseData.ai_brief && !streamingBrief.isStreaming && (
            <CaseBrief brief={caseData.ai_brief} caseNumber={caseData.case_number} factCheck={caseData.fact_check} />
          )}

          {/* Lighter Concierge Validation Gate — shown precisely when AI brief is ready for human review */}
          {caseData.status === 'brief_ready' && caseData.ai_brief && (
            <div id="concierge-validation">
              <ConciergeValidationForm
                onSubmit={handleConciergeValidation}
                isSubmitting={submittingValidation}
                caseNumber={caseData.case_number}
                factCheck={caseData.fact_check}
              />
            </div>
          )}

          {/* Concierge Validation Summary (read-only, surfaced from audit trail for transparency) */}
          {caseData.status !== 'brief_ready' && (() => {
            const validationEvent = auditLog.find((e) => e.action === 'concierge_brief_validated');
            if (!validationEvent) return null;
            const details = (validationEvent.details as any) || {};
            return (
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-5">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-6 h-6 rounded-full bg-emerald-600 flex items-center justify-center">
                    <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 10l7-7m0 0l7 7" />
                    </svg>
                  </div>
                  <span className="font-semibold text-emerald-800 text-sm uppercase tracking-wider">Concierge Brief Validation Complete</span>
                </div>
                <p className="text-sm text-emerald-900 leading-relaxed">{details.rationale || 'Validation recorded.'}</p>
                {details.flags?.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {details.flags.map((f: string, i: number) => (
                      <span key={i} className="inline-block text-[10px] px-2 py-0.5 bg-white border border-emerald-200 rounded text-emerald-700">{f.replace(/_/g, ' ')}</span>
                    ))}
                  </div>
                )}
                <p className="text-[11px] text-emerald-700 mt-2">Recorded in audit • Routed to clinical review pipeline</p>
              </div>
            );
          })()}

          {!caseData.ai_brief && caseData.status === 'intake' && (
            <div className="bg-surface border border-border rounded-lg p-8 text-center">
              <svg className="w-12 h-12 mx-auto mb-4 text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <p className="font-medium text-gray-700">No brief generated yet</p>
              <p className="text-sm text-muted mt-1">Click &quot;Generate Brief&quot; to create an AI clinical brief for this case</p>
            </div>
          )}

          {/* Determination Section */}
          {caseData.determination ? (
            <div className="bg-surface rounded-lg border border-border p-6">
 <h3 className="text-xl text-navy mb-4">Determination</h3>
              <div className="flex items-center gap-3 mb-3">
                <span className={`inline-block px-3 py-1 rounded-full text-sm font-semibold ${
                  caseData.determination === 'approve' ? 'bg-green-100 text-green-800' :
                  caseData.determination === 'deny' ? 'bg-red-100 text-red-800' :
                  caseData.determination === 'partial_approve' ? 'bg-yellow-100 text-yellow-800' :
                  caseData.determination === 'modify' ? 'bg-teal-100 text-teal-800' :
                  caseData.determination === 'pend' ? 'bg-orange-100 text-orange-800' :
                  'bg-purple-100 text-purple-800'
                }`}>
                  {caseData.determination.replace(/_/g, ' ').toUpperCase()}
                </span>
                {caseData.determination_at && (
                  <span className="text-sm text-muted">
                    {new Date(caseData.determination_at).toLocaleString()}
                  </span>
                )}
              </div>
              {caseData.determination_rationale && (
                <div className="bg-gray-50 rounded-lg p-4 text-sm">
                  <p className="font-medium text-muted mb-1">Rationale</p>
                  <p>{caseData.determination_rationale}</p>
                </div>
              )}
            </div>
          ) : caseData.ai_brief && caseData.assigned_reviewer_id ? (
            <div className="bg-surface rounded-lg border border-border p-6">
 <h3 className="text-xl text-navy mb-4">
                Submit Determination {caseData.review_type === 'appeal' ? '(Appeal Review)' : ''}
              </h3>
              {caseData.review_type === 'appeal' && (
                <p className="text-xs text-purple-700 mb-4 -mt-2">
                  This is an appeal review. Provide your independent re-evaluation. You were not the original denying reviewer.
                </p>
              )}
              <DeterminationForm 
                onSubmit={handleDetermination} 
                isSubmitting={submittingDetermination} 
                isAppeal={caseData.review_type === 'appeal'}
                originalDetermination={caseData.review_type === 'appeal' ? 'see original context banner' : undefined}
                // AI Automation Layer (Track A): pass live denial strength + appeal likelihood signal (computed by engine via preview or prior storage)
                // Enables the risk banner + required human ack gate exactly when the clinician is making the deny decision.
                denialRiskSignal={caseData.denial_strength_score != null ? {
                  score: caseData.denial_strength_score,
                  grade: caseData.denial_strength_grade || undefined,
                  appeal_likelihood: (caseData as any).appeal_likelihood ?? (caseData.ai_brief ? Math.round(100 - (caseData.denial_strength_score || 50)) : undefined), // placeholder until full preview fetch wired
                  appeal_risk_assessment: 'AI signal: review factors in banner. Your rationale must address flagged risks.',
                } : (caseData.ai_brief ? {
                  // Fallback signal derived from brief for cases without prior score (demo/real preview path ready)
                  score: 65,
                  appeal_likelihood: caseData.fact_check ? Math.min(90, Math.max(20, 100 - (caseData.fact_check.overall_score || 70))) : 55,
                  appeal_risk_grade: 'medium',
                  appeal_risk_assessment: 'Pre-decision AI signal (fact-check + brief coherence). Fetch full via denial-strength API for precise factors before finalizing high-risk denials.',
                } : undefined)}
              />
            </div>
          ) : null}

          {/* Audit Timeline */}
          {auditLog.length > 0 && (
            <div className="bg-surface rounded-lg border border-border p-6">
 <h3 className="text-xl text-navy mb-4">Audit Trail</h3>
              <AuditTimeline entries={auditLog} />
            </div>
          )}
        </div>
      </div>

      {/* AI Copilot Sidebar */}
      <CopilotSidebar caseData={caseData} />

      {/* First Appeal Modal — full end-to-end intake with required reasoning */}
      <FileFirstAppealModal
        isOpen={showAppealModal}
        onClose={() => setShowAppealModal(false)}
        caseId={id}
        caseNumber={caseData.case_number}
        determination={caseData.determination}
        determinationAt={caseData.determination_at}
        onSuccess={handleAppealSuccess}
      />
      </div>
    </div>
  );
}

/**
 * One row in the case Documents card. Storage paths like
 *   cases/<caseId>/20260513T140000-clin-notes.pdf
 * are not directly browseable — they live in a private S3/Supabase
 * bucket. Clicking "Download" calls the signed-URL endpoint and
 * opens the resulting time-bound URL in a new tab.
 */
function DocumentRow({ caseId, path, index }: { caseId: string; path: string; index: number }) {
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const displayName = filenameFromPath(path) || `Document ${index + 1}`;

  async function handleClick(e: React.MouseEvent) {
    e.preventDefault();
    setStatus('loading');
    setErrorMsg(null);
    try {
      const res = await fetch(
        `/api/cases/${caseId}/documents/sign?path=${encodeURIComponent(path)}`,
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.available || !data?.url) {
        setStatus('error');
        setErrorMsg(data?.error || data?.message || `Failed (${res.status})`);
        return;
      }
      window.open(data.url, '_blank', 'noopener,noreferrer');
      setStatus('idle');
    } catch {
      setStatus('error');
      setErrorMsg('Network error');
    }
  }

  return (
    <li className="flex items-center gap-2">
      <svg className="w-4 h-4 text-muted flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
      <button
        type="button"
        onClick={handleClick}
        disabled={status === 'loading'}
        className="text-navy hover:underline truncate text-left disabled:opacity-50"
        title={path}
      >
        {status === 'loading' ? 'Generating link…' : displayName}
      </button>
      {status === 'error' && errorMsg && (
        <span className="text-xs text-red-600 ml-2">{errorMsg}</span>
      )}
    </li>
  );
}

/**
 * Pull a friendly filename out of a storage path. Storage paths from
 * the uploader look like:
 *   cases/<caseId>/<UTC-yyyymmddThhmmss>-<safe-filename>
 * We strip everything up through the leading timestamp so reviewers
 * see "clin-notes.pdf" instead of the raw key.
 */
function filenameFromPath(path: string): string {
  const tail = path.split('/').pop() ?? path;
  // Match the timestamp prefix we emit at upload time: 8 digits, T,
  // 6 digits, dash. Strip it; fall back to the whole tail if absent.
  const stripped = tail.replace(/^\d{8}T\d{6}-/, '');
  return stripped;
}
