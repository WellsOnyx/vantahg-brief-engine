'use client';

import { useState, useMemo, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { createBrowserClient } from '@/lib/supabase-browser';
import type { SupabaseClient } from '@supabase/supabase-js';
import Link from 'next/link';
import {
  AuthShell,
  AuthField,
  AuthCTA,
  AuthError,
} from '@/components/layouts/AuthShell';
import { pickLoginTagline } from '@/lib/login-taglines';

/**
 * Routes a freshly-signed-in user to the right landing page based on their
 * role. Never returns '/' (chromeless marketing page) — every signed-in
 * user lands on an app surface with the nav visible.
 */
async function resolveLandingPage(supabase: SupabaseClient): Promise<string> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return '/login';
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('role')
      .eq('id', user.id)
      .maybeSingle();
    const role = profile?.role ?? 'reviewer';
    switch (role) {
      case 'admin':         return '/mission-control';
      case 'ceo':           return '/office-ceo';
      case 'slt':           return '/office-ceo';
      case 'builder':       return '/builders';
      case 'client':        return '/client/cases';
      case 'reviewer':      return '/cases';
      case 'practice-lead': return '/cases';
      default:              return '/cases';
    }
  } catch {
    return '/cases';
  }
}

type Mode = 'password' | 'magic-link' | 'magic-link-sent';

function LoginForm() {
  const searchParams = useSearchParams();
  const explicitRedirect = searchParams.get('redirect');
  const reason = searchParams.get('reason');
  const fromSquarespace = searchParams.get('from') === 'squarespace';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<Mode>('password');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(
    reason === 'auth_unavailable'
      ? 'Authentication is temporarily unavailable. Try again in a moment.'
      : reason === 'portal_access_required'
        ? 'Sign in to reach the partner portal.'
        : null,
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const supabase = createBrowserClient();

    if (!supabase) {
      // Demo mode — pass straight through.
      window.location.href = explicitRedirect || '/';
      return;
    }

    if (mode === 'magic-link') {
      try {
        const res = await fetch('/api/auth/request-magic-link', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email,
            next: explicitRedirect ?? '/dashboard',
          }),
        });
        if (res.status === 429) {
          setError('Too many requests. Wait a minute and try again.');
        } else if (res.status >= 400 && res.status !== 202) {
          setError("That didn't work. Check the email and try again.");
        } else {
          setMode('magic-link-sent');
        }
      } catch {
        setError('Network error. Try again.');
      }
    } else {
      // Cognito sign-in via the server route. Supabase password auth is
      // retained as a fallback for the V1 hybrid path: if the AWS route
      // returns 503 (Cognito misconfigured) we fall back to Supabase.
      try {
        const res = await fetch('/api/auth/sign-in', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email,
            password,
            next: explicitRedirect ?? undefined,
          }),
        });

        if (res.ok) {
          const data = (await res.json().catch(() => ({}))) as { next?: string };
          const destination = data.next ?? explicitRedirect ?? '/dashboard';
          window.location.href = destination;
          return;
        }

        if (res.status === 503) {
          // Cognito not wired — fall back to Supabase path.
          const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
          if (signInError) {
            setError("That email and password don't match our records.");
          } else {
            const destination = explicitRedirect ?? (await resolveLandingPage(supabase));
            window.location.href = destination;
            return;
          }
        } else if (res.status === 429) {
          setError('Too many sign-in attempts. Wait a minute and try again.');
        } else {
          setError("That email and password don't match our records.");
        }
      } catch {
        setError('Network error. Try again.');
      }
    }

    setLoading(false);
  }

  // ── State: magic-link confirmation ─────────────────────────────
  if (mode === 'magic-link-sent') {
    const emailDomain = email.split('@')[1] || 'your inbox';
    return (
      <AuthShell
        eyebrow="Sent"
        title={<>Check {emailDomain}.</>}
        subtitle="The link is good for 15 minutes and works on this device or any other."
        footer={
          <>
            <p>
              <button
                type="button"
                onClick={() => {
                  setMode('magic-link');
                }}
                className="text-navy/70 hover:text-navy underline decoration-dotted underline-offset-4"
              >
                Use a different email
              </button>
            </p>
            <p>
              <a
                href="https://www.wellsonyx.com/firstlevelreview"
                className="text-muted hover:text-navy underline decoration-dotted underline-offset-4"
              >
                Return to wellsonyx.com
              </a>
            </p>
          </>
        }
      >
        <div className="space-y-6">
          <p className="text-sm text-muted leading-relaxed">
            We sent a one-time link to{' '}
            <span className="text-navy font-medium">{email}</span>. Click it on
            this device or your phone to finish signing in.
          </p>
          <AuthCTA
            type="button"
            onClick={() => {
              setMode('magic-link');
              setError(null);
            }}
          >
            Didn&apos;t get it? Send again
          </AuthCTA>
        </div>
      </AuthShell>
    );
  }

  // ── State: password or magic-link request ──────────────────────
  // Rotating tagline — picked once per mount so it stays stable
  // while the user types, but rotates on every fresh visit / refresh.
  const tagline = useMemo(() => pickLoginTagline(), []);

  const eyebrow = fromSquarespace ? 'Welcome' : 'Sign in';
  const title = fromSquarespace ? (
    <>Welcome from Wells Onyx.</>
  ) : (
    <>{tagline.title}</>
  );
  const subtitle =
    'Signed sessions for VantaUM reviewers, concierges, and partner clients.';

  return (
    <AuthShell
      eyebrow={eyebrow}
      title={title}
      subtitle={subtitle}
      footer={
        <>
          <p>
            <Link
              href="/client/cases"
              className="text-muted hover:text-navy underline decoration-dotted underline-offset-4"
            >
              View my cases
            </Link>
            <span className="text-gold/60 mx-2">·</span>
            <a
              href="https://www.wellsonyx.com/firstlevelreview"
              className="text-muted hover:text-navy underline decoration-dotted underline-offset-4"
            >
              Return to wellsonyx.com
            </a>
          </p>
          <p className="text-[10px] text-muted/60 mt-3">A Wells Onyx Service</p>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-6">
        {error && <AuthError>{error}</AuthError>}

        <AuthField
          id="email"
          label="Email"
          type="email"
          value={email}
          onChange={setEmail}
          placeholder="you@health-plan.com"
          required
          autoComplete="email"
        />

        {mode === 'password' && (
          <AuthField
            id="password"
            label="Password"
            type="password"
            value={password}
            onChange={setPassword}
            placeholder="••••••••"
            required
            autoComplete="current-password"
          />
        )}

        <div className="pt-2">
          <AuthCTA type="submit" disabled={loading}>
            {loading ? 'Signing in…' : mode === 'magic-link' ? 'Send link' : 'Continue'}
          </AuthCTA>
        </div>

        <p className="text-sm text-navy/70 text-center">
          {mode === 'magic-link' ? (
            <>
              Prefer a password?{' '}
              <button
                type="button"
                onClick={() => {
                  setMode('password');
                  setError(null);
                }}
                className="text-gold-dark underline decoration-gold/30 underline-offset-4 hover:decoration-gold"
              >
                Use one instead.
              </button>
            </>
          ) : (
            <>
              Prefer a magic link?{' '}
              <button
                type="button"
                onClick={() => {
                  setMode('magic-link');
                  setError(null);
                }}
                className="text-gold-dark underline decoration-gold/30 underline-offset-4 hover:decoration-gold"
              >
                Email me one instead.
              </button>
            </>
          )}
        </p>
      </form>
    </AuthShell>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-background flex items-center justify-center">
          <p className="text-sm text-muted animate-pulse">Loading…</p>
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
