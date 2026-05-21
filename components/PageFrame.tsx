import type { ReactNode } from 'react';

/**
 * PageFrame — the shared "container wrapper" used by pages that haven't
 * been migrated to PageHero / PageDashboard yet.
 *
 * Replaces the half-dozen page-local `function Frame()` copies across the
 * app. Future migration: every PageFrame caller should move to one of the
 * canonical PageLayouts templates (PageHero + PageDashboard / PageList /
 * PageFocused / PageSubmit).
 *
 * Until then, this gives a single place to:
 *   - Change the responsive container width
 *   - Apply the background
 *   - Track which pages are still on the legacy frame (grep for `<PageFrame`
 *     to count remaining migration debt)
 */

const WIDTHS: Record<string, string> = {
  sm: 'max-w-3xl',
  md: 'max-w-4xl',
  lg: 'max-w-6xl',
  xl: 'max-w-7xl',
};

export function PageFrame({
  children,
  width = 'xl',
  className = '',
}: {
  children: ReactNode;
  /** Container max-width. Default xl (7xl, the dashboard breakpoint). */
  width?: keyof typeof WIDTHS;
  className?: string;
}) {
  return (
    <div className="py-10 md:py-16 bg-background min-h-screen">
      <div className={`${WIDTHS[width]} mx-auto px-4 sm:px-6 lg:px-8 ${className}`}>
        {children}
      </div>
    </div>
  );
}
