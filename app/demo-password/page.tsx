'use client';

import { useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';

function DemoPasswordForm() {
  const searchParams = useSearchParams();
  const next = searchParams.get('next') || '/demo';

  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/verify-demo-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });

      if (res.ok) {
        // Success — the API set the cookie. Navigate to intended page.
        window.location.href = next.startsWith('/') ? next : '/demo';
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data?.error || 'Incorrect password. Please try again.');
      }
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#0c2340] text-white flex items-center justify-center p-6">
      <div className="max-w-md w-full">
        <div className="flex items-center gap-3 mb-8">
          <div className="w-10 h-10 rounded-xl bg-gold flex items-center justify-center">
            <span className="text-[#0c2340] font-bold text-2xl">V</span>
          </div>
          <div>
            <div className="font-semibold tracking-tight text-2xl">VantaUM</div>
            <div className="text-gold/70 text-xs -mt-1">PREVIEW ACCESS</div>
          </div>
        </div>

        <h1 className="text-3xl font-semibold mb-2">Welcome to the preview.</h1>
        <p className="text-white/70 mb-8">
          This is an exclusive early look at VantaUM’s canned demo experience.
          Enter the password you were given to continue.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="password" className="block text-sm text-white/60 mb-1.5">
              Preview password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-white/5 border border-white/20 rounded-xl px-4 py-3 text-white placeholder:text-white/40 focus:outline-none focus:border-gold/60"
              placeholder="••••••••"
              required
              autoComplete="off"
            />
          </div>

          {error && (
            <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !password}
            className="w-full bg-gold text-[#0c2340] font-semibold py-3.5 rounded-xl disabled:opacity-50 disabled:cursor-not-allowed hover:bg-[#d4b25c] active:bg-gold transition-colors"
          >
            {loading ? 'Verifying…' : 'Enter Preview'}
          </button>
        </form>

        <p className="text-xs text-white/40 mt-6 text-center">
          This preview is by invitation only. Password provided exclusively by the VantaUM team.
        </p>
      </div>
    </div>
  );
}

export default function DemoPasswordPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#0c2340] flex items-center justify-center text-white/60">Loading…</div>}>
      <DemoPasswordForm />
    </Suspense>
  );
}
