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

  return (
    <div className="py-10 md:py-16 bg-background min-h-screen">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
        <header className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted font-semibold">{profile.tpa.name}</p>
            <h1 className="text-2xl md:text-3xl font-bold text-navy mt-1">Submit authorization request</h1>
          </div>
          <Link href="/portal/tpa" className="text-sm text-navy underline">← Back</Link>
        </header>

        <section className="bg-surface rounded-xl border border-border shadow-sm p-6 md:p-8">
          <CaseUploadForm
            scope={{ client_id: profile.tpa.id }}
            practiceOptions={profile.practices}
            onSuccess={(caseId, caseNumber) => {
              router.push(`/cases/${caseId}?submitted=${encodeURIComponent(caseNumber)}`);
            }}
          />
        </section>
      </div>
    </div>
  );
}
