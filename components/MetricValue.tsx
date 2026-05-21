import type { ReactNode } from 'react';

/**
 * MetricValue — the "zero is not broken" doctrine.
 *
 * Renders `—` in muted gray when the value is zero, null, or undefined.
 * Renders the formatted number in navy serif otherwise.
 *
 * The screenshot Jonah called "2009" rendered four stat cards as
 * `$0.00 / $0.00 / 0 / 0` at full weight. That reads "the app is broken."
 * The fix: zero ≠ transaction. Empty state ≠ failure. Render an em-dash.
 *
 * Use this inside StatCard or anywhere a stat value lives.
 *
 * Examples:
 *   <MetricValue value={profile.case_counts.active} />
 *   <MetricValue value={invoiceTotal} format="currency" />
 *   <MetricValue value={pct} format="percent" />
 *   <MetricValue value={null} />  // → "—"
 */

export type MetricFormat = 'number' | 'currency' | 'percent';

export interface MetricValueProps {
  value: number | string | null | undefined;
  format?: MetricFormat;
  /**
   * Override the "empty" placeholder. Default is an em-dash.
   * Use sparingly — em-dash is the brand standard.
   */
  emptyPlaceholder?: ReactNode;
  /**
   * If true, force-render the value even when it's zero. Useful when
   * zero is meaningful (e.g. "0 overdue" on an SLA card).
   */
  showZero?: boolean;
  className?: string;
}

export function MetricValue({
  value,
  format = 'number',
  emptyPlaceholder,
  showZero = false,
  className = '',
}: MetricValueProps) {
  const isEmpty =
    value === null ||
    value === undefined ||
    (!showZero && (value === 0 || value === '0' || value === '0.00' || value === '$0.00'));

  if (isEmpty) {
    return (
      <span
        className={`font-[family-name:var(--font-display)] text-muted/60 ${className}`}
        aria-label="No data yet"
      >
        {emptyPlaceholder ?? '—'}
      </span>
    );
  }

  const formatted = formatMetric(value, format);
  return (
    <span className={`font-[family-name:var(--font-display)] text-navy ${className}`}>
      {formatted}
    </span>
  );
}

function formatMetric(value: number | string, format: MetricFormat): string {
  const n = typeof value === 'string' ? Number(value) : value;
  if (!Number.isFinite(n)) return String(value);

  switch (format) {
    case 'currency':
      return n.toLocaleString(undefined, {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: n % 1 === 0 ? 0 : 2,
        maximumFractionDigits: 2,
      });
    case 'percent':
      return `${Math.round(n)}%`;
    case 'number':
    default:
      return n.toLocaleString();
  }
}
