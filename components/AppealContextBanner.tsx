'use client';

import Link from 'next/link';

interface AppealContextBannerProps {
  originalCaseId?: string | null;
  originalCaseNumber?: string | null;
  originalDetermination?: string | null;
  originalDeterminationAt?: string | null;
  className?: string;
}

/**
 * Banner shown on appeal cases providing immediate context and back-link to the original determination.
 * Reinforces that this is a second look with a different reviewer.
 */
export function AppealContextBanner({
  originalCaseId,
  originalCaseNumber,
  originalDetermination,
  originalDeterminationAt,
  className,
}: AppealContextBannerProps) {
  if (!originalCaseId && !originalCaseNumber) return null;

  const label = originalCaseNumber || 'Original Case';

  return (
    <div className={`rounded-2xl border-l-4 border-purple-500 bg-purple-50/70 px-5 py-4 ${className ?? ''}`}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
        <div className="flex items-center gap-2">
          <span className="uppercase tracking-[1.5px] text-[10px] font-bold text-purple-700 bg-purple-200 px-2 py-0.5 rounded">APPEAL REVIEW</span>
          <span className="font-semibold text-purple-900">This is the First Appeal of</span>
        </div>

        {originalCaseId ? (
          <Link
            href={`/cases/${originalCaseId}`}
            className="font-mono font-semibold text-purple-900 hover:text-purple-700 underline underline-offset-2"
          >
            {label}
          </Link>
        ) : (
          <span className="font-mono font-semibold text-purple-900">{label}</span>
        )}

        {originalDetermination && (
          <span className="text-purple-800">
            (original: <span className="font-semibold uppercase">{originalDetermination}</span>
            {originalDeterminationAt && ` • ${new Date(originalDeterminationAt).toLocaleDateString()}`})
          </span>
        )}

        <span className="text-xs text-purple-700 ml-auto">Different reviewer assigned per policy</span>
      </div>
    </div>
  );
}
