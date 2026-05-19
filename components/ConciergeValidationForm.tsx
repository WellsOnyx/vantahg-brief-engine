'use client';

import { useState } from 'react';

interface ConciergeValidationFormProps {
  onSubmit: (payload: { rationale: string; flags: string[] }) => Promise<void>;
  isSubmitting: boolean;
  caseNumber?: string;
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

export function ConciergeValidationForm({ onSubmit, isSubmitting, caseNumber }: ConciergeValidationFormProps) {
  const [rationale, setRationale] = useState('');
  const [selectedFlags, setSelectedFlags] = useState<string[]>([]);
  const [error, setError] = useState('');

  const MIN_CHARS = 30;
  const MAX_CHARS = 1200;

  const charCount = rationale.trim().length;
  const isValid = charCount >= MIN_CHARS && charCount <= MAX_CHARS;

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
      await onSubmit({
        rationale: rationale.trim(),
        flags: selectedFlags,
      });
    } catch (err) {
      setError('Failed to submit validation. Please try again.');
    }
  };

  const charPercentage = Math.min((charCount / MAX_CHARS) * 100, 100);

  return (
    <div className="bg-surface rounded-xl border border-border shadow-sm animate-slide-up">
      <div className="p-5 border-b border-border bg-emerald-50/60">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-lg bg-emerald-600 flex items-center justify-center shrink-0 mt-0.5">
            <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="font-[family-name:var(--font-dm-serif)] text-xl text-navy">
              Validate AI Clinical Brief
            </h3>
            <p className="text-sm text-emerald-800 mt-1">
              AI handled extraction and brief generation. Your required reasoning is the first human quality gate.
              <span className="font-semibold"> This makes the process defensible.</span>
            </p>
            {caseNumber && (
              <p className="text-xs text-muted font-mono mt-1">Case {caseNumber}</p>
            )}
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="p-5 space-y-6">
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

        {/* Optional structured flags for clean handoff to clinical team */}
        <div>
          <div className="text-sm font-semibold text-foreground mb-2">Handoff Flags (optional but helpful)</div>
          <div className="flex flex-wrap gap-2">
            {VALIDATION_FLAGS.map((flag) => {
              const active = selectedFlags.includes(flag.key);
              return (
                <button
                  key={flag.key}
                  type="button"
                  onClick={() => toggleFlag(flag.key)}
                  disabled={isSubmitting}
                  className={`inline-flex items-center px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
                    active
                      ? 'bg-emerald-100 border-emerald-300 text-emerald-800'
                      : 'bg-white border-border text-muted hover:border-emerald-200 hover:text-emerald-700'
                  }`}
                >
                  {active && (
                    <svg className="w-3.5 h-3.5 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 10l7-7m0 0l7 7" />
                    </svg>
                  )}
                  {flag.label}
                </button>
              );
            })}
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
