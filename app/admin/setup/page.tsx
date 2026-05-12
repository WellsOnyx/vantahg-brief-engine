'use client';

import { useEffect, useState } from 'react';
import type { RealModeStatus, ComponentStatus } from '@/lib/real-mode-status';

/**
 * Admin "ops setup" checklist.
 *
 * Aggregated, action-oriented view of what production needs to look real.
 * Reuses /api/admin/real-mode-status for the env/connection probes, then
 * groups the components into setup steps with copy-paste-ready instructions.
 *
 * Designed so a non-engineer can read it and know exactly what to click
 * where. No commands, no jargon.
 */

interface SetupStep {
  key: keyof RealModeStatus['components'];
  title: string;
  /** One-line "why this matters". */
  blurb: string;
  /** Where to click / what to do. Plain prose, no terminal commands. */
  howTo: string[];
}

const STEPS: SetupStep[] = [
  {
    key: 'supabase',
    title: 'Connect Supabase',
    blurb: 'The database that holds every signup, contract, case, and audit log. Required.',
    howTo: [
      'Supabase dashboard → Project Settings → API.',
      'Copy the Project URL and add it to Vercel as NEXT_PUBLIC_SUPABASE_URL.',
      'Copy the anon public key as NEXT_PUBLIC_SUPABASE_ANON_KEY.',
      'Copy the service_role key as SUPABASE_SERVICE_ROLE_KEY (keep this secret).',
    ],
  },
  {
    key: 'migrations',
    title: 'Run database migrations',
    blurb: 'Creates the tables for signups, contracts, and the contract generator. Required.',
    howTo: [
      'Supabase dashboard → SQL Editor.',
      'Open each file under supabase/migrations/ from 010 through 014 in order.',
      'Paste into SQL Editor and click Run. Each one is idempotent — safe to re-run.',
      'Or, if you have the Supabase CLI linked: run "supabase db push" from the repo root.',
    ],
  },
  {
    key: 'anthropic',
    title: 'Enable Anthropic for real briefs',
    blurb: 'The AI that generates clinical briefs. Without this, briefs use deterministic demo data.',
    howTo: [
      'console.anthropic.com → API keys → create a key.',
      'Add to Vercel as ANTHROPIC_API_KEY.',
      'Add ENABLE_REAL_ANTHROPIC=true to Vercel to flip from demo to real calls.',
    ],
  },
  {
    key: 'hellosign',
    title: 'Wire up Dropbox Sign (e-signature)',
    blurb: 'Sends contract MSAs to TPAs and counter-signs with Jonathan Arias automatically.',
    howTo: [
      'app.hellosign.com → API → API Settings.',
      'Copy the API key to Vercel as HELLOSIGN_API_KEY.',
      'Copy the Client ID (App ID) to Vercel as HELLOSIGN_CLIENT_ID.',
      'Add ENABLE_REAL_HELLOSIGN=true to Vercel.',
      'Set the "Event callback URL" to: https://vantaum.com/api/webhooks/hellosign',
      'Click Test on the webhook in the Dropbox Sign dashboard — should show success.',
    ],
  },
  {
    key: 'cron',
    title: 'Set cron secret',
    blurb: 'Protects scheduled jobs (eFax processing) from being called by anyone with the URL.',
    howTo: [
      'Generate a long random token (any password manager works).',
      'Add to Vercel as CRON_SECRET.',
    ],
  },
  {
    key: 'efax',
    title: 'eFax intake (Phaxio)',
    blurb: 'Optional — only needed if TPAs send auth requests via fax. Other channels still work without it.',
    howTo: [
      'console.phaxio.com → API credentials.',
      'Add PHAXIO_API_KEY, PHAXIO_API_SECRET, and PHAXIO_CALLBACK_TOKEN to Vercel.',
    ],
  },
  {
    key: 'ocr',
    title: 'Google Vision OCR',
    blurb: 'Optional — extracts text from scanned faxes. Falls back to provider OCR if absent.',
    howTo: [
      'console.cloud.google.com → APIs & Services → Credentials → Create API key.',
      'Enable the Vision API for the project.',
      'Add to Vercel as GOOGLE_VISION_API_KEY.',
    ],
  },
  {
    key: 'sentry',
    title: 'Error monitoring (optional)',
    blurb: 'Pages engineering on errors. Without it, errors land in Vercel logs + audit log.',
    howTo: [
      'sentry.io → create a Next.js project.',
      'Copy the DSN and add to Vercel as SENTRY_DSN.',
    ],
  },
];

const STATUS_STYLE: Record<ComponentStatus['status'], { dot: string; pill: string; label: string }> = {
  ready: { dot: 'bg-emerald-500', pill: 'bg-emerald-50 text-emerald-800 border-emerald-200', label: 'Ready' },
  missing: { dot: 'bg-amber-500', pill: 'bg-amber-50 text-amber-900 border-amber-200', label: 'Needs setup' },
  demo: { dot: 'bg-gray-400', pill: 'bg-gray-50 text-gray-700 border-gray-200', label: 'Demo mode' },
};

const OVERALL: Record<RealModeStatus['overall'], { title: string; body: string; pill: string }> = {
  ready: {
    title: 'Production-ready',
    body: 'All required components are wired up. You can onboard real TPAs.',
    pill: 'bg-emerald-50 border-emerald-200 text-emerald-900',
  },
  partial: {
    title: 'Partial — needs setup',
    body: 'Some required components are missing. Work through the steps below in order.',
    pill: 'bg-amber-50 border-amber-200 text-amber-900',
  },
  demo: {
    title: 'Demo mode',
    body: 'The app is running on static fixtures. Connect Supabase first to switch to real mode.',
    pill: 'bg-gray-50 border-gray-200 text-gray-900',
  },
};

export default function AdminSetupPage() {
  const [status, setStatus] = useState<RealModeStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  async function load() {
    setRefreshing(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/real-mode-status', { cache: 'no-store' });
      if (!res.ok) {
        if (res.status === 401 || res.status === 403) {
          setError('You need admin role to view this page.');
        } else {
          setError(`Could not load status (${res.status}).`);
        }
        return;
      }
      setStatus((await res.json()) as RealModeStatus);
    } catch {
      setError('Network error. Try again.');
    } finally {
      setRefreshing(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  return (
    <div className="py-10 md:py-16 bg-background min-h-screen">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
        <header>
          <p className="text-xs uppercase tracking-wide text-muted font-semibold">Operations</p>
          <h1 className="text-3xl md:text-4xl font-bold text-navy mt-1">Production Setup</h1>
          <p className="text-sm text-muted mt-2 max-w-2xl">
            Every component the platform needs to operate on real customer data, with the exact
            steps to wire each one. Refresh this page after changing Vercel env vars.
          </p>
        </header>

        {error && (
          <div className="rounded-lg bg-red-50 border border-red-200 text-red-800 text-sm px-4 py-3">
            {error}
          </div>
        )}

        {status && (
          <>
            <section className={`rounded-xl border shadow-sm p-5 ${OVERALL[status.overall].pill}`}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-base font-semibold">{OVERALL[status.overall].title}</div>
                  <p className="text-sm mt-1">{OVERALL[status.overall].body}</p>
                </div>
                <button
                  onClick={() => void load()}
                  disabled={refreshing}
                  className="bg-white border border-current/20 px-3 py-1.5 rounded-md text-xs font-semibold hover:bg-white/80 disabled:opacity-50"
                >
                  {refreshing ? 'Refreshing…' : 'Refresh'}
                </button>
              </div>
            </section>

            <section className="space-y-3">
              {STEPS.map((step) => {
                const comp = status.components[step.key];
                if (!comp) return null;
                const s = STATUS_STYLE[comp.status];
                return (
                  <details
                    key={step.key}
                    className="bg-surface rounded-xl border border-border shadow-sm overflow-hidden"
                    open={comp.status !== 'ready'}
                  >
                    <summary className="cursor-pointer px-5 py-4 flex items-center gap-3 hover:bg-background">
                      <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${s.dot}`} />
                      <span className="font-semibold text-navy text-base">{step.title}</span>
                      <span className={`ml-auto inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border ${s.pill}`}>
                        {s.label}
                      </span>
                    </summary>
                    <div className="px-5 pb-5 pt-1 border-t border-border space-y-3">
                      <p className="text-sm text-navy/80">{step.blurb}</p>
                      <p className="text-xs text-muted">{comp.hint}</p>
                      {comp.missing.length > 0 && (
                        <div className="text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
                          <span className="font-semibold">Missing: </span>
                          <span className="font-mono">{comp.missing.join(', ')}</span>
                        </div>
                      )}
                      <ol className="text-sm text-navy/80 space-y-1.5 list-decimal list-inside">
                        {step.howTo.map((line, idx) => (
                          <li key={idx}>{line}</li>
                        ))}
                      </ol>
                    </div>
                  </details>
                );
              })}
            </section>

            <p className="text-xs text-muted text-center pt-2">
              Last checked {new Date(status.generated_at).toLocaleString()}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
