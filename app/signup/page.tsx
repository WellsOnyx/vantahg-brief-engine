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

type State = 'form' | 'sent';

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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

        <p className="text-[11px] text-muted/70 leading-relaxed">
          By requesting access you agree to the Wells Onyx BAA and acceptable-use
          policy. We use your email to send a one-time sign-in link only.
        </p>
      </form>
    </AuthShell>
  );
}
