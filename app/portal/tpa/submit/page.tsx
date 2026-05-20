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
  const [submissionType, setSubmissionType] = useState<'um' | 'payer_idr'>('um');

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
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="skeleton skeleton-heading" />
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-6">
            <div className="lg:col-span-2 card p-8">
              <div className="skeleton skeleton-text" />
              <div className="skeleton skeleton-text" />
              <div className="skeleton skeleton-text" />
            </div>
            <div className="card p-6">
              <div className="skeleton skeleton-text" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Success state (merged Grok's polished version + hero treatment) ──
  if (success) {
    return (
      <div className="min-h-screen bg-background">
        <div className="bg-hero-subtle text-white py-14">
          <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-center animate-fade-in">
            <div className="mx-auto mb-5 h-16 w-16 rounded-full bg-gold/20 ring-4 ring-gold/30 flex items-center justify-center">
              <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#c9a227" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <p className="text-[11px] uppercase tracking-[0.18em] text-gold font-semibold">Received</p>
            <h1 className="font-[family-name:var(--font-display)] text-3xl md:text-4xl text-white mt-2">
              Authorization submitted
            </h1>
            <div className="mt-3 mx-auto h-[3px] w-16 bg-gold-gradient rounded-full" />
            <div className="mt-5 inline-flex items-center gap-2 rounded-2xl bg-white/10 ring-1 ring-white/20 px-5 py-1.5">
              <span className="text-[11px] uppercase tracking-[0.18em] text-white/70">Case</span>
              <span className="font-mono text-base font-semibold text-gold">{success.caseNumber}</span>
            </div>
          </div>
        </div>

        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 -mt-10 pb-16 animate-slide-up">
          <div className="card p-6 md:p-8">
            <h2 className="font-[family-name:var(--font-display)] text-xl text-navy">What happens next</h2>
            <p className="text-sm text-muted mt-1">
              The case is now in intake. The Brief Engine is generating the clinical summary and fact-check — it will appear on your dashboard within moments.
            </p>
            <ol className="mt-5 space-y-4">
              <Step n={1} title="Concierge intake" detail="A human concierge reviews the submission and the AI-extracted facts." />
              <Step n={2} title="Brief generation" detail="Our engine assembles the clinical brief with InterQual / MCG criteria." />
              <Step n={3} title="Clinician review" detail="A licensed reviewer (LPN / RN / MD) makes the determination." />
              <Step n={4} title="Decision delivered" detail="Approval, modification, or denial — with rationale and letter." />
            </ol>

            <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
              <button
                onClick={() => window.location.reload()}
                className="btn btn-secondary"
              >
                Submit another request
              </button>
              <Link href="/portal/tpa" className="btn btn-primary">
                Return to dashboard
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Submission flow ─────────────────────────────────────────
  return (
    <div className="min-h-screen bg-background">
      <div className="bg-hero-subtle text-white">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10 md:py-14">
          <Link href="/portal/tpa" className="text-xs text-white/60 hover:text-gold transition inline-flex items-center gap-1">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <polyline points="15 18 9 12 15 6" />
            </svg>
            Back to {profile.tpa.name}
          </Link>
          <div className="mt-4 animate-fade-in">
            <p className="text-[11px] uppercase tracking-[0.18em] text-gold font-semibold">Authorization request</p>
            <h1 className="font-[family-name:var(--font-display)] text-3xl md:text-4xl text-white mt-1">
              Submit a new case
            </h1>
            <div className="mt-3 h-[3px] w-16 bg-gold-gradient rounded-full" />
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 -mt-8 pb-16">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
          <section className="lg:col-span-2 card p-6 md:p-8 animate-slide-up">
            <div className="mb-6">
              <label className="block text-xs uppercase tracking-wide text-muted font-semibold mb-2">Submission type</label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setSubmissionType('um')}
                  className={`px-4 py-3 rounded-lg border text-sm font-semibold transition text-left ${
                    submissionType === 'um'
                      ? 'bg-navy text-white border-navy shadow-md'
                      : 'bg-surface text-foreground border-border hover:border-navy/40 hover:shadow-sm'
                  }`}
                >
                  <span className="block">Utilization Management</span>
                  <span className={`block text-[11px] font-normal mt-0.5 ${submissionType === 'um' ? 'text-white/70' : 'text-muted'}`}>
                    Standard prior auth, clinician review
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setSubmissionType('payer_idr')}
                  className={`px-4 py-3 rounded-lg border text-sm font-semibold transition text-left ${
                    submissionType === 'payer_idr'
                      ? 'bg-navy text-white border-navy shadow-md'
                      : 'bg-surface text-foreground border-border hover:border-navy/40 hover:shadow-sm'
                  }`}
                >
                  <span className="block">Payer IDR</span>
                  <span className={`block text-[11px] font-normal mt-0.5 ${submissionType === 'payer_idr' ? 'text-white/70' : 'text-muted'}`}>
                    Commercial dispute, attorney review
                  </span>
                </button>
              </div>
            </div>

            <CaseUploadForm
              scope={{ client_id: profile.tpa.id }}
              practiceOptions={profile.practices}
              onSuccess={(caseId, caseNumber) => {
                setSuccess({ caseId, caseNumber });
              }}
              caseType={submissionType}
            />
          </section>

          <aside className="card p-5 md:p-6 lg:sticky lg:top-6 animate-slide-up">
            <h2 className="text-xs font-bold text-navy uppercase tracking-[0.14em] mb-4">What happens next</h2>
            <ol className="space-y-4">
              <Step n={1} title="Concierge intake" detail="Human review of your submission within minutes." />
              <Step n={2} title="Brief generation" detail="AI assembles the clinical brief with InterQual / MCG criteria." />
              <Step n={3} title="Clinician review" detail="LPN, RN, or MD makes the determination." />
              <Step n={4} title="Decision delivered" detail="Determination + rationale + letter to your portal." />
            </ol>
            <div className="mt-5 pt-5 border-t border-border">
              <p className="text-[11px] uppercase tracking-wide text-muted font-semibold">Average turnaround</p>
              <p className="font-[family-name:var(--font-display)] text-2xl text-navy mt-0.5">&lt; 10 min</p>
              <p className="text-[11px] text-muted">Target ~2 min on straightforward cases.</p>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}

function Step({ n, title, detail }: { n: number; title: string; detail: string }) {
  return (
    <li className="flex items-start gap-3">
      <span className="mt-0.5 flex-shrink-0 w-6 h-6 rounded-full bg-gold-gradient text-navy text-[11px] font-bold flex items-center justify-center">
        {n}
      </span>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-navy leading-tight">{title}</p>
        <p className="text-xs text-muted mt-0.5">{detail}</p>
      </div>
    </li>
  );
}
