import type { ReactNode } from 'react';
import Link from 'next/link';

/**
 * EmptyState — the brand moment when there's nothing to show.
 *
 * Doctrine (per design spec):
 *   - 64px gold serif "V" at 8% opacity. Brand mark, not decoration.
 *   - Forward-looking serif headline (NOT apologetic).
 *       "No invoices yet" → "Your first invoice arrives on the 1st."
 *   - Sans subtitle: one sentence of what to expect or do next.
 *   - One gold-outline CTA. If no action exists, omit the button — never
 *     manufacture a CTA.
 *   - No red, no error code, no "if this seems wrong contact support."
 *
 * Use everywhere you'd otherwise render "$0.00" stat cards or
 * "No records yet" sad-gray-box patterns.
 */

export interface EmptyStateAction {
  label: string;
  href?: string;
  onClick?: () => void;
}

export interface EmptyStateProps {
  title: string;
  body?: ReactNode;
  action?: EmptyStateAction;
  /**
   * Optional custom icon (24×24 SVG content). Default is the brand
   * serif "V" mark at 8% opacity.
   */
  icon?: ReactNode;
  /**
   * tone='gold' = inviting action available (gold-tinted card).
   * tone='neutral' = informational, no action (default).
   */
  tone?: 'neutral' | 'gold';
  className?: string;
}

export function EmptyState({
  title,
  body,
  action,
  icon,
  tone = 'neutral',
  className = '',
}: EmptyStateProps) {
  const isGold = tone === 'gold';

  return (
    <div
      className={`card ${isGold ? 'border-gold/30 bg-gold/[0.03]' : ''} p-10 md:p-12 text-center ${className}`}
    >
      <div className="flex justify-center mb-5" aria-hidden>
        {icon ?? <BrandVMark />}
      </div>

      <h3 className="font-[family-name:var(--font-display)] text-xl md:text-2xl text-navy/85">
        {title}
      </h3>

      {body && (
        <p className="text-sm text-muted mt-2 max-w-md mx-auto leading-relaxed">{body}</p>
      )}

      {action && (
        <div className="mt-6">
          {action.href ? (
            <Link
              href={action.href}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg border border-gold/40 text-navy text-sm font-semibold hover:border-gold hover:bg-gold/5 transition shadow-sm"
            >
              {action.label}
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <line x1="5" y1="12" x2="19" y2="12" />
                <polyline points="12 5 19 12 12 19" />
              </svg>
            </Link>
          ) : (
            <button
              type="button"
              onClick={action.onClick}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg border border-gold/40 text-navy text-sm font-semibold hover:border-gold hover:bg-gold/5 transition shadow-sm"
            >
              {action.label}
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <line x1="5" y1="12" x2="19" y2="12" />
                <polyline points="12 5 19 12 12 19" />
              </svg>
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * The serif "V" brand mark at 8% opacity, ~64px. Wells Onyx's wax seal
 * imprint on empty surfaces. No external SVG — pure typography.
 */
function BrandVMark() {
  return (
    <span
      className="font-[family-name:var(--font-display)] text-[64px] leading-none text-gold-dark"
      style={{ opacity: 0.08 }}
    >
      V
    </span>
  );
}
