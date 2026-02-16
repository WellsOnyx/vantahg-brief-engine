'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import type { Case } from '@/lib/types';

export default function PrintableBriefPage() {
  const params = useParams();
  const id = params.id as string;
  const [caseData, setCaseData] = useState<Case | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchCase = useCallback(async () => {
    try {
      const res = await fetch(`/api/cases/${id}`);
      if (res.ok) setCaseData(await res.json());
    } catch (err) {
      console.error('Failed to fetch case:', err);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchCase();
  }, [fetchCase]);

  if (loading) return <div className="p-12 text-center text-muted">Loading...</div>;
  if (!caseData || !caseData.ai_brief) return <div className="p-12 text-center text-muted">Brief not available</div>;

  const brief = caseData.ai_brief;

  return (
    <div className="max-w-4xl mx-auto bg-white min-h-screen">
      {/* Print controls */}
      <div className="no-print px-8 py-4 bg-gray-50 border-b flex items-center justify-between">
        <button
          onClick={() => window.history.back()}
          className="text-sm text-muted hover:text-navy"
        >
          &larr; Back to Case
        </button>
        <button
          onClick={() => window.print()}
          className="inline-flex items-center gap-2 bg-navy text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-navy-light transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
          </svg>
          Print / Save as PDF
        </button>
      </div>

      {/* Brief Content */}
      <div className="px-8 py-6">
        {/* Header */}
        <div className="flex items-center justify-between border-b-2 border-navy pb-4 mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-navy rounded flex items-center justify-center font-bold text-gold text-lg">V</div>
            <div>
              <div className="font-[family-name:var(--font-dm-serif)] text-xl text-navy">VantaHG</div>
              <div className="text-xs text-muted">Clinical Brief Engine</div>
            </div>
          </div>
          <div className="text-right text-sm">
            <div className="font-semibold text-navy">CLINICAL REVIEW BRIEF</div>
            <div className="text-muted">Case: {caseData.case_number}</div>
            <div className="text-muted">Generated: {caseData.ai_brief_generated_at ? new Date(caseData.ai_brief_generated_at).toLocaleDateString() : 'N/A'}</div>
          </div>
        </div>

        {/* Case Meta */}
        <div className="grid grid-cols-4 gap-4 text-xs mb-6 bg-gray-50 rounded-lg p-4">
          <div><span className="text-muted">Patient:</span> <span className="font-medium">{caseData.patient_name || '—'}</span></div>
          <div><span className="text-muted">DOB:</span> <span className="font-medium">{caseData.patient_dob || '—'}</span></div>
          <div><span className="text-muted">Member ID:</span> <span className="font-medium">{caseData.patient_member_id || '—'}</span></div>
          <div><span className="text-muted">Review Type:</span> <span className="font-medium capitalize">{caseData.review_type?.replace(/_/g, ' ') || '—'}</span></div>
          <div><span className="text-muted">Provider:</span> <span className="font-medium">{caseData.requesting_provider || '—'}</span></div>
          <div><span className="text-muted">NPI:</span> <span className="font-medium">{caseData.requesting_provider_npi || '—'}</span></div>
          <div><span className="text-muted">Payer:</span> <span className="font-medium">{caseData.payer_name || '—'}</span></div>
          <div><span className="text-muted">Priority:</span> <span className="font-medium capitalize">{caseData.priority}</span></div>
        </div>

        {/* Clinical Question */}
        <div className="mb-5 bg-navy/5 border-l-4 border-navy rounded-r-lg p-4">
          <h2 className="font-semibold text-sm text-navy uppercase tracking-wide mb-1">Clinical Question</h2>
          <p className="text-sm">{brief.clinical_question}</p>
        </div>

        {/* Patient Summary */}
        <div className="mb-5">
          <h2 className="font-semibold text-sm text-navy uppercase tracking-wide mb-2">Patient Summary</h2>
          <p className="text-sm">{brief.patient_summary}</p>
        </div>

        {/* Procedure Analysis */}
        <div className="mb-5">
          <h2 className="font-semibold text-sm text-navy uppercase tracking-wide mb-2">Procedure Analysis</h2>
          <div className="text-sm space-y-1">
            <div><span className="text-muted">Codes:</span> {brief.procedure_analysis.codes.join(', ')}</div>
            <div><span className="text-muted">Rationale:</span> {brief.procedure_analysis.clinical_rationale}</div>
            <div><span className="text-muted">Complexity:</span> <span className="capitalize font-medium">{brief.procedure_analysis.complexity_level}</span></div>
          </div>
        </div>

        {/* Criteria Match */}
        <div className="mb-5">
          <h2 className="font-semibold text-sm text-navy uppercase tracking-wide mb-2">Clinical Criteria Assessment</h2>
          <p className="text-xs text-muted mb-2">Guideline: {brief.criteria_match.applicable_guideline}</p>
          <div className="grid grid-cols-3 gap-3 text-xs">
            <div>
              <div className="font-medium text-green-700 mb-1">Criteria Met</div>
              <ul className="space-y-0.5">
                {brief.criteria_match.criteria_met.map((c, i) => (
                  <li key={i} className="flex items-start gap-1">
                    <span className="text-green-600 mt-0.5">&#10003;</span>
                    <span>{c}</span>
                  </li>
                ))}
                {brief.criteria_match.criteria_met.length === 0 && <li className="text-muted">None identified</li>}
              </ul>
            </div>
            <div>
              <div className="font-medium text-red-700 mb-1">Criteria Not Met</div>
              <ul className="space-y-0.5">
                {brief.criteria_match.criteria_not_met.map((c, i) => (
                  <li key={i} className="flex items-start gap-1">
                    <span className="text-red-600 mt-0.5">&#10007;</span>
                    <span>{c}</span>
                  </li>
                ))}
                {brief.criteria_match.criteria_not_met.length === 0 && <li className="text-muted">None identified</li>}
              </ul>
            </div>
            <div>
              <div className="font-medium text-yellow-700 mb-1">Unable to Assess</div>
              <ul className="space-y-0.5">
                {brief.criteria_match.criteria_unable_to_assess.map((c, i) => (
                  <li key={i} className="flex items-start gap-1">
                    <span className="text-yellow-600 mt-0.5">?</span>
                    <span>{c}</span>
                  </li>
                ))}
                {brief.criteria_match.criteria_unable_to_assess.length === 0 && <li className="text-muted">None</li>}
              </ul>
            </div>
          </div>
        </div>

        {/* Documentation Review */}
        <div className="mb-5">
          <h2 className="font-semibold text-sm text-navy uppercase tracking-wide mb-2">Documentation Review</h2>
          <p className="text-sm mb-2">{brief.documentation_review.documents_provided}</p>
          {brief.documentation_review.key_findings.length > 0 && (
            <div className="mb-2">
              <span className="text-xs font-medium text-muted">Key Findings:</span>
              <ul className="text-xs mt-1 space-y-0.5">
                {brief.documentation_review.key_findings.map((f, i) => (
                  <li key={i} className="flex items-start gap-1"><span>&#8226;</span><span>{f}</span></li>
                ))}
              </ul>
            </div>
          )}
          {brief.documentation_review.missing_documentation.length > 0 && (
            <div className="bg-yellow-50 border border-yellow-200 rounded p-2 text-xs">
              <span className="font-medium text-yellow-800">Missing Documentation:</span>
              <ul className="mt-1 space-y-0.5">
                {brief.documentation_review.missing_documentation.map((d, i) => (
                  <li key={i} className="text-yellow-700">&#9888; {d}</li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* AI Recommendation */}
        <div className="mb-5 border-2 border-navy/20 rounded-lg p-4">
          <h2 className="font-semibold text-sm text-navy uppercase tracking-wide mb-2">AI Recommendation</h2>
          <div className="flex items-center gap-3 mb-2">
            <span className={`inline-block px-3 py-1 rounded-full text-xs font-bold uppercase ${
              brief.ai_recommendation.recommendation === 'approve' ? 'bg-green-100 text-green-800' :
              brief.ai_recommendation.recommendation === 'deny' ? 'bg-red-100 text-red-800' :
              brief.ai_recommendation.recommendation === 'pend' ? 'bg-yellow-100 text-yellow-800' :
              'bg-purple-100 text-purple-800'
            }`}>
              {brief.ai_recommendation.recommendation.replace(/_/g, ' ')}
            </span>
            <span className={`text-xs font-medium ${
              brief.ai_recommendation.confidence === 'high' ? 'text-green-700' :
              brief.ai_recommendation.confidence === 'medium' ? 'text-yellow-700' :
              'text-red-700'
            }`}>
              {brief.ai_recommendation.confidence.toUpperCase()} confidence
            </span>
          </div>
          <p className="text-sm mb-2">{brief.ai_recommendation.rationale}</p>
          {brief.ai_recommendation.key_considerations.length > 0 && (
            <div className="text-xs">
              <span className="font-medium text-muted">Key Considerations:</span>
              <ul className="mt-1 space-y-0.5">
                {brief.ai_recommendation.key_considerations.map((c, i) => (
                  <li key={i}>&#8226; {c}</li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Reviewer Action */}
        <div className="mb-8 bg-gold/10 border border-gold/30 rounded-lg p-4">
          <h2 className="font-semibold text-sm text-navy uppercase tracking-wide mb-2">Reviewer Action Required</h2>
          <p className="text-sm font-medium mb-2">{brief.reviewer_action.decision_required}</p>
          <div className="text-xs space-y-1">
            <div><span className="text-muted">Time Sensitivity:</span> {brief.reviewer_action.time_sensitivity}</div>
            {brief.reviewer_action.peer_to_peer_suggested && (
              <div className="font-medium text-purple-700">Peer-to-peer review suggested</div>
            )}
            {brief.reviewer_action.additional_info_needed.length > 0 && (
              <div>
                <span className="text-muted">Additional Info Needed:</span>
                <ul className="mt-1 space-y-0.5">
                  {brief.reviewer_action.additional_info_needed.map((info, i) => (
                    <li key={i}>&#8226; {info}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>

        {/* Signature Line */}
        <div className="border-t-2 border-gray-300 pt-6 mt-8">
          <div className="grid grid-cols-2 gap-8">
            <div>
              <div className="border-b border-gray-400 mb-2 h-8"></div>
              <div className="text-xs text-muted">Reviewer Signature</div>
            </div>
            <div>
              <div className="border-b border-gray-400 mb-2 h-8"></div>
              <div className="text-xs text-muted">Date</div>
            </div>
          </div>
          <p className="text-[10px] text-muted mt-4">
            This clinical brief was generated by VantaHG&apos;s AI Clinical Brief Engine to assist in the review process.
            The AI recommendation is advisory only. The clinical determination is made solely by the reviewing physician.
          </p>
        </div>
      </div>
    </div>
  );
}
