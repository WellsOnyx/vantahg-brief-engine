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
            <h3 className="font-[family-name:var(--font-dm-serif)] text-lg text-foreground">
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
          </label>
          <p className="text-xs text-muted mb-2">
            Provide the clinical reasoning supporting your determination. This will be included in the determination letter.
          </p>
          <textarea
            id="rationale"
            value={rationale}
            onChange={(e) => setRationale(e.target.value.slice(0, MAX_CHARS))}
            rows={5}
            placeholder="Describe the clinical rationale for your determination, referencing applicable guidelines, criteria met/unmet, and supporting documentation..."
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
