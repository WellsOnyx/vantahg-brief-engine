'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import CaseUploadForm from '@/components/CaseUploadForm';

interface ProviderProfile {
  practice: { id: string; name: string };
  tpa: { id: string; name: string } | null;
}

export default function ProviderSubmitPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<ProviderProfile | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const res = await fetch('/api/provider/me', { cache: 'no-store' });
      if (!res.ok) {
        if (res.status === 401) router.replace('/login?redirect=/portal/provider/submit');
        else {
          const body = await res.json().catch(() => ({}));
          setError(body.error ?? `Could not load (${res.status})`);
        }
        return;
      }
      setProfile((await res.json()) as ProviderProfile);
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

  if (!profile || !profile.tpa) {
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
            <p className="text-xs uppercase tracking-wide text-muted font-semibold">{profile.practice.name} · {profile.tpa.name}</p>
            <h1 className="text-2xl md:text-3xl font-bold text-navy mt-1">Submit authorization request</h1>
          </div>
          <Link href="/portal/provider" className="text-sm text-navy underline">← Back</Link>
        </header>

        <section className="bg-surface rounded-xl border border-border shadow-sm p-6 md:p-8">
          <CaseUploadForm
            scope={{ client_id: profile.tpa.id, practice_id: profile.practice.id }}
            onSuccess={(caseId, caseNumber) => {
              router.push(`/cases/${caseId}?submitted=${encodeURIComponent(caseNumber)}`);
            }}
          />
        </section>
      </div>
    </div>
  );
}
