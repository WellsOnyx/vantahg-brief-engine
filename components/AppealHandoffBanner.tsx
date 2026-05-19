'use client';

import Link from 'next/link';

interface AppealHandoffBannerProps {
  appealCaseId?: string | null;
  appealCaseNumber?: string | null;
  appealStatus?: string | null;
  className?: string;
}

/**
 * Prominent, reusable banner for an original case that has an active first appeal.
 * Appears in case detail header area and lists for instant bidirectional navigation.
 */
export function AppealHandoffBanner({ appealCaseId, appealCaseNumber, appealStatus, className }: AppealHandoffBannerProps) {
  if (!appealCaseId && !appealCaseNumber) return null;

  const label = appealCaseNumber || 'Appeal Case';
  const statusLabel = appealStatus ? appealStatus.replace(/_/g, ' ') : 'Pending';

  return (
    <div className={`flex items-center gap-3 rounded-xl border border-purple-200 bg-purple-50 px-4 py-3 text-sm ${className ?? ''}`}>
      <div className="flex items-center gap-2 text-purple-700">
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
        </svg>
        <span className="font-semibold uppercase tracking-wider text-xs">First Appeal Filed</span>
      </div>
      <div className="text-purple-900 font-medium">
        {label}
      </div>
      <span className="px-2 py-0.5 text-[10px] rounded-full bg-purple-200 text-purple-800 font-medium">{statusLabel}</span>
      {appealCaseId && (
        <Link
          href={`/cases/${appealCaseId}`}
          className="ml-auto inline-flex items-center gap-1 rounded-lg bg-white px-3 py-1 text-xs font-semibold text-purple-700 border border-purple-200 hover:bg-purple-100 transition-colors"
        >
          View Appeal Case →
        </Link>
      )}
    </div>
  );
}
