'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { CaseBrief } from '@/components/CaseBrief';
import { StatusBadge, PriorityBadge } from '@/components/StatusBadge';
import { AuditTimeline } from '@/components/AuditTimeline';
import { ReviewerPanel } from '@/components/ReviewerPanel';
import { DeterminationForm } from '@/components/DeterminationForm';
import type { Case, Reviewer, AuditLogEntry } from '@/lib/types';

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
      if (res.ok) {
        const data = await res.json();
        setCaseData(data);
      }
    } catch (err) {
      console.error('Failed to fetch case:', err);
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

  async function handleDetermination(determination: string, rationale: string) {
    setSubmittingDetermination(true);
    try {
      await fetch(`/api/cases/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          determination,
          determination_rationale: rationale,
          determination_at: new Date().toISOString(),
          determined_by: caseData?.assigned_reviewer_id,
          status: 'determination_made',
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
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="text-center text-muted py-20">Loading case...</div>
      </div>
    );
  }

  if (!caseData) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="text-center text-muted py-20">Case not found</div>
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
                <dt className="text-muted">Member ID</dt>
                <dd className="font-medium">{caseData.patient_member_id || '—'}</dd>
              </div>
            </dl>
          </div>

          {/* Provider Info */}
          <div className="bg-surface rounded-lg border border-border p-5">
            <h3 className="font-semibold text-sm text-muted uppercase tracking-wide mb-3">Requesting Provider</h3>
            <dl className="space-y-2 text-sm">
              <div>
                <dt className="text-muted">Provider</dt>
                <dd className="font-medium">{caseData.requesting_provider || '—'}</dd>
              </div>
              <div>
                <dt className="text-muted">NPI</dt>
                <dd className="font-medium">{caseData.requesting_provider_npi || '—'}</dd>
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

          {/* Payer Info */}
          <div className="bg-surface rounded-lg border border-border p-5">
            <h3 className="font-semibold text-sm text-muted uppercase tracking-wide mb-3">Payer</h3>
            <dl className="space-y-2 text-sm">
              <div>
                <dt className="text-muted">Payer Name</dt>
                <dd className="font-medium">{caseData.payer_name || '—'}</dd>
              </div>
              <div>
                <dt className="text-muted">Plan Type</dt>
                <dd className="font-medium">{caseData.plan_type || '—'}</dd>
              </div>
            </dl>
          </div>

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
