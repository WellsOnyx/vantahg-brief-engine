'use client';

import { useState } from 'react';
import type { FactCheckResult, VerificationStatus } from '@/lib/types';

// ── 1. FactCheckBadge ────────────────────────────────────────────────────────
// Inline pill/badge showing verification status per claim

interface FactCheckBadgeProps {
  status: VerificationStatus;
  explanation?: string;
}

const badgeConfig: Record<
  VerificationStatus,
  { label: string; classes: string; icon: React.ReactNode }
> = {
  verified: {
    label: 'Verified',
    classes: 'bg-green-100 text-green-800 border-green-200',
    icon: (
      <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
      </svg>
    ),
  },
  unverified: {
    label: 'Unverified',
    classes: 'bg-amber-100 text-amber-800 border-amber-200',
    icon: (
      <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z" />
      </svg>
    ),
  },
  flagged: {
    label: 'Flagged',
    classes: 'bg-red-100 text-red-800 border-red-200',
    icon: (
      <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
      </svg>
    ),
  },
};

export function FactCheckBadge({ status, explanation }: FactCheckBadgeProps) {
  const config = badgeConfig[status];

  return (
    <span
      className={`inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full font-semibold border ${config.classes} animate-scale-in`}
      title={explanation}
    >
      {config.icon}
      {config.label}
    </span>
  );
}


// ── 2. VerificationScore ─────────────────────────────────────────────────────
// Circular score display using SVG ring

interface VerificationScoreProps {
  score: number;
  status: 'pass' | 'warning' | 'fail';
}

const scoreColors: Record<string, { ring: string; text: string; label: string }> = {
  pass: { ring: '#22c55e', text: 'text-green-700', label: 'Verified' },
  warning: { ring: '#f59e0b', text: 'text-amber-700', label: 'Needs Review' },
  fail: { ring: '#ef4444', text: 'text-red-700', label: 'Review Required' },
};

export function VerificationScore({ score, status }: VerificationScoreProps) {
  const colors = scoreColors[status];

  // SVG circle math: radius 24, circumference ~150.8
  const radius = 24;
  const circumference = 2 * Math.PI * radius;
  const clampedScore = Math.max(0, Math.min(100, score));
  const offset = circumference - (clampedScore / 100) * circumference;

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative" style={{ width: 60, height: 60 }}>
        <svg
          width="60"
          height="60"
          viewBox="0 0 60 60"
          className="transform -rotate-90"
        >
          {/* Background ring */}
          <circle
            cx="30"
            cy="30"
            r={radius}
            fill="none"
            stroke="#e2e8f0"
            strokeWidth="5"
          />
          {/* Progress ring */}
          <circle
            cx="30"
            cy="30"
            r={radius}
            fill="none"
            stroke={colors.ring}
            strokeWidth="5"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            style={{ transition: 'stroke-dashoffset 0.8s ease-out' }}
          />
        </svg>
        {/* Score number in center */}
        <div className="absolute inset-0 flex items-center justify-center">
          <span className={`text-sm font-bold ${colors.text}`}>
            {clampedScore}
          </span>
        </div>
      </div>
      <span className={`text-[10px] font-semibold ${colors.text}`}>
        {colors.label}
      </span>
    </div>
  );
}


// ── 3. VerificationSummary ───────────────────────────────────────────────────
// Expandable panel with full fact-check breakdown

interface VerificationSummaryProps {
  factCheck: FactCheckResult;
}

export function VerificationSummary({ factCheck }: VerificationSummaryProps) {
  const [expanded, setExpanded] = useState(false);

  const allFlags = factCheck.sections.flatMap((s) => s.flags);

  return (
    <div className="bg-surface rounded-xl border border-border shadow-sm animate-slide-up">
      {/* Collapsed header — always visible */}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full px-5 py-4 flex items-center justify-between gap-4 text-left hover:bg-navy/[0.02] transition-colors rounded-xl"
      >
        <div className="flex items-center gap-4">
          <VerificationScore
            score={factCheck.overall_score}
            status={factCheck.overall_status}
          />
          <div>
            <h3 className="font-[family-name:var(--font-dm-serif)] text-base text-navy">
              Verification Report
            </h3>
            <div className="flex flex-wrap gap-3 mt-1">
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-green-700">
                <span className="w-2 h-2 rounded-full bg-green-500" />
                {factCheck.summary.verified} verified
              </span>
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-700">
                <span className="w-2 h-2 rounded-full bg-amber-500" />
                {factCheck.summary.unverified} unverified
              </span>
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-red-700">
                <span className="w-2 h-2 rounded-full bg-red-500" />
                {factCheck.summary.flagged} flagged
              </span>
            </div>
          </div>
        </div>

        {/* Expand/collapse chevron */}
        <svg
          className={`w-5 h-5 text-muted shrink-0 transition-transform duration-200 ${
            expanded ? 'rotate-180' : ''
          }`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
        </svg>
      </button>

      {/* Expanded details */}
      {expanded && (
        <div className="px-5 pb-5 pt-0 space-y-5 border-t border-border animate-fade-in">
          {/* Trust banner */}
          <div className="mt-4 px-4 py-2.5 rounded-lg bg-navy/[0.04] border border-navy/10">
            <p className="text-xs text-muted leading-relaxed flex items-center gap-2">
              <svg className="w-3.5 h-3.5 text-navy shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
              </svg>
              Automatically verified against known medical criteria and guidelines
            </p>
          </div>

          {/* Section-by-section claims */}
          {factCheck.sections.map((section, sIdx) => (
            <div key={sIdx}>
              <h4 className="font-[family-name:var(--font-dm-serif)] text-sm text-navy mb-2">
                {section.section}
              </h4>
              <div className="space-y-1.5">
                {section.claims.map((claim, cIdx) => (
                  <div
                    key={cIdx}
                    className="flex items-start gap-2.5 p-2.5 rounded-lg bg-background border border-border"
                  >
                    <div className="shrink-0 mt-0.5">
                      <FactCheckBadge
                        status={claim.status}
                        explanation={claim.explanation}
                      />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm text-foreground leading-relaxed">
                        {claim.claim}
                      </p>
                      {claim.source && (
                        <p className="text-[10px] text-muted mt-0.5">
                          Source: {claim.source}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Per-section flags */}
              {section.flags.length > 0 && (
                <div className="mt-2 space-y-1">
                  {section.flags.map((flag, fIdx) => (
                    <div
                      key={fIdx}
                      className="flex items-start gap-2 px-3 py-1.5 rounded-md bg-red-50 border border-red-100"
                    >
                      <svg className="w-3.5 h-3.5 text-red-500 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 3v1.5M3 21v-6m0 0l2.77-.693a9 9 0 016.208.682l.108.054a9 9 0 006.086.71l3.114-.732a48.524 48.524 0 01-.005-10.499l-3.11.732a9 9 0 01-6.085-.711l-.108-.054a9 9 0 00-6.208-.682L3 4.5M3 15V4.5" />
                      </svg>
                      <span className="text-xs text-red-800">{flag}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}

          {/* Consistency checks */}
          {factCheck.consistency_checks.length > 0 && (
            <div>
              <h4 className="font-[family-name:var(--font-dm-serif)] text-sm text-navy mb-2">
                Consistency Checks
              </h4>
              <div className="space-y-1.5">
                {factCheck.consistency_checks.map((check, idx) => (
                  <div
                    key={idx}
                    className={`flex items-start gap-2.5 p-2.5 rounded-lg border ${
                      check.passed
                        ? 'bg-green-50 border-green-100'
                        : 'bg-red-50 border-red-100'
                    }`}
                  >
                    <div
                      className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${
                        check.passed ? 'bg-green-500' : 'bg-red-500'
                      }`}
                    >
                      {check.passed ? (
                        <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                        </svg>
                      ) : (
                        <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      )}
                    </div>
                    <div className="min-w-0">
                      <p
                        className={`text-sm font-semibold ${
                          check.passed ? 'text-green-900' : 'text-red-900'
                        }`}
                      >
                        {check.check}
                      </p>
                      <p
                        className={`text-xs mt-0.5 ${
                          check.passed ? 'text-green-700' : 'text-red-700'
                        }`}
                      >
                        {check.detail}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Aggregated flags */}
          {allFlags.length > 0 && (
            <div className="p-4 rounded-xl bg-red-50 border border-red-200">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-6 h-6 rounded-full bg-red-500 flex items-center justify-center">
                  <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                  </svg>
                </div>
                <p className="text-xs font-semibold text-red-800 uppercase tracking-wider">
                  All Flags ({allFlags.length})
                </p>
              </div>
              <ul className="space-y-1.5 ml-8">
                {allFlags.map((flag, idx) => (
                  <li key={idx} className="flex items-start gap-2 text-sm text-red-900">
                    <span className="shrink-0 mt-1">&#8226;</span>
                    {flag}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
