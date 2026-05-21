'use client';

import { useState } from 'react';

export interface DeterminationFields {
  determination: string;
  rationale: string;
  denial_reason?: string;
  denial_criteria_cited?: string;
  alternative_recommended?: string;
  modification_details?: string;
  p2p_reason?: string;
  // AI Automation Layer (Track A): human acknowledgment of AI denial/appeal risk signals (required for high-risk)
  ai_risk_acknowledged?: boolean;
  ai_risk_notes?: string;
}

interface DeterminationFormProps {
  onSubmit: (fields: DeterminationFields) => Promise<void>;
  isSubmitting: boolean;
  /** When true (on appeal cases), renders appeal-specific guidance and adjusted placeholder for the second-look rationale. */
  isAppeal?: boolean;
  /** For appeal cases, surface the original determination for context in the form header/guidance. */
  originalDetermination?: string | null;
  /** AI Automation Layer (Track A): precomputed denial strength + appeal likelihood signal from lib/denial-strength (or live fetch).
   *  When present on deny/partial, renders prominent explainable risk banner + required human acknowledgment gate.
   *  Never auto-blocks legitimate clinical judgment; only forces explicit review of the signal.
   */
  denialRiskSignal?: {
    score: number;
    grade?: string;
    appeal_likelihood?: number;
    appeal_risk_grade?: string;
    appeal_risk_assessment?: string;
    factors_summary?: string; // top factors or recommendations
  };
}

const DENIAL_REASONS = [
  'Does not meet medical necessity criteria',
  'Insufficient clinical documentation',
  'Conservative treatment not exhausted',
  'Service not covered under plan',
  'Requested setting not appropriate',
  'Frequency/duration exceeds guidelines',
  'Experimental/investigational',
  'Other',
] as const;

const determinationOptions = [
  {
    value: 'approve',
    label: 'Approve',
    description: 'Clinical criteria met, authorize the procedure',
    color: 'border-green-300 bg-green-50 text-green-800',
    selectedColor: 'border-green-400 bg-green-50 text-green-800 ring-2 ring-green-500/30',
    dot: 'bg-green-500',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  {
    value: 'deny',
    label: 'Deny',
    description: 'Clinical criteria not met, deny authorization',
    color: 'border-red-300 bg-red-50 text-red-800',
    selectedColor: 'border-red-400 bg-red-50 text-red-800 ring-2 ring-red-500/30',
    dot: 'bg-red-500',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 9.75l4.5 4.5m0-4.5l-4.5 4.5M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  {
    value: 'partial_approve',
    label: 'Partial Approve',
    description: 'Approve some elements, deny or modify others',
    color: 'border-amber-300 bg-amber-50 text-amber-800',
    selectedColor: 'border-amber-400 bg-amber-50 text-amber-800 ring-2 ring-amber-500/30',
    dot: 'bg-amber-500',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
      </svg>
    ),
  },
  {
    value: 'modify',
    label: 'Modify',
    description: 'Approve with modifications to the requested service',
    color: 'border-teal-300 bg-teal-50 text-teal-800',
    selectedColor: 'border-teal-400 bg-teal-50 text-teal-800 ring-2 ring-teal-500/30',
    dot: 'bg-teal-500',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M11.42 15.17l-5.66-5.66a2 2 0 010-2.83l.94-.94a2 2 0 012.83 0l1.42 1.42 3.13-3.13a2 2 0 012.83 0l.94.94a2 2 0 010 2.83l-5.66 5.66a2 2 0 01-2.83 0zM21.13 2.87a3 3 0 00-4.24 0l-1.06 1.06 4.24 4.24 1.06-1.06a3 3 0 000-4.24z" />
      </svg>
    ),
  },
  {
    value: 'pend',
    label: 'Pend',
    description: 'Insufficient information, request additional documentation',
    color: 'border-blue-300 bg-blue-50 text-blue-800',
    selectedColor: 'border-blue-400 bg-blue-50 text-blue-800 ring-2 ring-blue-500/30',
    dot: 'bg-blue-500',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M14.25 9v6m-4.5 0V9M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  {
    value: 'peer_to_peer_requested',
    label: 'Request Peer-to-Peer',
    description: 'Schedule a peer-to-peer discussion with the requesting provider',
    color: 'border-purple-300 bg-purple-50 text-purple-800',
    selectedColor: 'border-purple-400 bg-purple-50 text-purple-800 ring-2 ring-purple-500/30',
    dot: 'bg-purple-500',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 8.511c.884.284 1.5 1.128 1.5 2.097v4.286c0 1.136-.847 2.1-1.98 2.193-.34.027-.68.052-1.02.072v3.091l-3-3c-1.354 0-2.694-.055-4.02-.163a2.115 2.115 0 01-.825-.242m9.345-8.334a2.126 2.126 0 00-.476-.095 48.64 48.64 0 00-8.048 0c-1.131.094-1.976 1.057-1.976 2.192v4.286c0 .837.46 1.58 1.155 1.951m9.345-8.334V6.637c0-1.621-1.152-3.026-2.76-3.235A48.455 48.455 0 0011.25 3c-2.115 0-4.198.137-6.24.402-1.608.209-2.76 1.614-2.76 3.235v6.226c0 1.621 1.152 3.026 2.76 3.235.577.075 1.157.14 1.74.194V21l4.155-4.155" />
      </svg>
    ),
  },
];

const MAX_CHARS = 2000;

export function DeterminationForm({ onSubmit, isSubmitting, isAppeal = false, originalDetermination, denialRiskSignal }: DeterminationFormProps) {
  const [determination, setDetermination] = useState('');
  const [rationale, setRationale] = useState('');
  const [denialReason, setDenialReason] = useState('');
  const [criteriaCited, setCriteriaCited] = useState('');
  const [alternativeRecommended, setAlternativeRecommended] = useState('');
  const [modificationDetails, setModificationDetails] = useState('');
  const [p2pReason, setP2pReason] = useState('');
  const [error, setError] = useState('');

  // AI Automation Layer (Track A): human risk acknowledgment state (enforced on high-risk denials)
  const [aiRiskAcknowledged, setAiRiskAcknowledged] = useState(false);
  const [aiRiskNotes, setAiRiskNotes] = useState('');

  const showDenialFields = determination === 'deny' || determination === 'partial_approve';
  const showModifyFields = determination === 'modify';
  const showP2pFields = determination === 'peer_to_peer_requested';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!determination) {
      setError('Please select a determination.');
      return;
    }
    if (!rationale.trim()) {
      setError('Rationale is required for all determinations.');
      return;
    }
    if (rationale.trim().length < 20) {
      setError('Please provide a more detailed rationale (at least 20 characters).');
      return;
    }
    if (showDenialFields && !denialReason) {
      setError('Please select a denial reason.');
      return;
    }
    if (showDenialFields && !criteriaCited.trim()) {
      setError('Please cite the specific criteria that was not met.');
      return;
    }

    // AI Automation Layer (Track A): Enforce explicit human review of denial/appeal risk signals
    // when the signal is provided (from precomputed or live denial-strength engine).
    // This is the mandatory human reasoning gate — AI signal informs, human owns the decision.
    const risk = denialRiskSignal;
    const isHighRiskDenial = showDenialFields && risk && ((risk.appeal_likelihood != null && risk.appeal_likelihood >= 55) || (risk.score != null && risk.score < 70));
    if (isHighRiskDenial && !aiRiskAcknowledged) {
      setError('You must acknowledge review of the AI denial strength & appeal likelihood signals before submitting a high-risk denial. This ensures clinical defensibility.');
      return;
    }
    if (isHighRiskDenial && aiRiskNotes.trim().length < 10) {
      setError('Please add a brief note on how your rationale addresses the flagged AI risk factors (min 10 chars).');
      return;
    }

    await onSubmit({
      determination,
      rationale: rationale.trim(),
      ...(showDenialFields && {
        denial_reason: denialReason,
        denial_criteria_cited: criteriaCited.trim(),
        alternative_recommended: alternativeRecommended.trim() || undefined,
      }),
      ...(showModifyFields && {
        modification_details: modificationDetails.trim() || undefined,
      }),
      ...(showP2pFields && {
        p2p_reason: p2pReason.trim() || undefined,
      }),
      // Pass AI risk acknowledgment (lives in audit via parent; no schema bloat)
      ...(isHighRiskDenial && {
        ai_risk_acknowledged: aiRiskAcknowledged,
        ai_risk_notes: aiRiskNotes.trim() || undefined,
      }),
    });
  };

  const charCount = rationale.trim().length;
  const charPercentage = Math.min((charCount / MAX_CHARS) * 100, 100);

  return (
    <div className="bg-surface rounded-xl border border-border shadow-sm animate-slide-up">
      <div className="p-5 border-b border-border">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-navy/10 flex items-center justify-center">
            <svg className="w-4 h-4 text-navy" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" />
            </svg>
          </div>
          <div>
 <h3 className="text-lg text-foreground">
              Clinical Determination
            </h3>
            <p className="text-xs text-muted mt-0.5">
              Review the AI brief and clinical documentation, then submit your determination.
            </p>
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="p-5 space-y-6">
        {/* Determination options as styled cards */}
        <fieldset>
          <legend className="text-sm font-semibold text-foreground mb-3">
            Determination <span className="text-red-500">*</span>
          </legend>
          <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-1">
            {determinationOptions.map((option) => {
              const isChecked = determination === option.value;

              return (
                <label
                  key={option.value}
                  className={`relative flex items-start gap-3 p-4 rounded-xl border-2 cursor-pointer transition-all duration-200 ${
                    isChecked
                      ? option.selectedColor
                      : 'border-border hover:border-gray-300 bg-white hover:shadow-sm'
                  }`}
                >
                  <input
                    type="radio"
                    name="determination"
                    value={option.value}
                    checked={isChecked}
                    onChange={() => setDetermination(option.value)}
                    className="sr-only"
                  />
                  <div className={`shrink-0 mt-0.5 transition-transform duration-200 ${isChecked ? 'scale-110' : 'opacity-60'}`}>
                    {option.icon}
                  </div>
                  <div className="min-w-0">
                    <span className="text-sm font-semibold block">{option.label}</span>
                    <p className={`text-xs mt-0.5 ${isChecked ? 'opacity-80' : 'text-muted'}`}>
                      {option.description}
                    </p>
                  </div>
                  {isChecked && (
                    <div className="absolute top-2 right-2">
                      <div className={`w-5 h-5 rounded-full ${option.dot} flex items-center justify-center animate-scale-in`}>
                        <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                        </svg>
                      </div>
                    </div>
                  )}
                </label>
              );
            })}
          </div>
        </fieldset>

        {/* Rationale with character count */}
        <div>
          <label htmlFor="rationale" className="block text-sm font-semibold text-foreground mb-1.5">
            Clinical Rationale <span className="text-red-500">*</span>
            {isAppeal && <span className="ml-2 text-[10px] uppercase tracking-wider text-purple-700 font-semibold">(Appeal Review — different reviewer)</span>}
          </label>
          <p className="text-xs text-muted mb-2">
            {isAppeal
              ? 'As the appeal reviewer (different from the original denier), explain why the prior determination should be upheld or overturned. Reference the original rationale, any new information, re-evaluation of criteria, and why your decision is clinically appropriate.'
              : 'Provide the clinical reasoning supporting your determination. This will be included in the determination letter.'}
          </p>
          <textarea
            id="rationale"
            value={rationale}
            onChange={(e) => setRationale(e.target.value.slice(0, MAX_CHARS))}
            rows={5}
            placeholder={isAppeal
              ? "As appeal reviewer: I have re-reviewed the original denial for [reason]. New information [X] supports overturning because... / The criteria were correctly applied and denial is upheld because..."
              : "Describe the clinical rationale for your determination, referencing applicable guidelines, criteria met/unmet, and supporting documentation..."}
            className="w-full px-4 py-3 text-sm border border-border rounded-xl bg-white resize-y"
          />
          <div className="flex justify-between items-center mt-2">
            <span className="text-xs text-muted">Minimum 20 characters</span>
            <div className="flex items-center gap-2">
              <div className="w-16 h-1.5 rounded-full bg-gray-200 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${
                    charCount < 20
                      ? 'bg-gray-400'
                      : charCount > MAX_CHARS * 0.9
                      ? 'bg-amber-500'
                      : 'bg-green-500'
                  }`}
                  style={{ width: `${charPercentage}%` }}
                />
              </div>
              <span className={`text-xs font-medium tabular-nums ${
                charCount < 20 ? 'text-muted' : charCount > MAX_CHARS * 0.9 ? 'text-amber-600' : 'text-green-600'
              }`}>
                {charCount}/{MAX_CHARS}
              </span>
            </div>
          </div>
        </div>

        {/* Denial-specific fields (deny or partial_approve) */}
        {showDenialFields && (
          <div className="space-y-4 overflow-hidden animate-slide-up">
            {/* AI Automation Layer (Track A): Denial Strength + Appeal Likelihood Signal Banner
                White-glove decision support for the human reviewer. AI 95% analysis presented as explainable signal.
                Mandatory explicit acknowledgment gate when risk is elevated — required reasoning, never auto-decision.
                Reuses the production denial-strength engine + new computeAppealLikelihood. */}
            {denialRiskSignal && (
              <div className="rounded-xl border-2 border-amber-300 bg-amber-50/80 p-4 mb-2">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 text-amber-600">⚠️</div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 text-sm font-semibold text-amber-900">
                      AI Denial Strength &amp; Appeal Likelihood Signal
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-200 text-amber-800 font-mono">95% AI • Human Judgment Required</span>
                    </div>
                    <div className="mt-1 text-xs text-amber-800">
                      Denial Strength: <span className="font-semibold">{denialRiskSignal.score}</span> ({denialRiskSignal.grade || '—'})
                      {denialRiskSignal.appeal_likelihood != null && (
                        <> • Appeal Likelihood: <span className="font-semibold">{denialRiskSignal.appeal_likelihood}</span> ({denialRiskSignal.appeal_risk_grade || '—'})</>
                      )}
                    </div>
                    {denialRiskSignal.appeal_risk_assessment && (
                      <p className="mt-1 text-[12px] text-amber-900 leading-snug">{denialRiskSignal.appeal_risk_assessment}</p>
                    )}
                    {denialRiskSignal.factors_summary && (
                      <p className="mt-1 text-[11px] text-amber-700 font-mono bg-amber-100/60 px-2 py-1 rounded">{denialRiskSignal.factors_summary}</p>
                    )}
                    <p className="mt-2 text-[11px] text-amber-700">This signal informs your clinical decision. Your explicit rationale (below) must address any flagged risks. The final determination is 100% yours.</p>
                  </div>
                </div>

                {/* Required human reasoning gate for elevated risk */}
                {((denialRiskSignal.appeal_likelihood != null && denialRiskSignal.appeal_likelihood >= 55) || (denialRiskSignal.score != null && denialRiskSignal.score < 70)) && (
                  <div className="mt-3 pt-3 border-t border-amber-200">
                    <label className="flex items-start gap-2 cursor-pointer text-sm font-medium text-amber-900">
                      <input
                        type="checkbox"
                        checked={aiRiskAcknowledged}
                        onChange={(e) => setAiRiskAcknowledged(e.target.checked)}
                        className="mt-1 accent-amber-600"
                        required
                      />
                      <span>I have reviewed the AI denial strength and appeal likelihood signals above. My clinical rationale specifically addresses the identified risk factors.</span>
                    </label>
                    <div className="mt-2">
                      <textarea
                        value={aiRiskNotes}
                        onChange={(e) => setAiRiskNotes(e.target.value)}
                        rows={2}
                        placeholder="Brief note: e.g., 'Addressed gap X by noting Y from submitted records; P2P recommended to strengthen.' (required for high-risk)"
                        className="w-full text-xs px-3 py-2 border border-amber-300 rounded-lg bg-white resize-y"
                      />
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="border-l-4 border-red-400 pl-4 space-y-4">
              <div>
                <label htmlFor="denial-reason" className="block text-sm font-semibold text-foreground mb-1.5">
                  Denial Reason <span className="text-red-500">*</span>
                </label>
                <select
                  id="denial-reason"
                  value={denialReason}
                  onChange={(e) => setDenialReason(e.target.value)}
                  className="w-full px-4 py-3 text-sm border border-border rounded-xl bg-white appearance-none cursor-pointer"
                >
                  <option value="">Select a denial reason...</option>
                  {DENIAL_REASONS.map((reason) => (
                    <option key={reason} value={reason}>{reason}</option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="criteria-cited" className="block text-sm font-semibold text-foreground mb-1.5">
                  Criteria Cited <span className="text-red-500">*</span>
                </label>
                <p className="text-xs text-muted mb-2">
                  Cite the specific guideline, criteria section, or clinical standard that was not met.
                </p>
                <textarea
                  id="criteria-cited"
                  value={criteriaCited}
                  onChange={(e) => setCriteriaCited(e.target.value)}
                  rows={3}
                  placeholder="e.g., InterQual 2024 Imaging: MRI Lumbar Spine — Criterion 3.2a requires documented failure of 6 weeks conservative therapy..."
                  className="w-full px-4 py-3 text-sm border border-border rounded-xl bg-white resize-y"
                />
              </div>

              <div>
                <label htmlFor="alternative-recommended" className="block text-sm font-semibold text-foreground mb-1.5">
                  Alternative Recommended <span className="text-xs text-muted font-normal">(optional)</span>
                </label>
                <p className="text-xs text-muted mb-2">
                  Recommend an alternative service, setting, or approach that would be approvable.
                </p>
                <textarea
                  id="alternative-recommended"
                  value={alternativeRecommended}
                  onChange={(e) => setAlternativeRecommended(e.target.value)}
                  rows={2}
                  placeholder="e.g., Recommend outpatient physical therapy for 6 weeks followed by re-evaluation..."
                  className="w-full px-4 py-3 text-sm border border-border rounded-xl bg-white resize-y"
                />
              </div>
            </div>
          </div>
        )}

        {/* Modify-specific fields */}
        {showModifyFields && (
          <div className="space-y-4 overflow-hidden animate-slide-up">
            <div className="border-l-4 border-teal-400 pl-4">
              <div>
                <label htmlFor="modification-details" className="block text-sm font-semibold text-foreground mb-1.5">
                  Modification Details <span className="text-red-500">*</span>
                </label>
                <p className="text-xs text-muted mb-2">
                  Describe the approved modification (e.g., approve outpatient instead of inpatient, approve different procedure code).
                </p>
                <textarea
                  id="modification-details"
                  value={modificationDetails}
                  onChange={(e) => setModificationDetails(e.target.value)}
                  rows={3}
                  placeholder="e.g., Approve CPT 27447 (total knee arthroplasty) in outpatient ASC setting instead of inpatient..."
                  className="w-full px-4 py-3 text-sm border border-border rounded-xl bg-white resize-y"
                />
              </div>
            </div>
          </div>
        )}

        {/* Peer-to-peer specific fields */}
        {showP2pFields && (
          <div className="space-y-4 overflow-hidden animate-slide-up">
            <div className="border-l-4 border-purple-400 pl-4">
              <div>
                <label htmlFor="p2p-reason" className="block text-sm font-semibold text-foreground mb-1.5">
                  P2P Discussion Topics <span className="text-xs text-muted font-normal">(recommended)</span>
                </label>
                <p className="text-xs text-muted mb-2">
                  What specific clinical questions should be addressed in the peer-to-peer discussion?
                </p>
                <textarea
                  id="p2p-reason"
                  value={p2pReason}
                  onChange={(e) => setP2pReason(e.target.value)}
                  rows={3}
                  placeholder="e.g., Requesting clarification on why conservative therapy was not attempted prior to surgical referral..."
                  className="w-full px-4 py-3 text-sm border border-border rounded-xl bg-white resize-y"
                />
              </div>
            </div>
          </div>
        )}

        {/* Error message */}
        {error && (
          <div className="flex items-center gap-2.5 p-3.5 rounded-xl bg-red-50 border border-red-200 animate-fade-in">
            <div className="w-6 h-6 rounded-full bg-red-500 flex items-center justify-center shrink-0">
              <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
              </svg>
            </div>
            <p className="text-sm text-red-700 font-medium">{error}</p>
          </div>
        )}

        {/* Submit button */}
        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full flex items-center justify-center gap-2.5 px-6 py-3.5 rounded-xl bg-navy text-gold font-semibold text-sm transition-all duration-200 hover:bg-navy-light hover:shadow-lg hover:shadow-navy/20 hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-none"
        >
          {isSubmitting ? (
            <>
              <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
              Submitting Determination...
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" />
              </svg>
              Sign &amp; Submit Determination
            </>
          )}
        </button>
      </form>
    </div>
  );
}
