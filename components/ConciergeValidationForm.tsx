'use client';

import { useState } from 'react';
import type { FactCheckResult } from '@/lib/types';
import { VerificationScore } from './FactCheckBadge';

interface ConciergeValidationFormProps {
  onSubmit: (payload: {
    rationale: string;
    flags: string[];
    /** Fact-check human acknowledgment (only populated when factCheck present and requires review) */
    fact_check_acknowledged?: boolean;
    fact_check_review_notes?: string;
  }) => Promise<void>;
  isSubmitting: boolean;
  caseNumber?: string;
  /** When provided, surfaces the automated verification quality and (when warranted) enforces explicit human acknowledgment before validation can proceed. */
  factCheck?: FactCheckResult | null;
}

/**
 * Lighter-weight "Human Review Layer" form for Concierge validation of the AI brief.
 * 
 * Philosophy: AI generated the clinical brief (95%). Concierge performs the first human gate
 * with explicit, required reasoning before routing to LPN/RN/MD for clinical determination.
 * 
 * Required strong rationale (min 30 chars). Optional structured flags for handoff quality.
 * Fully tenant-scoped and audited via the calling page + PATCH handler.
 */
const VALIDATION_FLAGS = [
  { key: 'extraction_accurate', label: 'Extraction accurate & complete' },
  { key: 'clinical_context_clear', label: 'Clinical context sufficient for review' },
  { key: 'documents_complete', label: 'Submitted documents appear complete' },
  { key: 'minor_gaps', label: 'Minor gaps flagged for clinical reviewer' },
  { key: 'needs_deeper_review', label: 'Recommend deeper clinical scrutiny' },
];

export function ConciergeValidationForm({ onSubmit, isSubmitting, caseNumber, factCheck }: ConciergeValidationFormProps) {
  const [rationale, setRationale] = useState('');
  const [selectedFlags, setSelectedFlags] = useState<string[]>([]);
  const [error, setError] = useState('');

  // Fact-check human review gate (AI Automation Layer — required acknowledgment when quality issues present)
  const [factCheckAck, setFactCheckAck] = useState(false);
  const [factCheckNotes, setFactCheckNotes] = useState('');
  const FACT_CHECK_MIN = 20;
  const needsFactCheckAck =
    !!factCheck &&
    (factCheck.human_review_recommended || factCheck.overall_status !== 'pass' || (factCheck.summary?.flagged ?? 0) > 0);

  const MIN_CHARS = 30;
  const MAX_CHARS = 1200;

  const charCount = rationale.trim().length;
  const fcNotesCount = factCheckNotes.trim().length;
  const factCheckNotesValid = !needsFactCheckAck || (factCheckAck && fcNotesCount >= FACT_CHECK_MIN);

  const isValid =
    charCount >= MIN_CHARS &&
    charCount <= MAX_CHARS &&
    factCheckNotesValid;

  const toggleFlag = (key: string) => {
    setSelectedFlags((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!isValid) {
      setError(`Please provide at least ${MIN_CHARS} characters of validation reasoning.`);
      return;
    }

    try {
      const payload: any = {
        rationale: rationale.trim(),
        flags: selectedFlags,
      };
      if (needsFactCheckAck) {
        payload.fact_check_acknowledged = factCheckAck;
        payload.fact_check_review_notes = factCheckNotes.trim();
      }
      await onSubmit(payload);
    } catch (err) {
      setError('Failed to submit validation. Please try again.');
    }
  };

  const charPercentage = Math.min((charCount / MAX_CHARS) * 100, 100);

  return (
    <div className="bg-surface border border-border rounded-2xl shadow-sm overflow-hidden animate-slide-up">
      <div className="p-5 border-b border-border bg-emerald-50/80">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl bg-emerald-600 flex items-center justify-center shrink-0 mt-0.5 ring-1 ring-emerald-700/30">
            <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div className="min-w-0 flex-1">
 <h3 className="text-2xl text-navy tracking-[-0.5px]">
              Validate AI Clinical Brief
            </h3>
            <p className="text-sm text-emerald-900 mt-1 leading-snug">
              AI handled 95%. Your required reasoning is the human gate that makes every determination clinically defensible.
            </p>
            {caseNumber && (
              <p className="text-xs text-muted font-mono mt-1.5">Case {caseNumber}</p>
            )}
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="p-6 space-y-7">
        {/* Rationale — the core required human input */}
        <div>
          <label htmlFor="concierge-rationale" className="block text-sm font-semibold text-foreground mb-1.5">
            Your Validation Reasoning <span className="text-red-500">*</span>
          </label>
          <p className="text-xs text-muted mb-2">
            Briefly but specifically: what did you confirm about the AI brief? (e.g., key facts extracted correctly, 
            clinical question addressed, no obvious document gaps, ready for LPN/RN/MD review)
          </p>
          <textarea
            id="concierge-rationale"
            value={rationale}
            onChange={(e) => setRationale(e.target.value.slice(0, MAX_CHARS))}
            rows={4}
            placeholder="AI brief accurately captured the patient's history, sleep study results (AHI 22), face-to-face eval date, and comorbidities. Extraction complete. No missing critical documents. Ready for clinical determination."
            className="w-full px-4 py-3 text-sm border border-border rounded-xl bg-white resize-y focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
            disabled={isSubmitting}
          />
          <div className="flex justify-between items-center mt-2">
            <span className="text-xs text-muted">Minimum {MIN_CHARS} characters of meaningful reasoning required</span>
            <div className="flex items-center gap-2">
              <div className="w-16 h-1.5 rounded-full bg-gray-200 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${
                    charCount < MIN_CHARS
                      ? 'bg-gray-400'
                      : charCount > MAX_CHARS * 0.9
                      ? 'bg-amber-500'
                      : 'bg-emerald-600'
                  }`}
                  style={{ width: `${charPercentage}%` }}
                />
              </div>
              <span className={`text-xs font-medium tabular-nums ${
                charCount < MIN_CHARS ? 'text-muted' : charCount > MAX_CHARS * 0.9 ? 'text-amber-600' : 'text-emerald-700'
              }`}>
                {charCount}/{MAX_CHARS}
              </span>
            </div>
          </div>
        </div>

        {/* Fact-Check Quality Gate — surfaces AI verification, requires explicit human acknowledgment when warranted */}
        {factCheck && (
          <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-4 space-y-3">
            <div className="flex items-start gap-3">
              <div className="mt-0.5">
                <VerificationScore score={factCheck.overall_score} status={factCheck.overall_status} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-amber-900 text-sm">Automated Fact-Check Report</div>
                <p className="text-xs text-amber-800 mt-0.5 leading-snug">
                  Deterministic cross-verification against medical criteria DB, recognized guidelines, CMS Two-Midnight Rule, and source case data fidelity.
                  {needsFactCheckAck ? ' Your explicit review is required before routing.' : ' Quality is strong; review recommended for defensibility.'}
                </p>
                {factCheck.review_reasons && factCheck.review_reasons.length > 0 && (
                  <ul className="mt-2 text-[11px] text-amber-900 list-disc ml-4">
                    {factCheck.review_reasons.slice(0, 3).map((r, i) => (
                      <li key={i}>{r}</li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            {needsFactCheckAck && (
              <div className="pt-2 border-t border-amber-200 space-y-3">
                <label className="flex items-start gap-2 text-sm text-amber-900 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={factCheckAck}
                    onChange={(e) => setFactCheckAck(e.target.checked)}
                    disabled={isSubmitting}
                    className="mt-0.5 accent-amber-600"
                  />
                  <span className="font-medium">
                    I have personally reviewed the full fact-check report (including flagged items, consistency failures, and data-fidelity warnings). I confirm no critical hallucinations, fabricated citations, or omitted key clinical data that would invalidate the brief.
                  </span>
                </label>

                <div>
                  <label htmlFor="fc-notes" className="block text-xs font-semibold text-amber-900 mb-1">
                    Fact-Check Review Notes <span className="text-red-600">*</span> (what specifically did you verify or clarify?)
                  </label>
                  <textarea
                    id="fc-notes"
                    value={factCheckNotes}
                    onChange={(e) => setFactCheckNotes(e.target.value.slice(0, 800))}
                    rows={2}
                    placeholder="Verified that flagged 'unrecognized guideline' was actually the client's custom policy excerpt in the fax. Fidelity section confirmed all codes match intake. 2-midnight flags noted but documentation supports inpatient."
                    className="w-full px-3 py-2 text-xs border border-amber-300 rounded-lg bg-white resize-y focus:outline-none focus:ring-1 focus:ring-amber-500/40"
                    disabled={isSubmitting}
                  />
                  <div className="text-[10px] text-amber-700 mt-1">
                    Minimum {FACT_CHECK_MIN} characters of explicit reasoning required when fact-check issues present.
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Optional structured flags for clean handoff to clinical team */}
        <div>
          <div>
            <div className="text-sm font-semibold text-foreground mb-3">Handoff Quality Signals (optional)</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {VALIDATION_FLAGS.map((flag) => {
                const active = selectedFlags.includes(flag.key);
                return (
                  <button
                    key={flag.key}
                    type="button"
                    onClick={() => toggleFlag(flag.key)}
                    disabled={isSubmitting}
                    className={`rounded-xl border px-4 py-3 text-left text-sm transition-all active:scale-[0.985] ${
                      active
                        ? 'border-emerald-400 bg-emerald-50 text-emerald-900 ring-1 ring-emerald-400/30'
                        : 'border-border bg-white text-foreground hover:border-emerald-200'
                    }`}
                  >
                    <div className="font-medium">{flag.label}</div>
                    <div className="text-[11px] text-muted mt-0.5">
                      {flag.key === 'extraction_accurate' && 'Key facts pulled correctly'}
                      {flag.key === 'clinical_context_clear' && 'Enough context for reviewer'}
                      {flag.key === 'documents_complete' && 'No obvious missing files'}
                      {flag.key === 'minor_gaps' && 'Flagged for downstream attention'}
                      {flag.key === 'needs_deeper_review' && 'Recommend MD-level scrutiny'}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
          <p className="text-[11px] text-muted mt-2">These travel with the case into the clinical review queue for better triage.</p>
        </div>

        {error && (
          <div className="rounded-lg bg-red-50 border border-red-200 text-red-800 px-4 py-2 text-sm">
            {error}
          </div>
        )}

        <div className="flex items-center justify-end gap-3 pt-2 border-t border-border">
          <button
            type="submit"
            disabled={isSubmitting || !isValid}
            className="inline-flex items-center gap-2 bg-navy text-gold px-5 py-2.5 rounded-lg text-sm font-semibold hover:bg-navy-light disabled:opacity-60 disabled:cursor-not-allowed transition-all active:scale-[0.985]"
          >
            {isSubmitting ? 'Validating…' : 'Validate Brief & Route to Clinical'}
            {!isSubmitting && (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            )}
          </button>
        </div>

        <div className="text-[11px] text-center text-muted">
          All actions are tenant-scoped and permanently recorded in the case audit trail.
        </div>
      </form>
    </div>
  );
}
