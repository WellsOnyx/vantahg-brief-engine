'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { CaseBrief } from '@/components/CaseBrief';
import { StatusBadge, PriorityBadge } from '@/components/StatusBadge';
import { AuditTimeline } from '@/components/AuditTimeline';
import { ReviewerPanel } from '@/components/ReviewerPanel';
import { DeterminationForm } from '@/components/DeterminationForm';
import type { DeterminationFields } from '@/components/DeterminationForm';
import { SlaTracker } from '@/components/SlaTracker';
import type { Case, Reviewer, AuditLogEntry } from '@/lib/types';

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
  const id = params.id as string;

  const [caseData, setCaseData] = useState<Case | null>(null);
  const [reviewers, setReviewers] = useState<Reviewer[]>([]);
  const [auditLog, setAuditLog] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [submittingDetermination, setSubmittingDetermination] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  async function handleAssignReviewer(reviewerId: string) {
    try {
      await fetch(`/api/cases/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assigned_reviewer_id: reviewerId, status: 'in_review' }),
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
        }),
      });
      await fetchCase();
      await fetchAudit();
    } catch {
      setError('Failed to submit determination');
    } finally {
      setSubmittingDetermination(false);
    }
  }

  async function handleRegenerateBrief() {
    try {
      await fetch('/api/generate-brief', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ case_id: id }),
      });
      await fetchCase();
      await fetchAudit();
    } catch {
      setError('Failed to regenerate brief');
    }
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
          <h3 className="font-semibold text-lg text-foreground font-[family-name:var(--font-dm-serif)]">
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
          <h3 className="font-semibold text-lg text-foreground font-[family-name:var(--font-dm-serif)]">Case Not Found</h3>
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
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <Link href="/" className="text-muted hover:text-navy text-sm">&larr; Dashboard</Link>
          </div>
          <h1 className="font-[family-name:var(--font-dm-serif)] text-3xl text-navy">
            Case {caseData.case_number}
          </h1>
          <div className="flex items-center gap-3 mt-2">
            <StatusBadge status={caseData.status} />
            <PriorityBadge priority={caseData.priority} />
            <span className="text-sm text-muted capitalize">{caseData.vertical}</span>
            <span className="text-sm text-muted">{caseData.review_type?.replace(/_/g, ' ')}</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
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
          <button
            onClick={handleRegenerateBrief}
            className="inline-flex items-center gap-2 bg-gold text-navy px-4 py-2 rounded-lg text-sm font-medium hover:bg-gold-light transition-colors"
          >
            {caseData.ai_brief ? 'Regenerate Brief' : 'Generate Brief'}
          </button>
        </div>
      </div>

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
                  <li key={i} className="flex items-center gap-2">
                    <svg className="w-4 h-4 text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    <a href={doc} target="_blank" rel="noopener noreferrer" className="text-navy hover:underline truncate">
                      Document {i + 1}
                    </a>
                  </li>
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

          {caseData.ai_brief && (
            <CaseBrief brief={caseData.ai_brief} caseNumber={caseData.case_number} />
          )}

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
              <h3 className="font-[family-name:var(--font-dm-serif)] text-xl text-navy mb-4">Determination</h3>
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
              <h3 className="font-[family-name:var(--font-dm-serif)] text-xl text-navy mb-4">Submit Determination</h3>
              <DeterminationForm onSubmit={handleDetermination} isSubmitting={submittingDetermination} />
            </div>
          ) : null}

          {/* Audit Timeline */}
          {auditLog.length > 0 && (
            <div className="bg-surface rounded-lg border border-border p-6">
              <h3 className="font-[family-name:var(--font-dm-serif)] text-xl text-navy mb-4">Audit Trail</h3>
              <AuditTimeline entries={auditLog} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
