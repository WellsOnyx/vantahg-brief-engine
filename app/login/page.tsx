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
import { landingPathForRole } from '@/lib/auth-landing';
import { authMessage } from '@/lib/auth/account-flow';

/**
 * Routes a freshly-signed-in hybrid (Supabase) user to the right landing
 * page based on their role. Cognito sign-in returns `next` from the
 * server and does not use this helper.
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
    return landingPathForRole(profile?.role ?? 'reviewer');
  } catch {
    return '/cases';
  }
}

type Mode = 'password' | 'magic-link' | 'magic-link-sent' | 'forgot' | 'reset' | 'mfa' | 'new-password' | 'confirm-email';

function LoginForm() {
  const searchParams = useSearchParams();
  const explicitRedirect = searchParams.get('redirect');
  const reason = searchParams.get('reason');
  const fromSquarespace = searchParams.get('from') === 'squarespace';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<Mode>('password');
  const [loading, setLoading] = useState(false);
  const [code, setCode] = useState('');
  const [challengeSession, setChallengeSession] = useState('');
  const [challengeName, setChallengeName] = useState<'SOFTWARE_TOKEN_MFA' | 'SMS_MFA' | 'NEW_PASSWORD_REQUIRED'>('SOFTWARE_TOKEN_MFA');
  const [notice, setNotice] = useState<string | null>(
    reason === 'confirmed' ? 'Email confirmed. Sign in.' : null,
  );
  const [error, setError] = useState<string | null>(
    reason === 'auth_unavailable'
      ? 'Authentication is temporarily unavailable. Try again in a moment.'
      : reason === 'portal_access_required'
        ? 'Sign in to reach the partner portal.'
        : reason === 'session_expired'
          ? authMessage('session_expired')
          : null,
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const supabase = createBrowserClient();

    // NOTE: We deliberately do NOT short-circuit when supabase is null.
    // On Fargate, Supabase env vars are empty by design — the new path is
    // Cognito via /api/auth/sign-in (password) or /api/auth/request-magic-link.
    // The demo-mode "pass straight through to /" branch was the old V0
    // behavior and bypasses real auth. Only allow it when we're explicitly
    // in client-side demo mode (NEXT_PUBLIC_DEMO_MODE=true).
    const browserDemoMode = process.env.NEXT_PUBLIC_DEMO_MODE === 'true';
    if (!supabase && browserDemoMode) {
      window.location.href = explicitRedirect || '/dashboard';
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

        const data = (await res.json().catch(() => ({}))) as {
          next?: string;
          error?: string;
          message?: string;
          backend?: string;
          challenge?: 'SOFTWARE_TOKEN_MFA' | 'SMS_MFA' | 'NEW_PASSWORD_REQUIRED';
          session?: string;
        };

        if (res.ok) {
          const destination = data.next ?? explicitRedirect ?? '/dashboard';
          window.location.href = destination;
          return;
        }

        if (data.error === 'challenge' && data.session && data.challenge) {
          setChallengeSession(data.session);
          setChallengeName(data.challenge);
          setNotice(data.message || null);
          setMode(data.challenge === 'NEW_PASSWORD_REQUIRED' ? 'new-password' : 'mfa');
          setLoading(false);
          return;
        }
        if (data.error === 'unconfirmed') {
          setNotice(data.message || authMessage('unconfirmed'));
          setMode('confirm-email');
          setLoading(false);
          return;
        }
        if (data.error === 'password_reset_required') {
          setNotice(data.message || authMessage('password_reset_required'));
          setMode('forgot');
          setLoading(false);
          return;
        }

        if (res.status === 503) {
          const payload = (await res.json().catch(() => ({}))) as { backend?: string };
          // ENABLE_AWS_AUTH=true: do not fall back to Supabase Auth.
          if (payload.backend === 'cognito') {
            setError('Authentication is not configured on this deployment.');
          } else if (!supabase) {
            setError('Authentication is not configured on this deployment.');
          } else {
            // Hybrid path (flag off): existing supabase.auth.signInWithPassword.
            const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
            if (signInError) {
              setError("That email and password don't match our records.");
            } else {
              const destination = explicitRedirect ?? (await resolveLandingPage(supabase));
              window.location.href = destination;
              return;
            }
          }
        } else if (res.status === 429) {
          setError(data.message || 'Too many sign-in attempts. Wait a minute and try again.');
        } else {
          setError(data.message || "That email and password don't match our records.");
        }
      } catch {
        setError('Network error. Try again.');
      }
    }

    setLoading(false);
  }

  // Rotating tagline — picked once per mount so it stays stable
  // while the user types, but rotates on every fresh visit / refresh.
  // Declared before any conditional return so hooks stay unconditional.
  const tagline = useMemo(() => pickLoginTagline(), []);

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

  async function postJson(url: string, payload: Record<string, unknown>) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = (await res.json().catch(() => ({}))) as { ok?: boolean; message?: string; error?: string; next?: string; session?: string; challenge?: typeof challengeName };
    return { res, data };
  }

  if (mode === 'forgot' || mode === 'reset') {
    return (
      <AuthShell
        eyebrow={mode === 'forgot' ? 'Reset' : 'New password'}
        title={mode === 'forgot' ? <>We&apos;ll send a code.</> : <>Choose a new password.</>}
        subtitle="The code goes to your work email. It does not reveal whether the account exists."
        footer={
          <button type="button" className="underline" onClick={() => { setMode('password'); setError(null); }}>
            Back to sign in
          </button>
        }
      >
        <form
          className="space-y-6"
          onSubmit={async (e) => {
            e.preventDefault();
            setLoading(true);
            setError(null);
            try {
              if (mode === 'forgot') {
                const { res, data } = await postJson('/api/auth/forgot-password', { email });
                if (res.status === 503 && data.error === 'use_supabase') {
                  setError('Password reset runs through your administrator on this deployment.');
                } else if (!res.ok) {
                  setError(data.message || 'Try again in a minute.');
                } else {
                  setNotice(data.message || null);
                  setMode('reset');
                }
              } else {
                const { res, data } = await postJson('/api/auth/reset-password', { email, code, password });
                if (!res.ok) setError(data.message || 'That code did not work.');
                else {
                  setNotice(data.message || 'Password updated.');
                  setMode('password');
                  setPassword('');
                }
              }
            } catch {
              setError('Network error. Try again.');
            }
            setLoading(false);
          }}
        >
          {notice && <p className="text-sm text-navy">{notice}</p>}
          {error && <AuthError>{error}</AuthError>}
          <AuthField id="email" label="Email" type="email" value={email} onChange={setEmail} required autoComplete="email" />
          {mode === 'reset' && (
            <>
              <AuthField id="code" label="Reset code" value={code} onChange={setCode} required autoComplete="one-time-code" />
              <AuthField id="password" label="New password" type="password" value={password} onChange={setPassword} required autoComplete="new-password" minLength={12} />
            </>
          )}
          <AuthCTA type="submit" disabled={loading}>{loading ? 'Working…' : mode === 'forgot' ? 'Send code' : 'Update password'}</AuthCTA>
        </form>
      </AuthShell>
    );
  }

  if (mode === 'mfa' || mode === 'new-password' || mode === 'confirm-email') {
    return (
      <AuthShell
        eyebrow={mode === 'confirm-email' ? 'Confirm email' : 'Verify'}
        title={mode === 'new-password' ? <>Set your password.</> : mode === 'confirm-email' ? <>Confirm your email.</> : <>Enter your code.</>}
        subtitle={notice || 'This step finishes sign-in. It is not optional when your account requires it.'}
        footer={
          <button type="button" className="underline" onClick={() => { setMode('password'); setError(null); }}>
            Back to sign in
          </button>
        }
      >
        <form
          className="space-y-6"
          onSubmit={async (e) => {
            e.preventDefault();
            setLoading(true);
            setError(null);
            try {
              if (mode === 'confirm-email') {
                const { res, data } = await postJson('/api/auth/confirm', { email, code });
                if (!res.ok) setError(data.message || 'That code did not work.');
                else {
                  setNotice(data.message || 'Email confirmed.');
                  setMode('password');
                }
              } else {
                const { res, data } = await postJson('/api/auth/challenge', {
                  email,
                  session: challengeSession,
                  challenge: mode === 'new-password' ? 'NEW_PASSWORD_REQUIRED' : challengeName,
                  code: mode === 'new-password' ? undefined : code,
                  new_password: mode === 'new-password' ? password : undefined,
                  next: explicitRedirect ?? undefined,
                });
                if (data.error === 'challenge' && data.session) {
                  setChallengeSession(data.session);
                  if (data.challenge) setChallengeName(data.challenge);
                  setNotice(data.message || null);
                  setMode(data.challenge === 'NEW_PASSWORD_REQUIRED' ? 'new-password' : 'mfa');
                } else if (!res.ok) {
                  setError(data.message || 'That code did not work.');
                } else {
                  window.location.href = data.next || explicitRedirect || '/dashboard';
                  return;
                }
              }
            } catch {
              setError('Network error. Try again.');
            }
            setLoading(false);
          }}
        >
          {error && <AuthError>{error}</AuthError>}
          {mode === 'new-password' ? (
            <AuthField id="password" label="New password" type="password" value={password} onChange={setPassword} required autoComplete="new-password" minLength={12} />
          ) : (
            <AuthField id="code" label="Code" value={code} onChange={setCode} required autoComplete="one-time-code" />
          )}
          <AuthCTA type="submit" disabled={loading}>{loading ? 'Checking…' : 'Continue'}</AuthCTA>
        </form>
      </AuthShell>
    );
  }

  // ── State: password or magic-link request ──────────────────────
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
              href="/signup"
              className="text-muted hover:text-navy underline decoration-dotted underline-offset-4"
            >
              Create a client account
            </Link>
          </p>
          <p className="text-[10px] text-muted/60 mt-3">A Wells Onyx Service</p>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-6">
        {notice && <p className="text-sm text-navy">{notice}</p>}
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

        {mode === 'password' && (
          <p className="text-sm text-right">
            <button
              type="button"
              className="text-gold-dark underline decoration-gold/30 underline-offset-4"
              onClick={() => { setMode('forgot'); setError(null); }}
            >
              Forgot password?
            </button>
          </p>
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

      {/* Prominent one-click demo entry for prospects — frictionless canned experience */}
      <div className="mt-6 pt-5 border-t border-navy/10">
        <div className="rounded-lg border border-gold/40 bg-[#fffaf0] p-3.5 text-center">
          <div className="text-[10px] font-semibold tracking-[0.1em] text-gold uppercase mb-1">Guided demo</div>
          <p className="text-xs text-navy/70 mb-2 leading-snug">Pre-canned synthetic data. No signup. Placeholder criteria (not InterQual), briefs, and audits. Not a live feed.</p>
          <a href="/demo-tour" className="inline-block rounded-md bg-gold px-4 py-1.5 text-xs font-semibold text-navy hover:bg-[#d8b25e] active:bg-gold">Launch Canned Demo (Southwest TPA) →</a>
          <div className="mt-1.5 text-[10px] text-navy/50">Or <a href="/demo" className="underline">interactive brief</a> · <Link href="/cases" className="underline">full app demo</Link></div>
        </div>
      </div>
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
