'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';

export interface AuthShellProps {
  /** Gold uppercase eyebrow. e.g. "Sign in" / "Request access" / "Sent". */
  eyebrow?: string;
  /** Serif headline on navy. ONE per screen. */
  title: ReactNode;
  /** Optional sans body under the gold rule. */
  subtitle?: ReactNode;
  /** Footer slot rendered under the form column. Micro-row links. */
  footer?: ReactNode;
  /** The form / right-rail body. */
  children: ReactNode;
}

export function AuthShell({
  eyebrow,
  title,
  subtitle,
  footer,
  children,
}: AuthShellProps) {
  return (
    <div className="min-h-screen grid lg:grid-cols-[60fr_40fr] bg-background">
      {/* ── Left rail — navy hero with watermark V ─────────────────── */}
      <aside className="relative bg-navy overflow-hidden flex items-center px-8 lg:px-24 py-16 min-h-[40vh] lg:min-h-screen">
        <span
          aria-hidden
          className="absolute -bottom-16 -left-8 font-[family-name:var(--font-display)] leading-none text-gold select-none pointer-events-none -rotate-[4deg]"
          style={{
            opacity: 0.06,
            fontSize: 'clamp(20rem, 38vw, 34rem)',
          }}
        >
          V
        </span>

        <Link
          href="/"
          className="absolute top-8 left-8 font-[family-name:var(--font-display)] text-lg text-white tracking-tight z-10 hover:opacity-90"
        >
          VantaUM
        </Link>

        <div className="relative z-10 max-w-md animate-fade-in">
          {eyebrow && (
            <p className="text-[11px] uppercase tracking-[0.22em] text-gold font-semibold">
              {eyebrow}
            </p>
          )}
          <h1 className="font-[family-name:var(--font-display)] text-4xl lg:text-5xl text-white leading-[1.15] mt-3">
            {title}
          </h1>
          <div className="mt-6 h-[3px] w-12 bg-gold-gradient rounded-full" />
          {subtitle && (
            <p className="text-sm text-white/65 mt-6 max-w-md">{subtitle}</p>
          )}
        </div>
      </aside>

      {/* ── Right rail — cream form column ─────────────────────────── */}
      <section className="relative flex items-center justify-center px-6 py-16 lg:py-24">
        <a
          href="https://www.wellsonyx.com/firstlevelreview"
          className="absolute top-8 right-8 text-xs text-muted hover:text-navy underline decoration-gold/40 decoration-dotted underline-offset-4 z-10"
        >
          Need access? Contact your concierge
        </a>

        <div className="w-full max-w-sm space-y-8 animate-fade-in">
          {children}
          {footer && (
            <div className="pt-8 mt-12 border-t border-border text-xs text-muted text-center space-y-2">
              {footer}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

/**
 * AuthField — underline-only input matching the spec.
 * Use inside <AuthShell> for visual consistency.
 */
export function AuthField({
  id,
  label,
  type = 'text',
  value,
  onChange,
  placeholder,
  required,
  autoComplete,
  minLength,
}: {
  id: string;
  label: string;
  type?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  required?: boolean;
  autoComplete?: string;
  minLength?: number;
}) {
  return (
    <div>
      <label
        htmlFor={id}
        className="block text-[11px] uppercase tracking-[0.14em] text-muted font-semibold mb-2"
      >
        {label}
      </label>
      <input
        id={id}
        type={type}
        required={required}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        minLength={minLength}
        className="w-full bg-transparent border-0 border-b border-border px-0 py-3 text-base text-foreground placeholder:text-muted/50 focus:border-gold focus:ring-0 focus:outline-none transition-colors"
        style={{ borderRadius: 0, boxShadow: 'none' }}
      />
    </div>
  );
}

/**
 * AuthSelect — underline-only select matching AuthField.
 */
export function AuthSelect({
  id,
  label,
  value,
  onChange,
  options,
  required,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  required?: boolean;
}) {
  return (
    <div>
      <label
        htmlFor={id}
        className="block text-[11px] uppercase tracking-[0.14em] text-muted font-semibold mb-2"
      >
        {label}
      </label>
      <select
        id={id}
        value={value}
        required={required}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-transparent border-0 border-b border-border px-0 py-3 text-base text-foreground focus:border-gold focus:ring-0 focus:outline-none transition-colors"
        style={{ borderRadius: 0, boxShadow: 'none' }}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

/**
 * AuthCTA — primary button. Navy on cream, uppercase tracked.
 */
export function AuthCTA({
  type = 'button',
  onClick,
  disabled,
  children,
}: {
  type?: 'button' | 'submit';
  onClick?: () => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className="w-full bg-navy text-white py-3.5 rounded-md text-xs font-semibold uppercase tracking-[0.14em] hover:bg-navy-light transition shadow-[0_8px_24px_-12px_rgba(12,35,64,0.45)] disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {children}
    </button>
  );
}

/**
 * AuthError — gold-bar marker line. Never red, never alarming.
 * The vertical bar IS the marker; no icon.
 */
export function AuthError({ children }: { children: ReactNode }) {
  return (
    <p className="text-xs text-navy font-medium flex items-start gap-2">
      <span className="w-[3px] h-4 bg-gold inline-block flex-shrink-0 mt-[2px]" />
      <span>{children}</span>
    </p>
  );
}
