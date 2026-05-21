'use client';

import { useEffect } from 'react';
import Link from 'next/link';

/**
 * SegmentError — per-route-segment error boundary content.
 *
 * Doctrine: when a route segment crashes, degrade gracefully — show the
 * room is intact, the work is recoverable, and offer two paths out:
 *   1. Retry the failed segment (Next.js reset)
 *   2. Step back to a safe surface (Dashboard)
 *
 * Used by app/<segment>/error.tsx files. Each segment can pass its own
 * `label` so the message is contextual instead of generic.
 */

export function SegmentError({
  error,
  reset,
  label,
  backHref = '/dashboard',
  backLabel = 'Back to dashboard',
}: {
  error: Error & { digest?: string };
  reset: () => void;
  /** What the user was looking at when this crashed, e.g. "case list". */
  label: string;
  backHref?: string;
  backLabel?: string;
}) {
  useEffect(() => {
    // Console for now; #89 will replace with structured logger + alerting.
    console.error(`[segment-error] ${label}:`, error);
  }, [error, label]);

  return (
    <div className="max-w-3xl mx-auto px-6 py-16">
      <div className="text-center">
        <span
          aria-hidden
          className="block font-[family-name:var(--font-display)] text-[64px] leading-none text-gold-dark/20 select-none"
        >
          V
        </span>
        <h1 className="font-[family-name:var(--font-display)] text-2xl md:text-3xl text-navy mt-4">
          The {label} is taking a breath.
        </h1>
        <p className="text-sm text-muted mt-3 max-w-md mx-auto">
          Something went sideways loading this view. The rest of the room is fine.
          Try again, or step back and we&apos;ll regroup.
        </p>
        {error?.digest && (
          <p className="text-[11px] text-muted/70 mt-4 font-mono">
            ref {error.digest}
          </p>
        )}
        <div className="mt-8 flex items-center justify-center gap-3 flex-wrap">
          <button
            onClick={reset}
            className="btn btn-primary px-5 py-2.5 text-sm rounded-lg"
          >
            Try again
          </button>
          <Link
            href={backHref}
            className="btn btn-secondary px-5 py-2.5 text-sm rounded-lg"
          >
            {backLabel}
          </Link>
        </div>
      </div>
    </div>
  );
}
