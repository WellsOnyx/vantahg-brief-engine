'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';

/**
 * Four canonical page templates. Every authenticated VantaUM page should
 * eventually pick exactly one.
 *
 *   <PageDashboard>  — TPA home, concierge home, mission control.
 *                      Hero band + 4-up stat strip + 8/4 body + help footer.
 *   <PageFocused>    — Case detail, brief review, determination form.
 *                      Breadcrumb + serif identifier + 8/4 sticky context rail.
 *   <PageList>       — Cases, signups, invoices, queues.
 *                      Header + filter bar + table/list, optional stat strip.
 *   <PageSubmit>     — Submit auth, signup, new case.
 *                      Centered single column, stepper, footer action bar.
 *
 * The templates do NOT impose color, type, or content — they impose layout.
 */

/* ─── Shared primitives ─────────────────────────────────────────────── */

export function PageHero({
  eyebrow,
  title,
  subtitle,
  actions,
  children,
}: {
  /** Tiny gold-tracked label above the title. */
  eyebrow?: string;
  /** Serif headline. ONE per screen. */
  title: ReactNode;
  /** Plain prose under the title. */
  subtitle?: ReactNode;
  /** Right-aligned action area (CTAs, refresh buttons). */
  actions?: ReactNode;
  /** Optional extra content rendered below the title block, above the body. */
  children?: ReactNode;
}) {
  return (
    <div className="bg-hero-subtle text-white">
      <div className="max-w-7xl mx-auto px-6 lg:px-8 py-12 md:py-14">
        <div className="flex flex-wrap items-end justify-between gap-4 animate-fade-in">
          <div className="min-w-0">
            {eyebrow && (
              <p className="text-[11px] uppercase tracking-[0.18em] text-gold font-semibold">
                {eyebrow}
              </p>
            )}
            <h1 className="font-[family-name:var(--font-display)] text-4xl md:text-5xl text-white mt-2 leading-tight">
              {title}
            </h1>
            <div className="mt-3 h-[3px] w-16 bg-gold-gradient rounded-full" />
            {subtitle && (
              <p className="text-sm text-white/70 mt-4 max-w-2xl">{subtitle}</p>
            )}
          </div>
          {actions && <div className="flex items-center gap-2 flex-shrink-0">{actions}</div>}
        </div>
        {children && <div className="mt-6">{children}</div>}
      </div>
    </div>
  );
}

export function PageEyebrow({ children }: { children: ReactNode }) {
  return (
    <p className="text-[11px] uppercase tracking-[0.16em] text-muted font-semibold flex items-center gap-1.5">
      <span className="w-1.5 h-1.5 rounded-full bg-gold" />
      {children}
    </p>
  );
}

export function PageSectionHeading({
  children,
  hint,
}: {
  children: ReactNode;
  hint?: ReactNode;
}) {
  return (
    <div className="flex items-end justify-between gap-3 mb-5">
      <h2 className="text-xl font-semibold tracking-tight text-navy">{children}</h2>
      {hint && <div className="text-xs text-muted">{hint}</div>}
    </div>
  );
}

export function BackLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="text-xs text-white/60 hover:text-gold transition inline-flex items-center gap-1"
    >
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <polyline points="15 18 9 12 15 6" />
      </svg>
      {label}
    </Link>
  );
}

/* ─── PageDashboard ──────────────────────────────────────────────────── */

export function PageDashboard({ hero, children }: { hero: ReactNode; children: ReactNode }) {
  return (
    <div className="min-h-[calc(100vh-3.5rem)] bg-background">
      {hero}
      <div className="max-w-6xl mx-auto px-6 lg:px-8 -mt-10 pb-16 space-y-12">
        {children}
      </div>
    </div>
  );
}

PageDashboard.Stats = function PageDashboardStats({ children }: { children: ReactNode }) {
  return (
    <section className="grid grid-cols-2 md:grid-cols-4 gap-3 stagger-children">
      {children}
    </section>
  );
};

PageDashboard.Body = function PageDashboardBody({
  main,
  aside,
}: {
  main: ReactNode;
  aside?: ReactNode;
}) {
  if (!aside) return <section>{main}</section>;
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
      <section className="lg:col-span-2">{main}</section>
      <aside className="space-y-4 lg:sticky lg:top-6">{aside}</aside>
    </div>
  );
};

PageDashboard.Help = function PageDashboardHelp({ children }: { children: ReactNode }) {
  return <section className="card p-6 md:p-8 bg-navy/[0.02] border-navy/10">{children}</section>;
};

/* ─── PageFocused ────────────────────────────────────────────────────── */

export function PageFocused({ hero, children }: { hero: ReactNode; children: ReactNode }) {
  return (
    <div className="min-h-[calc(100vh-3.5rem)] bg-background">
      {hero}
      <div className="max-w-7xl mx-auto px-6 lg:px-8 -mt-8 pb-16">{children}</div>
    </div>
  );
}

PageFocused.Body = function PageFocusedBody({
  main,
  aside,
}: {
  main: ReactNode;
  aside?: ReactNode;
}) {
  if (!aside) return <section>{main}</section>;
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
      <section className="lg:col-span-2 space-y-6">{main}</section>
      <aside className="space-y-4 lg:sticky lg:top-20">{aside}</aside>
    </div>
  );
};

/* ─── PageList ───────────────────────────────────────────────────────── */

export function PageList({ hero, children }: { hero: ReactNode; children: ReactNode }) {
  return (
    <div className="min-h-[calc(100vh-3.5rem)] bg-background">
      {hero}
      <div className="max-w-7xl mx-auto px-6 lg:px-8 -mt-10 pb-16 space-y-6">{children}</div>
    </div>
  );
}

PageList.Stats = function PageListStats({ children }: { children: ReactNode }) {
  return (
    <section className="grid grid-cols-1 sm:grid-cols-3 gap-3 stagger-children">{children}</section>
  );
};

PageList.Filters = function PageListFilters({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap items-center gap-2">{children}</div>;
};

PageList.Body = function PageListBody({ children }: { children: ReactNode }) {
  return <section>{children}</section>;
};

/* ─── PageSubmit ─────────────────────────────────────────────────────── */

export function PageSubmit({
  hero,
  aside,
  children,
}: {
  hero: ReactNode;
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="min-h-[calc(100vh-3.5rem)] bg-background">
      {hero}
      <div className="max-w-5xl mx-auto px-6 lg:px-8 -mt-8 pb-16">
        {aside ? (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
            <section className="lg:col-span-2 card p-6 md:p-8 animate-slide-up space-y-6">{children}</section>
            <aside className="card p-5 md:p-6 lg:sticky lg:top-20 space-y-5">{aside}</aside>
          </div>
        ) : (
          <section className="card p-6 md:p-8 animate-slide-up max-w-3xl mx-auto space-y-6">{children}</section>
        )}
      </div>
    </div>
  );
}

PageSubmit.Body = function PageSubmitBody({ children }: { children: ReactNode }) {
  return <>{children}</>;
};

/* ─── Generic StatCard ───────────────────────────────────────────────── */

export function StatCard({
  label,
  value,
  hint,
  accent = false,
}: {
  label: string;
  value: string | number;
  hint?: string;
  accent?: boolean;
}) {
  return (
    <div className={`card p-4 ${accent ? 'border-gold/30' : ''}`}>
      <p className="text-[10px] uppercase tracking-[0.12em] text-muted font-semibold">{label}</p>
      <p className={`font-[family-name:var(--font-display)] text-3xl mt-1 ${accent ? 'text-gold-dark' : 'text-navy'}`}>
        {value}
      </p>
      {hint && <p className="text-[11px] text-muted mt-1">{hint}</p>}
    </div>
  );
}
