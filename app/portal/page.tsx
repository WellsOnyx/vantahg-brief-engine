'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createBrowserClient } from '@/lib/supabase-browser';
import {
  AuthShell,
  AuthField,
  AuthCTA,
  AuthError,
} from '@/components/layouts/AuthShell';

/**
 * Authenticated IRO portal entry. Replaces the public synthetic demo.
 * Sign-in uses the existing Cognito route, with the hybrid Supabase
 * password path only when that route reports the Supabase backend.
 */
export default function IroPortalEntryPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [signedIn, setSignedIn] = useState<{ portal_role: string; mfa: { ready: boolean; satisfied: boolean } } | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/iro/session')
      .then(async (res) => {
        if (!res.ok) return null;
        return res.json() as Promise<{ user: { portal_role: string }; mfa: { ready: boolean; satisfied: boolean } }>;
      })
      .then((body) => {
        if (!cancelled && body?.user) {
          setSignedIn({ portal_role: body.user.portal_role, mfa: body.mfa });
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/sign-in', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, next: '/portal/iro' }),
      });
      if (res.ok) {
        window.location.href = '/portal/iro';
        return;
      }
      if (res.status === 503) {
        const payload = (await res.json().catch(() => ({}))) as { backend?: string };
        const supabase = createBrowserClient();
        if (payload.backend === 'cognito' || !supabase) {
          setError('Authentication is not configured on this deployment.');
        } else {
          const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
          if (signInError) setError('That email and password do not match our records.');
          else window.location.href = '/portal/iro';
        }
      } else if (res.status === 429) {
        setError('Too many sign-in attempts. Wait a minute and try again.');
      } else {
        setError('That email and password do not match our records.');
      }
    } catch {
      setError('Network error. Try again.');
    }
    setLoading(false);
  }

  return (
    <AuthShell
      eyebrow="IRO portal"
      title="Staff sign in"
      subtitle="Internal intake, case management, review, and medical director sign-off. Case files stay on the existing AWS account."
      footer={<p>Multi-factor sign-in uses the existing Cognito user pool.</p>}
    >
      {signedIn ? (
        <div className="space-y-4">
          <p className="text-sm text-muted">
            Signed in as <span className="text-navy font-semibold">{signedIn.portal_role.replace('_', ' ')}</span>.
            {signedIn.mfa.satisfied ? ' MFA is on this session.' : ' MFA is available for this account.'}
          </p>
          <AuthCTA type="button" onClick={() => { router.push('/portal/iro'); }}>
            Open the case desk
          </AuthCTA>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-6">
          <AuthField id="email" label="Email" type="email" value={email} onChange={setEmail} autoComplete="username" required />
          <AuthField id="password" label="Password" type="password" value={password} onChange={setPassword} autoComplete="current-password" required />
          {error ? <AuthError>{error}</AuthError> : null}
          <AuthCTA type="submit" disabled={loading}>
            {loading ? 'Signing in…' : 'Sign in'}
          </AuthCTA>
        </form>
      )}
    </AuthShell>
  );
}
