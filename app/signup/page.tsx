'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  AuthShell,
  AuthField,
  AuthSelect,
  AuthCTA,
  AuthError,
} from '@/components/layouts/AuthShell';

/**
 * /signup — concierge-onboarded staff access request.
 *
 * Self-serve Supabase signUp was retired (it left the tenant open to
 * anyone who guessed the URL). This page posts to
 * /api/auth/request-access, which emails the onboarding inbox; ops
 * provisions the account by hand and emails a magic link back.
 *
 * TPA / health-plan prospects belong on /signup-tpa.
 */

type State = 'form' | 'sent' | 'create' | 'confirm';

const ROLE_OPTIONS = [
  { value: 'reviewer', label: 'Physician Reviewer' },
  { value: 'concierge_ops', label: 'Concierge Ops' },
  { value: 'idr_attorney', label: 'IDR Attorney' },
  { value: 'administrator', label: 'Administrator' },
];

export default function SignupPage() {
  const [state, setState] = useState<State>('form');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [organization, setOrganization] = useState('');
  const [role, setRole] = useState('reviewer');
  const [notes, setNotes] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/auth/request-access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          full_name: fullName,
          work_email: email,
          organization,
          role,
          notes: notes || undefined,
        }),
      });

      if (res.status === 429) {
        setError('Too many requests. Wait a minute and try again.');
      } else if (res.status >= 400 && res.status !== 202) {
        setError("That didn't go through. Double-check the fields and try again.");
      } else {
        setState('sent');
      }
    } catch {
      setError('Network error. Try again.');
    }

    setLoading(false);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/sign-up', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, full_name: fullName }),
      });
      const data = (await res.json().catch(() => ({}))) as { message?: string; error?: string };
      if (res.status === 503 && data.error === 'use_supabase') {
        setError('Client accounts are created by your admin on this deployment. Use Request access.');
      } else if (!res.ok) {
        setError(data.message || 'Check the password rules and try again.');
      } else {
        setNotice(data.message || 'Check your email for a confirmation code.');
        setState('confirm');
      }
    } catch {
      setError('Network error. Try again.');
    }
    setLoading(false);
  }

  async function handleConfirm(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code }),
      });
      const data = (await res.json().catch(() => ({}))) as { message?: string };
      if (!res.ok) {
        setError(data.message || 'That code did not work.');
      } else {
        window.location.href = '/login?reason=confirmed';
        return;
      }
    } catch {
      setError('Network error. Try again.');
    }
    setLoading(false);
  }

  if (state === 'confirm') {
    return (
      <AuthShell
        eyebrow="Confirm email"
        title={<>Enter the code.</>}
        subtitle="We sent it to your work email. After this, sign in. Cases appear once an admin links your organization."
        footer={
          <p>
            <button type="button" className="underline" onClick={() => setState('create')}>
              Back
            </button>
          </p>
        }
      >
        <form onSubmit={handleConfirm} className="space-y-6">
          {notice && <p className="text-sm text-navy">{notice}</p>}
          {error && <AuthError>{error}</AuthError>}
          <AuthField id="code" label="Confirmation code" value={code} onChange={setCode} required autoComplete="one-time-code" />
          <AuthCTA type="submit" disabled={loading}>{loading ? 'Confirming…' : 'Confirm email'}</AuthCTA>
        </form>
      </AuthShell>
    );
  }

  if (state === 'create') {
    return (
      <AuthShell
        eyebrow="Client account"
        title={<>Create your sign-in.</>}
        subtitle="Med Review client portal. Email verification is required. This does not open another organization's cases."
        footer={
          <p>
            <button type="button" className="underline" onClick={() => { setState('form'); setError(null); }}>
              Request staff access instead
            </button>
          </p>
        }
      >
        <form onSubmit={handleCreate} className="space-y-6">
          {error && <AuthError>{error}</AuthError>}
          <AuthField id="full_name" label="Full name" value={fullName} onChange={setFullName} required autoComplete="name" />
          <AuthField id="email" label="Work email" type="email" value={email} onChange={setEmail} required autoComplete="email" />
          <AuthField id="password" label="Password" type="password" value={password} onChange={setPassword} required autoComplete="new-password" minLength={12} />
          <p className="text-[11px] text-muted">12+ characters, upper and lower case, a number, and a symbol.</p>
          <AuthCTA type="submit" disabled={loading}>{loading ? 'Sending code…' : 'Send confirmation code'}</AuthCTA>
        </form>
      </AuthShell>
    );
  }

  if (state === 'sent') {
    return (
      <AuthShell
        eyebrow="Received"
        title={<>Your request is in.</>}
        subtitle="A human at Wells Onyx reviews every access request. We'll email you within one business day with a magic link to sign in."
        footer={
          <>
            <p>
              <Link
                href="/login"
                className="text-muted hover:text-navy underline decoration-dotted underline-offset-4"
              >
                Back to sign in
              </Link>
            </p>
            <p className="text-[10px] text-muted/60 mt-3">A Wells Onyx Service</p>
          </>
        }
      >
        <div className="space-y-6">
          <p className="text-sm text-muted leading-relaxed">
            We sent your request to{' '}
            <span className="text-navy font-medium">onboarding@wellsonyx.com</span>.
            Watch <span className="text-navy font-medium">{email}</span> for the
            confirmation.
          </p>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      eyebrow="Request access"
      title={<>Tell us who you are. We&apos;ll prepare the room.</>}
      subtitle="VantaUM access is concierge-onboarded — your account is provisioned by a human within one business day."
      footer={
        <>
          <p>
            Already onboarded?{' '}
            <Link
              href="/login"
              className="text-gold-dark underline decoration-gold/30 underline-offset-4 hover:decoration-gold"
            >
              Sign in.
            </Link>
          </p>
          <p>
            <Link
              href="/signup-tpa"
              className="text-muted hover:text-navy underline decoration-dotted underline-offset-4"
            >
              I&apos;m a TPA or health plan
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
          id="full_name"
          label="Full name"
          value={fullName}
          onChange={setFullName}
          placeholder="Dr. Jane Smith"
          required
          autoComplete="name"
        />

        <AuthField
          id="email"
          label="Work email"
          type="email"
          value={email}
          onChange={setEmail}
          placeholder="you@health-plan.com"
          required
          autoComplete="email"
        />

        <AuthField
          id="organization"
          label="Organization"
          value={organization}
          onChange={setOrganization}
          placeholder="Wells Onyx, ACME Health, …"
          required
          autoComplete="organization"
        />

        <AuthSelect
          id="role"
          label="Role"
          value={role}
          onChange={setRole}
          options={ROLE_OPTIONS}
          required
        />

        <div>
          <label
            htmlFor="notes"
            className="block text-[11px] uppercase tracking-[0.14em] text-muted font-semibold mb-2"
          >
            Anything we should know? <span className="text-muted/60 normal-case tracking-normal">(optional)</span>
          </label>
          <textarea
            id="notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            placeholder="Referred by, urgency, special access…"
            className="w-full bg-transparent border-0 border-b border-border px-0 py-3 text-base text-foreground placeholder:text-muted/50 focus:border-gold focus:ring-0 focus:outline-none transition-colors resize-none"
            style={{ borderRadius: 0, boxShadow: 'none' }}
          />
        </div>

        <div className="pt-2">
          <AuthCTA type="submit" disabled={loading}>
            {loading ? 'Sending…' : 'Request access'}
          </AuthCTA>
        </div>
        <p className="text-sm text-center">
          <button
            type="button"
            className="text-gold-dark underline decoration-gold/30 underline-offset-4"
            onClick={() => { setState('create'); setError(null); }}
          >
            Create a client account instead
          </button>
        </p>

        <p className="text-[11px] text-muted/70 leading-relaxed">
          By requesting access you agree to the Wells Onyx BAA and acceptable-use
          policy. We use your email to send a one-time sign-in link only.
        </p>
      </form>
    </AuthShell>
  );
}
