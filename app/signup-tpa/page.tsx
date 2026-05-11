'use client';

import { useState } from 'react';
import Link from 'next/link';

/**
 * Public TPA signup form. Posts to POST /api/signup-tpa which writes
 * to signup_requests (migration 012) in status=pending_review.
 *
 * Prospect-facing — chromeless layout (no internal app nav). Aesthetic
 * matches the marketing homepage: navy + gold, DM Serif Display for the
 * heading, generous whitespace, single-column form for clarity.
 *
 * Validation strategy: HTML5 + server zod is the source of truth.
 * Field-level error messages render under the input that failed when
 * the server returns a 400 with issues[].
 */

interface FieldIssue {
  field: string;
  code: string;
}

type FormState = 'editing' | 'submitting' | 'success' | 'error';

interface FormData {
  legal_name: string;
  dba: string;
  entity_state: string;
  street_address: string;
  city: string;
  state: string;
  zip: string;
  primary_contact_name: string;
  primary_contact_title: string;
  primary_contact_email: string;
  primary_contact_phone: string;
  signer_name: string;
  signer_title: string;
  signer_email: string;
  estimated_members: string;       // form input is string; coerced on submit
  expected_weekly_auths: string;
  existing_tpa_system: string;
  notes: string;
}

const EMPTY: FormData = {
  legal_name: '', dba: '', entity_state: '', street_address: '', city: '', state: '', zip: '',
  primary_contact_name: '', primary_contact_title: '', primary_contact_email: '', primary_contact_phone: '',
  signer_name: '', signer_title: '', signer_email: '',
  estimated_members: '', expected_weekly_auths: '',
  existing_tpa_system: '', notes: '',
};

export default function SignupTpaPage() {
  const [data, setData] = useState<FormData>(EMPTY);
  const [state, setState] = useState<FormState>('editing');
  const [issues, setIssues] = useState<FieldIssue[]>([]);
  const [bannerError, setBannerError] = useState<string | null>(null);

  function update<K extends keyof FormData>(key: K) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setData((d) => ({ ...d, [key]: e.target.value }));
      // Clear field-specific issue on edit.
      setIssues((prev) => prev.filter((i) => i.field !== key));
    };
  }

  function issueFor(field: keyof FormData): string | null {
    const issue = issues.find((i) => i.field === field);
    if (!issue) return null;
    // Translate a few common zod codes to friendlier text.
    switch (issue.code) {
      case 'invalid_type': return 'Required';
      case 'too_small': return 'Required';
      case 'too_big': return 'Too long';
      case 'invalid_string': return 'Please check the format';
      default: return 'Invalid value';
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setState('submitting');
    setBannerError(null);
    setIssues([]);

    // Coerce numeric fields. Empty string → undefined (omit from body).
    const body: Record<string, unknown> = {
      legal_name: data.legal_name.trim(),
      dba: optional(data.dba),
      entity_state: optional(data.entity_state),
      street_address: optional(data.street_address),
      city: optional(data.city),
      state: optional(data.state),
      zip: optional(data.zip),
      primary_contact_name: data.primary_contact_name.trim(),
      primary_contact_title: optional(data.primary_contact_title),
      primary_contact_email: data.primary_contact_email.trim(),
      primary_contact_phone: optional(data.primary_contact_phone),
      signer_name: optional(data.signer_name),
      signer_title: optional(data.signer_title),
      signer_email: optional(data.signer_email),
      estimated_members: numeric(data.estimated_members),
      expected_weekly_auths: numeric(data.expected_weekly_auths),
      existing_tpa_system: optional(data.existing_tpa_system),
      notes: optional(data.notes),
    };

    try {
      const res = await fetch('/api/signup-tpa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (res.status === 201) {
        setState('success');
        return;
      }

      if (res.status === 400) {
        const parsed = await res.json().catch(() => ({}));
        if (Array.isArray(parsed?.issues)) {
          setIssues(parsed.issues as FieldIssue[]);
        }
        setState('error');
        setBannerError('Please fix the highlighted fields and try again.');
        return;
      }

      if (res.status === 429) {
        setState('error');
        setBannerError('Too many submissions. Please try again in a minute.');
        return;
      }

      setState('error');
      setBannerError('Something went wrong. Please email hello@wellsonyx.com and we’ll follow up directly.');
    } catch {
      setState('error');
      setBannerError('Network error. Please check your connection and try again.');
    }
  }

  if (state === 'success') {
    return <SuccessState legalName={data.legal_name} />;
  }

  return (
    <div className="min-h-screen bg-[#fafaf6]">
      <Header />

      <main className="max-w-3xl mx-auto px-6 sm:px-8 py-12 md:py-20">
        <div className="mb-10 md:mb-14">
          <p className="text-xs uppercase tracking-[0.18em] text-gold-dark font-semibold mb-3">
            Founding TPA Application
          </p>
          <h1 className="font-[family-name:var(--font-dm-serif)] text-4xl md:text-5xl text-navy leading-tight">
            Apply for early access
          </h1>
          <p className="text-muted mt-4 text-lg leading-relaxed">
            Tell us about your operation. We&rsquo;ll review and reach out within one business day with next steps,
            contract terms, and onboarding plan.
          </p>
        </div>

        {bannerError && (
          <div className="mb-6 p-4 rounded-lg bg-red-50 border border-red-200 text-red-800 text-sm">
            {bannerError}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-10">
          <Section title="Company" subtitle="Legal entity that will sign the contract">
            <Field label="Legal name" required error={issueFor('legal_name')}>
              <input
                type="text"
                required
                value={data.legal_name}
                onChange={update('legal_name')}
                className={inputClass(issueFor('legal_name'))}
                placeholder="Acme Benefit Administrators, LLC"
              />
            </Field>
            <Field label="DBA (optional)">
              <input type="text" value={data.dba} onChange={update('dba')} className={inputClass(null)} placeholder="Acme TPA" />
            </Field>
            <Field label="State of incorporation (optional)">
              <input type="text" value={data.entity_state} onChange={update('entity_state')} className={inputClass(null)} placeholder="Delaware" />
            </Field>
            <Field label="Address (optional)">
              <input type="text" value={data.street_address} onChange={update('street_address')} className={inputClass(null)} placeholder="Street address" />
            </Field>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Field label="City (optional)">
                <input type="text" value={data.city} onChange={update('city')} className={inputClass(null)} />
              </Field>
              <Field label="State (optional)">
                <input type="text" value={data.state} onChange={update('state')} className={inputClass(null)} />
              </Field>
              <Field label="ZIP (optional)">
                <input type="text" value={data.zip} onChange={update('zip')} className={inputClass(null)} />
              </Field>
            </div>
          </Section>

          <Section title="Primary contact" subtitle="Who we&rsquo;ll work with day-to-day">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Name" required error={issueFor('primary_contact_name')}>
                <input
                  type="text"
                  required
                  value={data.primary_contact_name}
                  onChange={update('primary_contact_name')}
                  className={inputClass(issueFor('primary_contact_name'))}
                  placeholder="Jane Operations"
                />
              </Field>
              <Field label="Title (optional)">
                <input type="text" value={data.primary_contact_title} onChange={update('primary_contact_title')} className={inputClass(null)} placeholder="VP of Operations" />
              </Field>
            </div>
            <Field label="Email" required error={issueFor('primary_contact_email')}>
              <input
                type="email"
                required
                value={data.primary_contact_email}
                onChange={update('primary_contact_email')}
                className={inputClass(issueFor('primary_contact_email'))}
                placeholder="jane@acme.example"
              />
            </Field>
            <Field label="Phone (optional)">
              <input type="tel" value={data.primary_contact_phone} onChange={update('primary_contact_phone')} className={inputClass(null)} placeholder="(555) 123-4567" />
            </Field>
          </Section>

          <Section title="Contract signer (optional)" subtitle="If different from primary contact">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Signer name">
                <input type="text" value={data.signer_name} onChange={update('signer_name')} className={inputClass(null)} />
              </Field>
              <Field label="Signer title">
                <input type="text" value={data.signer_title} onChange={update('signer_title')} className={inputClass(null)} placeholder="CEO" />
              </Field>
            </div>
            <Field label="Signer email" error={issueFor('signer_email')}>
              <input type="email" value={data.signer_email} onChange={update('signer_email')} className={inputClass(issueFor('signer_email'))} />
            </Field>
          </Section>

          <Section title="Your operation" subtitle="Helps us size the right concierge team for you">
            <Field label="Current TPA / authorization system">
              <input
                type="text"
                value={data.existing_tpa_system}
                onChange={update('existing_tpa_system')}
                className={inputClass(null)}
                placeholder="Trizetto, Eldorado, Javelina, Healthx, internal build, etc."
              />
            </Field>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Estimated covered lives">
                <input
                  type="number"
                  min={0}
                  value={data.estimated_members}
                  onChange={update('estimated_members')}
                  className={inputClass(null)}
                  placeholder="25000"
                />
              </Field>
              <Field label="Expected auths per week">
                <input
                  type="number"
                  min={0}
                  value={data.expected_weekly_auths}
                  onChange={update('expected_weekly_auths')}
                  className={inputClass(null)}
                  placeholder="120"
                />
              </Field>
            </div>
            <Field label="Anything else we should know? (optional)">
              <textarea
                value={data.notes}
                onChange={update('notes')}
                rows={4}
                className={`${inputClass(null)} resize-y`}
                placeholder="Service lines, key contractors, timing constraints, etc."
              />
            </Field>
          </Section>

          <div className="pt-4 border-t border-border">
            <button
              type="submit"
              disabled={state === 'submitting'}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-navy text-white px-8 py-3.5 rounded-lg text-sm font-semibold tracking-wide uppercase hover:bg-navy-light transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {state === 'submitting' ? 'Submitting…' : 'Submit Application'}
            </button>
            <p className="text-xs text-muted mt-4 leading-relaxed">
              We&rsquo;ll respond within one business day. No PHI required at this stage — submission only
              captures business contact information and high-level volume estimates.
            </p>
          </div>
        </form>
      </main>

      <Footer />
    </div>
  );
}

// ── Components ─────────────────────────────────────────────────────────────

function Header() {
  return (
    <header className="border-b border-border bg-white">
      <div className="max-w-3xl mx-auto px-6 sm:px-8 py-5 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2.5">
          <div className="w-8 h-8 bg-gold-gradient rounded-md flex items-center justify-center font-bold text-navy text-sm">
            V
          </div>
          <span className="font-[family-name:var(--font-dm-serif)] text-lg tracking-tight text-navy">
            Vanta<span className="text-gold-dark">UM</span>
          </span>
        </Link>
        <Link href="/" className="text-sm text-muted hover:text-navy transition-colors">
          ← Back to vantaum.com
        </Link>
      </div>
    </header>
  );
}

function Footer() {
  return (
    <footer className="border-t border-border bg-white mt-10">
      <div className="max-w-3xl mx-auto px-6 sm:px-8 py-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-muted">
        <span>VantaUM &middot; A Wells Onyx Service</span>
        <span>Questions? <a href="mailto:hello@wellsonyx.com" className="text-gold-dark hover:text-gold underline decoration-dotted">hello@wellsonyx.com</a></span>
      </div>
    </footer>
  );
}

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4">
      <div>
        <h2 className="font-[family-name:var(--font-dm-serif)] text-2xl text-navy">{title}</h2>
        {subtitle && <p className="text-sm text-muted mt-1">{subtitle}</p>}
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

function Field({
  label,
  required,
  error,
  children,
}: {
  label: string;
  required?: boolean;
  error?: string | null;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="block text-sm font-medium text-navy mb-1.5">
        {label}
        {required && <span className="text-red-500 ml-1" aria-label="required">*</span>}
      </span>
      {children}
      {error && <span className="block text-xs text-red-700 mt-1">{error}</span>}
    </label>
  );
}

function inputClass(error: string | null | undefined): string {
  const base =
    'w-full px-3.5 py-2.5 bg-white border rounded-lg text-sm text-navy placeholder:text-muted/60 focus:outline-none focus:ring-2 focus:ring-gold/40 transition-colors';
  const border = error ? 'border-red-300 focus:border-red-400' : 'border-border focus:border-gold/60';
  return `${base} ${border}`;
}

function optional(s: string): string | undefined {
  const t = s.trim();
  return t.length > 0 ? t : undefined;
}

function numeric(s: string): number | undefined {
  const t = s.trim();
  if (t.length === 0) return undefined;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

// ── Success state ──────────────────────────────────────────────────────────

function SuccessState({ legalName }: { legalName: string }) {
  return (
    <div className="min-h-screen bg-[#fafaf6]">
      <Header />
      <main className="max-w-2xl mx-auto px-6 sm:px-8 py-20 md:py-28 text-center">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-gold/15 text-gold-dark mb-6">
          <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <p className="text-xs uppercase tracking-[0.18em] text-gold-dark font-semibold mb-3">Received</p>
        <h1 className="font-[family-name:var(--font-dm-serif)] text-4xl md:text-5xl text-navy leading-tight mb-5">
          Thanks{legalName ? `, ${legalName}` : ''}.
        </h1>
        <p className="text-lg text-muted leading-relaxed mb-2">
          Our team will review your application and follow up within one business day.
        </p>
        <p className="text-sm text-muted mb-10">
          You&rsquo;ll get an email from <span className="text-navy font-medium">hello@wellsonyx.com</span> with contract
          terms, an onboarding timeline, and next steps.
        </p>
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm font-medium text-navy hover:text-gold-dark transition-colors"
        >
          ← Back to vantaum.com
        </Link>
      </main>
      <Footer />
    </div>
  );
}
