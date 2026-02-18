'use client';

import type { AIBrief } from '@/lib/types';

interface CaseBriefProps {
  brief: AIBrief;
  caseNumber: string;
}

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="font-[family-name:var(--font-dm-serif)] text-base text-navy mb-2">
      {children}
    </h3>
  );
}

function SectionDivider() {
  return (
    <div className="my-6 flex items-center gap-3">
      <div className="flex-1 h-px bg-gradient-to-r from-transparent via-border to-transparent" />
    </div>
  );
}

function ComplexityBadge({ level }: { level: 'routine' | 'moderate' | 'complex' }) {
  const styles: Record<string, string> = {
    routine: 'bg-green-100 text-green-800 border-green-200',
    moderate: 'bg-amber-100 text-amber-800 border-amber-200',
    complex: 'bg-red-100 text-red-800 border-red-200',
  };

  const icons: Record<string, string> = {
    routine: '\u2713',
    moderate: '\u25CF',
    complex: '\u25B2',
  };

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${styles[level]}`}
    >
      <span className="text-[10px]">{icons[level]}</span>
      {level.charAt(0).toUpperCase() + level.slice(1)} Complexity
    </span>
  );
}

function ConfidenceMeter({ confidence }: { confidence: 'high' | 'medium' | 'low' }) {
  const levels = { high: 3, medium: 2, low: 1 };
  const gradients: Record<string, string> = {
    high: 'confidence-high',
    medium: 'confidence-medium',
    low: 'confidence-low',
  };
  const labels = {
    high: 'High Confidence',
    medium: 'Medium Confidence',
    low: 'Low Confidence',
  };

  return (
    <div className="flex items-center gap-3">
      <div className="flex gap-1 items-end">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className={`rounded-sm transition-all duration-500 ${
              i <= levels[confidence] ? gradients[confidence] : 'bg-gray-200'
            }`}
            style={{
              width: '0.5rem',
              height: `${0.5 + i * 0.25}rem`,
            }}
          />
        ))}
      </div>
      <span className="text-xs font-semibold text-muted">{labels[confidence]}</span>
    </div>
  );
}

function RecommendationBadge({
  recommendation,
}: {
  recommendation: 'approve' | 'deny' | 'pend' | 'peer_to_peer_recommended';
}) {
  const config: Record<
    string,
    { label: string; bg: string; icon: React.ReactNode }
  > = {
    approve: {
      label: 'Recommend Approve',
      bg: 'bg-green-100 text-green-800 border-green-300',
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
    },
    deny: {
      label: 'Recommend Deny',
      bg: 'bg-red-100 text-red-800 border-red-300',
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 9.75l4.5 4.5m0-4.5l-4.5 4.5M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
    },
    pend: {
      label: 'Recommend Pend',
      bg: 'bg-blue-100 text-blue-800 border-blue-300',
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M14.25 9v6m-4.5 0V9M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
    },
    peer_to_peer_recommended: {
      label: 'Recommend Peer-to-Peer',
      bg: 'bg-purple-100 text-purple-800 border-purple-300',
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 8.511c.884.284 1.5 1.128 1.5 2.097v4.286c0 1.136-.847 2.1-1.98 2.193-.34.027-.68.052-1.02.072v3.091l-3-3c-1.354 0-2.694-.055-4.02-.163a2.115 2.115 0 01-.825-.242m9.345-8.334a2.126 2.126 0 00-.476-.095 48.64 48.64 0 00-8.048 0c-1.131.094-1.976 1.057-1.976 2.192v4.286c0 .837.46 1.58 1.155 1.951m9.345-8.334V6.637c0-1.621-1.152-3.026-2.76-3.235A48.455 48.455 0 0011.25 3c-2.115 0-4.198.137-6.24.402-1.608.209-2.76 1.614-2.76 3.235v6.226c0 1.621 1.152 3.026 2.76 3.235.577.075 1.157.14 1.74.194V21l4.155-4.155" />
        </svg>
      ),
    },
  };

  const { label, bg, icon } = config[recommendation] || config.pend;

  return (
    <div className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border font-semibold text-sm shadow-sm ${bg} animate-scale-in`}>
      {icon}
      {label}
    </div>
  );
}

export function CaseBrief({ brief, caseNumber }: CaseBriefProps) {
  return (
    <div className="bg-surface rounded-xl border border-border shadow-sm animate-slide-up">
      {/* Header */}
      <div className="px-6 py-5 border-b border-border bg-gradient-to-r from-navy/[0.03] to-transparent">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-navy/10 flex items-center justify-center">
                <svg className="w-4 h-4 text-navy" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                </svg>
              </div>
              <div>
                <h2 className="font-[family-name:var(--font-dm-serif)] text-xl text-navy">
                  AI Clinical Brief
                </h2>
                <p className="text-xs text-muted mt-0.5">
                  Case {caseNumber} &middot; Generated by VantaHG AI Engine
                </p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 no-print">
            <button
              onClick={() => window.print()}
              className="btn btn-secondary text-xs py-1.5 px-3"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6.72 13.829c-.24.03-.48.062-.72.096m.72-.096a42.415 42.415 0 0110.56 0m-10.56 0L6.34 18m10.94-4.171c.24.03.48.062.72.096m-.72-.096L17.66 18m0 0l.229 2.523a1.125 1.125 0 01-1.12 1.227H7.231c-.662 0-1.18-.568-1.12-1.227L6.34 18m11.318 0h1.091A2.25 2.25 0 0021 15.75V9.456c0-1.081-.768-2.015-1.837-2.175a48.055 48.055 0 00-1.913-.247M6.34 18H5.25A2.25 2.25 0 013 15.75V9.456c0-1.081.768-2.015 1.837-2.175a48.041 48.041 0 011.913-.247m10.5 0a48.536 48.536 0 00-10.5 0m10.5 0V3.375c0-.621-.504-1.125-1.125-1.125h-8.25c-.621 0-1.125.504-1.125 1.125v3.659M18.75 3H5.25" />
              </svg>
              Print
            </button>
          </div>
        </div>
      </div>

      <div className="px-6 py-6 space-y-0">
        {/* 1. Clinical Question */}
        <div className="p-4 rounded-xl bg-gold/[0.06] border border-gold/20">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg bg-gold/20 flex items-center justify-center shrink-0">
              <svg className="w-4 h-4 text-gold-dark" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z" />
              </svg>
            </div>
            <div>
              <p className="text-xs font-semibold text-gold-dark uppercase tracking-wider mb-1">
                Clinical Question
              </p>
              <p className="text-sm text-foreground leading-relaxed">{brief.clinical_question}</p>
            </div>
          </div>
        </div>

        <SectionDivider />

        {/* 2. Patient Summary */}
        <div>
          <SectionHeader>Patient Summary</SectionHeader>
          <p className="text-sm text-foreground leading-relaxed">{brief.patient_summary}</p>
        </div>

        <SectionDivider />

        {/* 2b. Diagnosis Analysis */}
        {brief.diagnosis_analysis && (
          <>
            <div>
              <SectionHeader>Diagnosis Analysis</SectionHeader>
              <div className="space-y-3">
                <div>
                  <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-1">Primary Diagnosis</p>
                  <p className="text-sm text-foreground">{brief.diagnosis_analysis.primary_diagnosis}</p>
                </div>
                {brief.diagnosis_analysis.secondary_diagnoses.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-1">Secondary Diagnoses</p>
                    <ul className="space-y-1">
                      {brief.diagnosis_analysis.secondary_diagnoses.map((dx, idx) => (
                        <li key={idx} className="flex items-start gap-2 text-sm text-foreground">
                          <span className="w-1.5 h-1.5 rounded-full bg-navy/40 shrink-0 mt-2" />
                          {dx}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {brief.diagnosis_analysis.diagnosis_procedure_alignment && (
                  <div className="p-3 rounded-lg bg-blue-50 border border-blue-100">
                    <p className="text-xs font-semibold text-blue-800 uppercase tracking-wider mb-1">Diagnosis-Procedure Alignment</p>
                    <p className="text-sm text-blue-900">{brief.diagnosis_analysis.diagnosis_procedure_alignment}</p>
                  </div>
                )}
              </div>
            </div>
            <SectionDivider />
          </>
        )}

        {/* 3. Procedure Analysis */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <SectionHeader>Procedure Analysis</SectionHeader>
            <ComplexityBadge level={brief.procedure_analysis.complexity_level} />
          </div>

          {brief.procedure_analysis.codes.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-3">
              {brief.procedure_analysis.codes.map((code) => (
                <span
                  key={code}
                  className="inline-flex items-center px-2.5 py-1 bg-navy/5 border border-navy/10 rounded-lg text-xs font-mono font-semibold text-navy"
                >
                  {code}
                </span>
              ))}
            </div>
          )}

          <p className="text-sm text-foreground leading-relaxed">
            {brief.procedure_analysis.clinical_rationale}
          </p>

          {brief.procedure_analysis.setting_appropriateness && (
            <div className="mt-3 p-3 rounded-lg bg-navy/[0.04] border border-navy/10">
              <p className="text-xs font-semibold text-navy uppercase tracking-wider mb-1">Setting Appropriateness</p>
              <p className="text-sm text-foreground">{brief.procedure_analysis.setting_appropriateness}</p>
            </div>
          )}
        </div>

        <SectionDivider />

        {/* 4. Clinical Criteria Match */}
        <div>
          <SectionHeader>Clinical Criteria Match</SectionHeader>
          {brief.criteria_match.guideline_source && (
            <p className="text-xs text-muted mb-1">
              Source: <span className="font-semibold text-foreground">{brief.criteria_match.guideline_source}</span>
            </p>
          )}
          <p className="text-xs text-muted mb-3">
            Guideline: <span className="font-semibold text-foreground">{brief.criteria_match.applicable_guideline}</span>
          </p>

          <div className="space-y-2">
            {brief.criteria_match.criteria_met.length > 0 && (
              <div className="space-y-1.5">
                {brief.criteria_match.criteria_met.map((criterion, idx) => (
                  <div key={idx} className="flex items-start gap-2.5 p-2.5 rounded-lg bg-green-50 border border-green-100">
                    <div className="w-5 h-5 rounded-full bg-green-500 flex items-center justify-center shrink-0 mt-0.5">
                      <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                      </svg>
                    </div>
                    <span className="text-sm text-green-900">{criterion}</span>
                  </div>
                ))}
              </div>
            )}

            {brief.criteria_match.criteria_not_met.length > 0 && (
              <div className="space-y-1.5">
                {brief.criteria_match.criteria_not_met.map((criterion, idx) => (
                  <div key={idx} className="flex items-start gap-2.5 p-2.5 rounded-lg bg-red-50 border border-red-100">
                    <div className="w-5 h-5 rounded-full bg-red-500 flex items-center justify-center shrink-0 mt-0.5">
                      <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </div>
                    <span className="text-sm text-red-900">{criterion}</span>
                  </div>
                ))}
              </div>
            )}

            {brief.criteria_match.criteria_unable_to_assess.length > 0 && (
              <div className="space-y-1.5">
                {brief.criteria_match.criteria_unable_to_assess.map((criterion, idx) => (
                  <div key={idx} className="flex items-start gap-2.5 p-2.5 rounded-lg bg-amber-50 border border-amber-100">
                    <div className="w-5 h-5 rounded-full bg-amber-500 flex items-center justify-center shrink-0 mt-0.5">
                      <span className="text-white font-bold text-xs">?</span>
                    </div>
                    <span className="text-sm text-amber-900">{criterion}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {brief.criteria_match.conservative_alternatives && brief.criteria_match.conservative_alternatives.length > 0 && (
            <div className="mt-3 p-3 rounded-lg bg-indigo-50 border border-indigo-100">
              <p className="text-xs font-semibold text-indigo-800 uppercase tracking-wider mb-2">Conservative Alternatives</p>
              <ul className="space-y-1.5">
                {brief.criteria_match.conservative_alternatives.map((alt, idx) => (
                  <li key={idx} className="flex items-start gap-2 text-sm text-indigo-900">
                    <svg className="w-3.5 h-3.5 text-indigo-500 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                    </svg>
                    {alt}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Summary counts */}
          <div className="flex flex-wrap gap-4 mt-4 pt-3 border-t border-border">
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-green-700">
              <span className="w-2 h-2 rounded-full bg-green-500" />
              {brief.criteria_match.criteria_met.length} met
            </span>
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-red-700">
              <span className="w-2 h-2 rounded-full bg-red-500" />
              {brief.criteria_match.criteria_not_met.length} not met
            </span>
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-700">
              <span className="w-2 h-2 rounded-full bg-amber-500" />
              {brief.criteria_match.criteria_unable_to_assess.length} unable to assess
            </span>
          </div>
        </div>

        <SectionDivider />

        {/* 5. Documentation Review */}
        <div>
          <SectionHeader>Documentation Review</SectionHeader>
          <p className="text-sm text-muted mb-3">
            Documents provided: <span className="font-semibold text-foreground">{brief.documentation_review.documents_provided}</span>
          </p>

          {brief.documentation_review.key_findings.length > 0 && (
            <div className="mb-4">
              <p className="text-xs font-semibold text-foreground uppercase tracking-wider mb-2">
                Key Findings
              </p>
              <ul className="space-y-1.5">
                {brief.documentation_review.key_findings.map((finding, idx) => (
                  <li key={idx} className="flex items-start gap-2.5 text-sm text-foreground">
                    <span className="w-1.5 h-1.5 rounded-full bg-navy shrink-0 mt-2" />
                    {finding}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {brief.documentation_review.missing_documentation.length > 0 && (
            <div className="p-4 rounded-xl bg-amber-50 border border-amber-200">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-6 h-6 rounded-full bg-amber-500 flex items-center justify-center">
                  <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                  </svg>
                </div>
                <p className="text-xs font-semibold text-amber-800 uppercase tracking-wider">
                  Missing Documentation
                </p>
              </div>
              <ul className="space-y-1.5 ml-8">
                {brief.documentation_review.missing_documentation.map((doc, idx) => (
                  <li key={idx} className="flex items-start gap-2 text-sm text-amber-900">
                    <span className="shrink-0 mt-1">&#8226;</span>
                    {doc}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <SectionDivider />

        {/* 6. AI Recommendation */}
        <div className="p-5 rounded-xl bg-navy/[0.03] border border-navy/10">
          <SectionHeader>AI Recommendation</SectionHeader>

          <div className="flex flex-wrap items-center gap-4 mb-4">
            <RecommendationBadge recommendation={brief.ai_recommendation.recommendation} />
            <ConfidenceMeter confidence={brief.ai_recommendation.confidence} />
          </div>

          <p className="text-sm text-foreground leading-relaxed mb-4">
            {brief.ai_recommendation.rationale}
          </p>

          {brief.ai_recommendation.key_considerations.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-foreground uppercase tracking-wider mb-2">
                Key Considerations
              </p>
              <ul className="space-y-1.5">
                {brief.ai_recommendation.key_considerations.map((consideration, idx) => (
                  <li key={idx} className="flex items-start gap-2 text-sm text-foreground">
                    <svg className="w-3.5 h-3.5 text-navy shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                    </svg>
                    {consideration}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {brief.ai_recommendation.if_modify_suggestion && (
            <div className="mt-4 p-3 rounded-lg bg-amber-50 border border-amber-200">
              <p className="text-xs font-semibold text-amber-800 uppercase tracking-wider mb-1">Modification Suggestion</p>
              <p className="text-sm text-amber-900">{brief.ai_recommendation.if_modify_suggestion}</p>
            </div>
          )}
        </div>

        <SectionDivider />

        {/* 7. Reviewer Action Required */}
        <div className="p-5 rounded-xl border-2 border-gold/40 bg-gold/[0.04]">
          <div className="flex items-center gap-2.5 mb-4">
            <div className="w-8 h-8 rounded-lg bg-gold/20 flex items-center justify-center">
              <svg className="w-4 h-4 text-gold-dark" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m0-10.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
              </svg>
            </div>
            <h3 className="font-[family-name:var(--font-dm-serif)] text-base text-navy">
              Reviewer Action Required
            </h3>
          </div>

          <div className="space-y-4">
            <div>
              <p className="text-xs font-semibold text-gold-dark uppercase tracking-wider mb-1">
                Decision Required
              </p>
              <p className="text-sm text-foreground">{brief.reviewer_action.decision_required}</p>
            </div>

            <div className="flex flex-wrap gap-4">
              <div>
                <p className="text-xs font-semibold text-gold-dark uppercase tracking-wider mb-1">
                  Time Sensitivity
                </p>
                <p className="text-sm text-foreground">{brief.reviewer_action.time_sensitivity}</p>
              </div>

              {brief.reviewer_action.peer_to_peer_suggested && (
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-100 border border-purple-200">
                  <svg className="w-3.5 h-3.5 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 8.511c.884.284 1.5 1.128 1.5 2.097v4.286c0 1.136-.847 2.1-1.98 2.193-.34.027-.68.052-1.02.072v3.091l-3-3c-1.354 0-2.694-.055-4.02-.163a2.115 2.115 0 01-.825-.242m9.345-8.334a2.126 2.126 0 00-.476-.095 48.64 48.64 0 00-8.048 0c-1.131.094-1.976 1.057-1.976 2.192v4.286c0 .837.46 1.58 1.155 1.951m9.345-8.334V6.637c0-1.621-1.152-3.026-2.76-3.235A48.455 48.455 0 0011.25 3c-2.115 0-4.198.137-6.24.402-1.608.209-2.76 1.614-2.76 3.235v6.226c0 1.621 1.152 3.026 2.76 3.235.577.075 1.157.14 1.74.194V21l4.155-4.155" />
                  </svg>
                  <span className="text-xs font-semibold text-purple-700">Peer-to-Peer Suggested</span>
                </div>
              )}
            </div>

            {brief.reviewer_action.additional_info_needed.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-gold-dark uppercase tracking-wider mb-2">
                  Additional Information Needed
                </p>
                <ul className="space-y-1.5">
                  {brief.reviewer_action.additional_info_needed.map((info, idx) => (
                    <li key={idx} className="flex items-start gap-2 text-sm text-foreground">
                      <svg className="w-3.5 h-3.5 text-gold-dark shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                      </svg>
                      {info}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {brief.reviewer_action.state_specific_requirements && brief.reviewer_action.state_specific_requirements.length > 0 && (
              <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                <p className="text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">
                  State-Specific Requirements
                </p>
                <ul className="space-y-1.5">
                  {brief.reviewer_action.state_specific_requirements.map((req, idx) => (
                    <li key={idx} className="flex items-start gap-2 text-sm text-slate-800">
                      <svg className="w-3.5 h-3.5 text-slate-500 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 21v-8.25M15.75 21v-8.25M8.25 21v-8.25M3 9l9-6 9 6m-1.5 12V10.332A48.36 48.36 0 0012 9.75c-2.551 0-5.056.2-7.5.582V21M3 21h18M12 6.75h.008v.008H12V6.75z" />
                      </svg>
                      {req}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>

        {/* Disclaimer */}
        <div className="mt-6 pt-4 border-t border-border">
          <p className="text-xs text-muted leading-relaxed italic">
            This AI-generated brief is a clinical decision-support tool only. All determinations
            must be made by a licensed clinical reviewer. The AI recommendation does not constitute
            a clinical determination and should be evaluated alongside the complete medical record.
          </p>
        </div>
      </div>
    </div>
  );
}
