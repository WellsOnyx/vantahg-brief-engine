'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { createBrowserClient, hasBrowserSupabaseConfig } from '@/lib/supabase-browser';

export default function ProviderLoginPage() {
  return (
    <div className="max-w-md mx-auto pt-12">
      <h1 className="font-serif text-2xl text-center">Provider portal sign-in</h1>
      <p className="text-sm text-slate-600 text-center mt-2">
        We&apos;ll email you a one-time link. No password, no sign-up form.
      </p>
      <div className="mt-6 bg-white border border-slate-200 rounded-lg p-6">
        <Suspense fallback={<div className="text-sm text-slate-500">Loading…</div>}>
          <LoginForm />
        </Suspense>
      </div>
      <p className="text-xs text-slate-500 text-center mt-6">
        First time here? Once you click the link, you&apos;ll land in the portal. If your office
        isn&apos;t set up yet, contact your TPA representative.
      </p>
    </div>
  );
}

function LoginForm() {
  const params = useSearchParams();
  const next = params.get('next') || '/firstmover/portal';
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send() {
    setSending(true);
    setError(null);

    if (!hasBrowserSupabaseConfig()) {
      // Demo mode: pretend we sent the link and direct the user onward.
      setSent(true);
      setTimeout(() => {
        window.location.href = next;
      }, 1500);
      return;
    }

    try {
      const supabase = createBrowserClient();
      if (!supabase) throw new Error('Supabase client unavailable');
      const redirectTo = `${window.location.origin}/firstmover/portal/auth-callback?next=${encodeURIComponent(next)}`;
      const { error: err } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: redirectTo },
      });
      if (err) throw err;
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send link');
    } finally {
      setSending(false);
    }
  }

  if (sent) {
    return (
      <div className="text-center space-y-3">
        <div className="inline-block w-10 h-10 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center">
          ✓
        </div>
        <div className="font-serif text-lg">Check your email</div>
        <p className="text-sm text-slate-600">
          {hasBrowserSupabaseConfig()
            ? `We sent a sign-in link to ${email}. The link expires in 1 hour.`
            : 'Demo mode — redirecting you to the portal…'}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <label className="block">
        <span className="block text-xs font-medium text-slate-600 mb-1">Work email</span>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@yourclinic.com"
          className="w-full border border-slate-300 rounded px-3 py-2 focus:border-[#0c2340] focus:outline-none"
        />
      </label>
      {error && <p className="text-sm text-red-700">{error}</p>}
      <button
        type="button"
        onClick={send}
        disabled={!email || sending}
        className="w-full bg-[#0c2340] disabled:bg-slate-300 text-white font-medium py-2 rounded hover:bg-[#173869]"
      >
        {sending ? 'Sending link…' : 'Email me a sign-in link'}
      </button>
    </div>
  );
}
