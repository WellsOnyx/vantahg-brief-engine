'use client';

import { useState } from 'react';
import Link from 'next/link';

interface FileFirstAppealModalProps {
  isOpen: boolean;
  onClose: () => void;
  caseId: string;
  caseNumber: string;
  determination?: string | null;
  determinationAt?: string | null;
  onSuccess?: (appealCaseId: string, appealCaseNumber: string) => void;
}

/**
 * Production-grade First Appeal Intake modal.
 *
 * Triggered from denial states in case detail or determination letter.
 * Captures the REQUIRED human justification for filing the appeal (the "reason").
 * This is the human reasoning layer for the appeal track — AI 95%, human provides defensible rationale.
 *
 * Clean handoff: success state shows direct link to the newly created appeal case.
 * Tenant scoped and audited end-to-end via the backing API + appeal-engine.
 */
export function FileFirstAppealModal({
  isOpen,
  onClose,
  caseId,
  caseNumber,
  determination,
  determinationAt,
  onSuccess,
}: FileFirstAppealModalProps) {
  const [reason, setReason] = useState('');
  const [additionalContext, setAdditionalContext] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState<{ appealCaseId: string; appealCaseNumber: string } | null>(null);

  const MIN_REASON = 25;
  const isReasonValid = reason.trim().length >= MIN_REASON;

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);

    if (!isReasonValid) {
      setError(`Please provide a detailed appeal reason of at least ${MIN_REASON} characters.`);
      setSubmitting(false);
      return;
    }

    const fullReason = additionalContext.trim()
      ? `${reason.trim()}\n\nAdditional context / new information:\n${additionalContext.trim()}`
      : reason.trim();

    try {
      const res = await fetch(`/api/cases/${caseId}/file-appeal`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reason: fullReason,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to file appeal');
      }

      const appealCaseNumber = data.appealCaseNumber || `${caseNumber}-APPEAL`;
      const appealCaseId = data.appealCaseId;

      setSuccess({ appealCaseId, appealCaseNumber });

      // Notify parent so it can update UI (banners etc)
      onSuccess?.(appealCaseId, appealCaseNumber);
    } catch (err: any) {
      setError(err.message || 'Could not file the appeal. Please try again or contact your Delivery Lead.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    // Reset state on close for clean re-open
    if (!success) {
      setReason('');
      setAdditionalContext('');
      setError('');
    }
    onClose();
    // If success, parent may want to keep success banner; we let parent control re-open
    if (success) {
      setSuccess(null);
      setReason('');
      setAdditionalContext('');
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4" onClick={handleClose}>
      <div
        className="bg-surface rounded-2xl border border-border shadow-2xl w-full max-w-2xl overflow-hidden animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-5 border-b border-border bg-gradient-to-b from-white to-gray-50/60 flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-[1.5px] text-muted font-semibold">First Level Appeal</p>
 <h2 className="text-2xl text-navy mt-0.5">
              File Appeal for {caseNumber}
            </h2>
          </div>
          <button
            onClick={handleClose}
            className="text-muted hover:text-navy p-1 rounded transition-colors"
            aria-label="Close"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {success ? (
          /* Success State — clean handoff */
          <div className="p-8 text-center">
            <div className="mx-auto w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mb-4">
              <svg className="w-9 h-9 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
 <h3 className="text-2xl text-navy">Appeal Filed Successfully</h3>
            <p className="mt-2 text-sm text-muted max-w-md mx-auto">
              A new linked appeal case has been created. The original case is now marked with <span className="font-medium text-navy">appeal_status: pending</span>.
            </p>

            <div className="mt-6 bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-left text-sm">
              <div className="font-mono text-xs text-emerald-700 mb-1">NEW APPEAL CASE</div>
              <div className="font-semibold text-lg text-emerald-900">{success.appealCaseNumber}</div>
              <p className="text-emerald-800 mt-1 text-xs">Review type: Appeal • Different reviewer will be assigned per policy.</p>
            </div>

            <div className="mt-6 flex flex-col sm:flex-row gap-3 justify-center">
              <Link
                href={`/cases/${success.appealCaseId}`}
                className="inline-flex items-center justify-center gap-2 bg-navy text-gold px-6 py-3 rounded-xl text-sm font-semibold hover:bg-navy-light transition-all"
                onClick={handleClose}
              >
                Open Appeal Case →
              </Link>
              <button
                onClick={handleClose}
                className="inline-flex items-center justify-center gap-2 border border-border px-6 py-3 rounded-xl text-sm font-medium hover:bg-gray-50"
              >
                Return to Original Case
              </button>
            </div>
            <p className="mt-4 text-[11px] text-muted">All filings and determinations are fully audited for regulatory defensibility.</p>
          </div>
        ) : (
          /* Form */
          <form onSubmit={handleSubmit} className="p-6 space-y-6">
            {/* Context reminder */}
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-900">
              <strong>Original determination:</strong> {determination?.toUpperCase() || 'DENIED'} 
              {determinationAt && ` on ${new Date(determinationAt).toLocaleDateString()}`}.
              Provide the clinical justification for why this determination should be reconsidered. Reference new information, re-evaluation of criteria, or specific guideline misapplication.
            </div>

            <div>
              <label className="block text-sm font-semibold text-foreground mb-1.5">
                Reason for Appeal <span className="text-red-500">*</span>
              </label>
              <p className="text-xs text-muted mb-2">This is the primary human justification. Be specific and cite clinical facts or guidelines.</p>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={5}
                placeholder="The denial cited insufficient documentation of conservative treatment, however the submitted records include 8 weeks of PT notes + NSAID trial with no improvement. Per InterQual criteria for this procedure, the patient meets medical necessity after documented failure of conservative care. Request re-review with the full record."
                className="w-full px-4 py-3 border border-border rounded-xl text-sm resize-y focus:outline-none focus:ring-2 focus:ring-navy/20"
                disabled={submitting}
              />
              <div className="text-xs text-right text-muted mt-1">
                {reason.trim().length} / min {MIN_REASON} chars
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-foreground mb-1.5">Additional Context or New Information (optional)</label>
              <textarea
                value={additionalContext}
                onChange={(e) => setAdditionalContext(e.target.value)}
                rows={3}
                placeholder="Any new clinical data, updated test results, or clarifying details received since the original determination..."
                className="w-full px-4 py-3 border border-border rounded-xl text-sm resize-y focus:outline-none focus:ring-2 focus:ring-navy/20"
                disabled={submitting}
              />
            </div>

            {error && (
              <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-800">{error}</div>
            )}

            <div className="flex items-center justify-between pt-4 border-t border-border">
              <button
                type="button"
                onClick={handleClose}
                disabled={submitting}
                className="px-5 py-2.5 text-sm font-medium text-muted hover:text-foreground transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting || !isReasonValid}
                className="inline-flex items-center gap-2 bg-navy text-gold px-6 py-2.5 rounded-xl text-sm font-semibold hover:bg-navy-light disabled:opacity-60 disabled:cursor-not-allowed transition-all"
              >
                {submitting ? 'Filing Appeal…' : 'File First Appeal with This Justification'}
              </button>
            </div>

            <p className="text-center text-[11px] text-muted">
              Filing creates a linked appeal case (review_type=appeal) with a different reviewer assigned. Original case appeal_status updated.
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
