'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import CaseUploadForm from '@/components/CaseUploadForm';

interface TpaProfile {
  tpa: { id: string; name: string };
  practices: Array<{ id: string; name: string }>;
}

export default function TpaSubmitPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<TpaProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ caseId: string; caseNumber: string } | null>(null);

  useEffect(() => {
    (async () => {
      const res = await fetch('/api/tpa/me', { cache: 'no-store' });
      if (!res.ok) {
        if (res.status === 401) router.replace('/login?redirect=/portal/tpa/submit');
        else setError(`Could not load (${res.status})`);
        return;
      }
      setProfile((await res.json()) as TpaProfile);
    })();
  }, [router]);

  if (error) {
    return (
      <div className="py-10 md:py-16 bg-background min-h-screen">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="rounded-lg bg-red-50 border border-red-200 text-red-800 px-4 py-3 text-sm">{error}</div>
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="py-10 md:py-16 bg-background min-h-screen">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-muted">Loading…</div>
      </div>
    );
  }

  // Nice in-portal success state (better than redirecting TPA users to internal /cases)
  if (success) {
    return (
      <div className="py-10 md:py-16 bg-background min-h-screen">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="bg-surface rounded-2xl border border-border shadow-sm p-8 text-center">
            <div className="mx-auto mb-4 h-12 w-12 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-2xl">✓</div>
            <h1 className="text-2xl font-bold text-navy">Case submitted successfully</h1>
            <p className="mt-2 text-muted">
              Case <span className="font-mono font-semibold text-navy">{success.caseNumber}</span> has been received.
            </p>
            <p className="text-sm text-muted mt-1">
              It is now in intake and will appear on your dashboard shortly. Supporting documents (if any) have been attached.
            </p>

            <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
              <button
                onClick={() => {
                  setSuccess(null);
                  // Reset for another submission
                  window.location.reload();
                }}
                className="px-6 py-2.5 rounded-lg border border-border text-sm font-medium hover:bg-background"
              >
                Submit another case
              </button>
              <Link
                href="/portal/tpa"
                className="px-6 py-2.5 rounded-lg bg-navy text-white text-sm font-semibold hover:bg-navy/90"
              >
                Back to Dashboard
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="py-10 md:py-16 bg-background min-h-screen">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
        <header className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted font-semibold">{profile.tpa.name}</p>
            <h1 className="text-2xl md:text-3xl font-bold text-navy mt-1">Submit authorization request</h1>
          </div>
          <Link href="/portal/tpa" className="text-sm text-navy underline">← Back to Dashboard</Link>
        </header>

        <section className="bg-surface rounded-xl border border-border shadow-sm p-6 md:p-8">
          <CaseUploadForm
            scope={{ client_id: profile.tpa.id }}
            practiceOptions={profile.practices}
            onSuccess={(caseId, caseNumber) => {
              // Stay inside the TPA portal for a better experience
              setSuccess({ caseId, caseNumber });
            }}
          />
        </section>

        <p className="text-xs text-center text-muted">
          Your submission will appear in the Recent Cases section on your dashboard.
        </p>
      </div>
    </div>
  );
}
