'use client';

import { useState } from 'react';

interface DeterminationFormProps {
  onSubmit: (determination: string, rationale: string) => Promise<void>;
  isSubmitting: boolean;
}

const determinationOptions = [
  {
    value: 'approve',
    label: 'Approve',
    description: 'Clinical criteria met, authorize the procedure',
    color: 'border-green-300 bg-green-50 text-green-800',
    ring: 'ring-green-500',
    dot: 'bg-green-500',
  },
  {
    value: 'deny',
    label: 'Deny',
    description: 'Clinical criteria not met, deny authorization',
    color: 'border-red-300 bg-red-50 text-red-800',
    ring: 'ring-red-500',
    dot: 'bg-red-500',
  },
  {
    value: 'partial_approve',
    label: 'Partial Approve',
    description: 'Approve some elements, deny or modify others',
    color: 'border-amber-300 bg-amber-50 text-amber-800',
    ring: 'ring-amber-500',
    dot: 'bg-amber-500',
  },
  {
    value: 'pend',
    label: 'Pend',
    description: 'Insufficient information, request additional documentation',
    color: 'border-blue-300 bg-blue-50 text-blue-800',
    ring: 'ring-blue-500',
    dot: 'bg-blue-500',
  },
  {
    value: 'peer_to_peer_requested',
    label: 'Request Peer-to-Peer',
    description: 'Schedule a peer-to-peer discussion with the requesting provider',
    color: 'border-purple-300 bg-purple-50 text-purple-800',
    ring: 'ring-purple-500',
    dot: 'bg-purple-500',
  },
];

export function DeterminationForm({ onSubmit, isSubmitting }: DeterminationFormProps) {
  const [determination, setDetermination] = useState('');
  const [rationale, setRationale] = useState('');
  const [error, setError] = useState('');

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

    await onSubmit(determination, rationale.trim());
  };

  return (
    <div className="bg-surface rounded-lg border border-border">
      <div className="p-4 border-b border-border">
        <h3 className="font-[family-name:var(--font-dm-serif)] text-lg text-foreground">
          Clinical Determination
        </h3>
        <p className="text-xs text-muted mt-0.5">
          Review the AI brief and clinical documentation, then submit your determination.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="p-4 space-y-5">
        {/* Determination options */}
        <fieldset>
          <legend className="text-sm font-semibold text-foreground mb-3">
            Determination <span className="text-red-500">*</span>
          </legend>
          <div className="space-y-2">
            {determinationOptions.map((option) => {
              const isChecked = determination === option.value;

              return (
                <label
                  key={option.value}
                  className={`relative flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                    isChecked
                      ? `${option.color} ring-2 ${option.ring}`
                      : 'border-border hover:border-gray-300 bg-white'
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
                  <div className="pt-0.5">
                    <div
                      className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                        isChecked ? 'border-current' : 'border-gray-300'
                      }`}
                    >
                      {isChecked && (
                        <div className={`w-2 h-2 rounded-full ${option.dot}`} />
                      )}
                    </div>
                  </div>
                  <div>
                    <span className="text-sm font-semibold">{option.label}</span>
                    <p className={`text-xs mt-0.5 ${isChecked ? 'opacity-80' : 'text-muted'}`}>
                      {option.description}
                    </p>
                  </div>
                </label>
              );
            })}
          </div>
        </fieldset>

        {/* Rationale */}
        <div>
          <label htmlFor="rationale" className="block text-sm font-semibold text-foreground mb-1.5">
            Clinical Rationale <span className="text-red-500">*</span>
          </label>
          <p className="text-xs text-muted mb-2">
            Provide the clinical reasoning supporting your determination. This will be included in the determination letter.
          </p>
          <textarea
            id="rationale"
            value={rationale}
            onChange={(e) => setRationale(e.target.value)}
            rows={5}
            placeholder="Describe the clinical rationale for your determination, referencing applicable guidelines, criteria met/unmet, and supporting documentation..."
            className="w-full px-3 py-2 text-sm border border-border rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-gold/50 focus:border-gold resize-y"
          />
          <div className="flex justify-between items-center mt-1">
            <span className="text-xs text-muted">Minimum 20 characters</span>
            <span className={`text-xs ${rationale.trim().length < 20 ? 'text-muted' : 'text-green-600'}`}>
              {rationale.trim().length} characters
            </span>
          </div>
        </div>

        {/* Error message */}
        {error && (
          <div className="flex items-center gap-2 p-3 rounded-md bg-red-50 border border-red-200">
            <svg className="w-4 h-4 text-red-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
            </svg>
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        {/* Submit button */}
        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full flex items-center justify-center gap-2 px-6 py-3 rounded-lg bg-navy text-gold font-semibold text-sm hover:bg-navy-light transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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
