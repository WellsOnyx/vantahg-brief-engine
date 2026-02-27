'use client';

import { useEffect } from 'react';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Application error:', error);
  }, [error]);

  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4">
      <div className="text-center">
        <div className="w-16 h-16 bg-red-100 rounded-2xl flex items-center justify-center text-red-600 text-2xl mx-auto mb-6">
          !
        </div>
        <h1 className="text-4xl font-bold text-navy mb-2">Something went wrong</h1>
        <p className="text-muted mb-8 max-w-md mx-auto">
          An unexpected error occurred. Our team has been notified.
        </p>
        <button
          onClick={reset}
          className="inline-flex items-center gap-2 px-6 py-3 bg-navy text-white rounded-lg text-sm font-semibold hover:bg-navy-light transition-colors"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
