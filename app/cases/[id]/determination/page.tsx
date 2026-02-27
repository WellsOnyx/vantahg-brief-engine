'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import type { Case } from '@/lib/types';

export default function DeterminationLetterPage() {
  const params = useParams();
  const id = params.id as string;

  const [caseData, setCaseData] = useState<Case | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/cases/${id}`)
      .then((res) => {
        if (!res.ok) throw new Error(res.status === 404 ? 'Case not found' : 'Failed to load case');
        return res.json();
      })
      .then(setCaseData)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-8 py-12">
        <div className="skeleton skeleton-heading w-64 mb-4" />
        <div className="skeleton skeleton-text w-full" />
        <div className="skeleton skeleton-text w-3/4" />
      </div>
    );
  }

  if (error || !caseData) {
    return (
      <div className="max-w-4xl mx-auto px-8 py-12 text-center">
        <h1 className="text-xl font-semibold text-foreground">{error || 'Case not found'}</h1>
        <Link href="/cases" className="text-navy hover:underline mt-4 inline-block text-sm">
          &larr; Back to Cases
        </Link>
      </div>
    );
  }

  if (!caseData.determination) {
    return (
      <div className="max-w-4xl mx-auto px-8 py-12 text-center">
        <h1 className="text-xl font-semibold text-foreground">No Determination Yet</h1>
        <p className="text-sm text-muted mt-2">A determination has not been made for this case.</p>
        <Link href={`/cases/${id}`} className="text-navy hover:underline mt-4 inline-block text-sm">
          &larr; Back to Case
        </Link>
      </div>
    );
  }

  const reviewer = (caseData as any).reviewer;
  const determinationDate = caseData.determination_at
    ? new Date(caseData.determination_at).toLocaleDateString('en-US', {
        year: 'numeric', month: 'long', day: 'numeric',
      })
    : 'N/A';

  const isDenial = caseData.determination === 'deny' || caseData.determination === 'partial_approve';

  // Determination label + color
  const detConfig: Record<string, { label: string; color: string; bg: string }> = {
    approve: { label: 'APPROVED', color: 'text-green-800', bg: 'bg-green-100' },
    deny: { label: 'DENIED', color: 'text-red-800', bg: 'bg-red-100' },
    partial_approve: { label: 'PARTIALLY APPROVED', color: 'text-yellow-800', bg: 'bg-yellow-100' },
    modify: { label: 'APPROVED WITH MODIFICATIONS', color: 'text-teal-800', bg: 'bg-teal-100' },
    pend: { label: 'PENDED — ADDITIONAL INFORMATION REQUIRED', color: 'text-orange-800', bg: 'bg-orange-100' },
    peer_to_peer_requested: { label: 'PEER-TO-PEER REVIEW REQUESTED', color: 'text-purple-800', bg: 'bg-purple-100' },
  };

  const det = detConfig[caseData.determination] || { label: caseData.determination.toUpperCase(), color: 'text-gray-800', bg: 'bg-gray-100' };

  return (
    <div className="max-w-4xl mx-auto">
      {/* Print controls */}
      <div className="no-print flex items-center justify-between px-8 py-4 border-b border-border bg-surface">
        <Link href={`/cases/${id}`} className="text-sm text-muted hover:text-navy">
          &larr; Back to Case
        </Link>
        <button
          onClick={() => window.print()}
          className="inline-flex items-center gap-2 bg-navy text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-navy-light transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
          </svg>
          Print Letter
        </button>
      </div>

      {/* Letter content */}
      <div className="px-8 py-10 bg-white min-h-screen">
        {/* Header */}
        <div className="flex items-start justify-between border-b-2 border-navy pb-6 mb-8">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-navy rounded-lg flex items-center justify-center font-bold text-gold text-lg">
              V
            </div>
            <div>
              <h1 className="font-[family-name:var(--font-dm-serif)] text-xl text-navy">VantaHG</h1>
              <p className="text-xs text-muted">Clinical Brief Engine</p>
            </div>
          </div>
          <div className="text-right text-sm text-muted">
            <p className="font-semibold text-foreground">UTILIZATION REVIEW DETERMINATION</p>
            <p>Case: {caseData.case_number}</p>
            <p>Date: {determinationDate}</p>
          </div>
        </div>

        {/* Determination Banner */}
        <div className={`${det.bg} rounded-xl p-5 mb-8 text-center`}>
          <p className="text-xs font-medium text-muted uppercase tracking-wide mb-1">Determination</p>
          <p className={`text-2xl font-bold ${det.color} font-[family-name:var(--font-dm-serif)]`}>
            {det.label}
          </p>
        </div>

        {/* Case Information */}
        <div className="grid grid-cols-2 gap-x-8 gap-y-4 mb-8">
          <div>
            <h3 className="text-xs font-semibold text-muted uppercase tracking-wide mb-3 border-b border-border pb-1">
              Patient Information
            </h3>
            <dl className="space-y-1.5 text-sm">
              <div className="flex"><dt className="w-28 text-muted flex-shrink-0">Name</dt><dd className="font-medium">{caseData.patient_name}</dd></div>
              <div className="flex"><dt className="w-28 text-muted flex-shrink-0">DOB</dt><dd className="font-medium">{caseData.patient_dob}</dd></div>
              <div className="flex"><dt className="w-28 text-muted flex-shrink-0">Gender</dt><dd className="font-medium capitalize">{caseData.patient_gender || '—'}</dd></div>
              <div className="flex"><dt className="w-28 text-muted flex-shrink-0">Member ID</dt><dd className="font-medium font-mono text-xs">{caseData.patient_member_id || '—'}</dd></div>
            </dl>
          </div>

          <div>
            <h3 className="text-xs font-semibold text-muted uppercase tracking-wide mb-3 border-b border-border pb-1">
              Provider Information
            </h3>
            <dl className="space-y-1.5 text-sm">
              <div className="flex"><dt className="w-28 text-muted flex-shrink-0">Provider</dt><dd className="font-medium">{caseData.requesting_provider}</dd></div>
              <div className="flex"><dt className="w-28 text-muted flex-shrink-0">NPI</dt><dd className="font-medium font-mono text-xs">{caseData.requesting_provider_npi || '—'}</dd></div>
              <div className="flex"><dt className="w-28 text-muted flex-shrink-0">Specialty</dt><dd className="font-medium capitalize">{caseData.requesting_provider_specialty || '—'}</dd></div>
            </dl>
          </div>

          <div>
            <h3 className="text-xs font-semibold text-muted uppercase tracking-wide mb-3 border-b border-border pb-1">
              Service Details
            </h3>
            <dl className="space-y-1.5 text-sm">
              <div className="flex"><dt className="w-28 text-muted flex-shrink-0">Category</dt><dd className="font-medium capitalize">{caseData.service_category?.replace(/_/g, ' ')}</dd></div>
              <div className="flex"><dt className="w-28 text-muted flex-shrink-0">Review Type</dt><dd className="font-medium capitalize">{caseData.review_type?.replace(/_/g, ' ')}</dd></div>
              <div className="flex"><dt className="w-28 text-muted flex-shrink-0">CPT/HCPCS</dt><dd className="font-medium font-mono text-xs">{caseData.procedure_codes?.join(', ') || '—'}</dd></div>
              <div className="flex"><dt className="w-28 text-muted flex-shrink-0">ICD-10</dt><dd className="font-medium font-mono text-xs">{caseData.diagnosis_codes?.join(', ') || '—'}</dd></div>
            </dl>
          </div>

          <div>
            <h3 className="text-xs font-semibold text-muted uppercase tracking-wide mb-3 border-b border-border pb-1">
              Payer Information
            </h3>
            <dl className="space-y-1.5 text-sm">
              <div className="flex"><dt className="w-28 text-muted flex-shrink-0">Payer</dt><dd className="font-medium">{caseData.payer_name || '—'}</dd></div>
              <div className="flex"><dt className="w-28 text-muted flex-shrink-0">Plan Type</dt><dd className="font-medium uppercase">{caseData.plan_type || '—'}</dd></div>
            </dl>
          </div>
        </div>

        {/* Procedure Description */}
        {caseData.procedure_description && (
          <div className="mb-8">
            <h3 className="text-xs font-semibold text-muted uppercase tracking-wide mb-2 border-b border-border pb-1">
              Procedure Description
            </h3>
            <p className="text-sm">{caseData.procedure_description}</p>
          </div>
        )}

        {/* Rationale */}
        <div className="mb-8">
          <h3 className="text-xs font-semibold text-muted uppercase tracking-wide mb-2 border-b border-border pb-1">
            Clinical Rationale
          </h3>
          <div className="bg-background rounded-lg p-4 text-sm leading-relaxed">
            {caseData.determination_rationale}
          </div>
        </div>

        {/* Denial Details (conditional) */}
        {isDenial && (
          <div className="mb-8 border border-red-200 rounded-lg overflow-hidden">
            <div className="bg-red-50 px-4 py-2">
              <h3 className="text-xs font-semibold text-red-800 uppercase tracking-wide">
                Denial Details
              </h3>
            </div>
            <div className="p-4 space-y-3 text-sm">
              {caseData.denial_reason && (
                <div>
                  <dt className="text-xs font-medium text-red-700 uppercase">Reason for Denial</dt>
                  <dd className="mt-0.5">{caseData.denial_reason}</dd>
                </div>
              )}
              {caseData.denial_criteria_cited && (
                <div>
                  <dt className="text-xs font-medium text-red-700 uppercase">Clinical Criteria Cited</dt>
                  <dd className="mt-0.5">{caseData.denial_criteria_cited}</dd>
                </div>
              )}
              {caseData.alternative_recommended && (
                <div>
                  <dt className="text-xs font-medium text-red-700 uppercase">Alternative Recommended</dt>
                  <dd className="mt-0.5">{caseData.alternative_recommended}</dd>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Clinical Criteria Reference (from AI Brief) */}
        {caseData.ai_brief?.criteria_match && (
          <div className="mb-8">
            <h3 className="text-xs font-semibold text-muted uppercase tracking-wide mb-2 border-b border-border pb-1">
              Clinical Criteria Reference
            </h3>
            <div className="space-y-3 text-sm">
              {caseData.ai_brief.criteria_match.applicable_guideline && (
                <div>
                  <p className="text-xs font-medium text-muted">Applicable Guideline</p>
                  <p>{caseData.ai_brief.criteria_match.applicable_guideline}</p>
                </div>
              )}
              {caseData.ai_brief.criteria_match.criteria_met?.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-green-700 mb-1">Criteria Met</p>
                  <ul className="list-disc list-inside space-y-0.5 text-green-800">
                    {caseData.ai_brief.criteria_match.criteria_met.map((c: string, i: number) => (
                      <li key={i}>{c}</li>
                    ))}
                  </ul>
                </div>
              )}
              {caseData.ai_brief.criteria_match.criteria_not_met?.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-red-700 mb-1">Criteria Not Met</p>
                  <ul className="list-disc list-inside space-y-0.5 text-red-800">
                    {caseData.ai_brief.criteria_match.criteria_not_met.map((c: string, i: number) => (
                      <li key={i}>{c}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Appeal Rights (for denials) */}
        {isDenial && (
          <div className="mb-8 bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm">
            <h3 className="text-xs font-semibold text-blue-800 uppercase tracking-wide mb-2">
              Appeal Rights
            </h3>
            <p className="text-blue-900">
              You have the right to appeal this determination. To initiate an appeal or request a
              peer-to-peer review with the reviewing physician, please contact VantaHG within 30 days
              of this notice. Peer-to-peer reviews are available for all denied or partially approved cases.
            </p>
          </div>
        )}

        {/* Signature Block */}
        <div className="mt-12 pt-8 border-t-2 border-navy">
          <div className="grid grid-cols-2 gap-8">
            <div>
              <div className="border-b border-foreground w-64 mb-2 h-8" />
              <p className="text-sm font-medium">
                {reviewer?.name || 'Reviewing Physician'}
                {reviewer?.credentials && `, ${reviewer.credentials}`}
              </p>
              {reviewer?.specialty && (
                <p className="text-xs text-muted capitalize">{reviewer.specialty}</p>
              )}
              {reviewer?.license_state?.length > 0 && (
                <p className="text-xs text-muted">Licensed in: {reviewer.license_state.join(', ')}</p>
              )}
            </div>
            <div>
              <div className="border-b border-foreground w-64 mb-2 h-8" />
              <p className="text-sm font-medium">Date</p>
              <p className="text-sm text-muted">{determinationDate}</p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-12 pt-4 border-t border-border text-center text-xs text-muted">
          <p>
            This determination was made by{' '}
            <span className="font-medium">{reviewer?.name || 'a board-certified physician'}</span>
            {reviewer?.credentials && `, ${reviewer.credentials}`}
            {reviewer?.specialty && `, a board-certified ${reviewer.specialty} physician`}.
          </p>
          <p className="mt-1">
            All determinations are made by licensed physicians. AI-generated clinical briefs assist
            in preparation but do not render medical determinations.
          </p>
          <p className="mt-2 font-medium">VantaHG Clinical Brief Engine</p>
        </div>
      </div>
    </div>
  );
}
