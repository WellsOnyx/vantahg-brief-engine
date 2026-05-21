import type { ReactNode } from 'react';

/**
 * SectionCard — the canonical content card for everything inside the
 * main body of a page template.
 *
 * Wraps `card p-5 md:p-6` with consistent eyebrow + heading + right-hint
 * affordances. Replaces the ad-hoc `<section className="bg-surface
 * rounded-xl border border-border shadow-sm p-5">` blocks proliferating
 * across the app.
 *
 * Pattern:
 *   <SectionCard
 *     eyebrow="Patient"
 *     title="Recent cases"
 *     hint={<Link href="/cases">View all →</Link>}
 *   >
 *     ...content...
 *   </SectionCard>
 *
 * - eyebrow renders with the gold-dot brand mark
 * - title is sans semibold (NOT serif — serif is reserved for hero only)
 * - hint sits right-aligned next to the title
 */

export interface SectionCardProps {
  /** Small uppercase label above the title with a gold dot leading. */
  eyebrow?: string;
  /** Section heading. Sans-serif. Pass plain string for default styling. */
  title?: ReactNode;
  /** Right-aligned chip: usually a link ("View all →") or count. */
  hint?: ReactNode;
  /** Override default padding (default `p-5 md:p-6`). */
  padding?: string;
  /** Use gold accent border (call attention to one card per screen). */
  accent?: boolean;
  className?: string;
  children: ReactNode;
}

export function SectionCard({
  eyebrow,
  title,
  hint,
  padding = 'p-5 md:p-6',
  accent = false,
  className = '',
  children,
}: SectionCardProps) {
  const hasHeader = eyebrow || title || hint;
  return (
    <section
      className={`card ${accent ? 'border-gold/30' : ''} ${padding} ${className}`}
    >
      {hasHeader && (
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="min-w-0">
            {eyebrow && (
              <p className="text-[11px] uppercase tracking-[0.16em] text-muted font-semibold flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-gold" aria-hidden />
                {eyebrow}
              </p>
            )}
            {title && (
              <h2 className="text-base font-semibold tracking-tight text-navy mt-1.5">
                {title}
              </h2>
            )}
          </div>
          {hint && <div className="flex-shrink-0 text-xs text-muted">{hint}</div>}
        </div>
      )}
      {children}
    </section>
  );
}
