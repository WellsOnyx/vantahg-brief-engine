'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { HeaderAuth } from '@/components/HeaderAuth';
import { TenantScopeProvider } from '@/lib/tenant-scope';
import { TenantScopeSelector } from '@/components/TenantScopeSelector';

/**
 * AppShell — the chrome around every authenticated VantaUM surface.
 *
 * Layout: slim navy top bar (56px) + light surface sidebar (240px) + main.
 *
 * The top bar holds the wordmark, an active-page breadcrumb, a ⌘K stub,
 * and the user/avatar menu. The sidebar holds the tenant scope selector,
 * role-aware primary nav, and a quiet "A Wells Onyx Service" brand mark
 * at the bottom. The old BridgeBar / separate header / 14-link wrapping
 * nav are gone — folded into either the top bar or the avatar menu.
 *
 * Backward compatibility: callers passing the legacy `navLinks` flat array
 * still get a working sidebar with those links as the primary group. New
 * callers should pass `primaryNav` (groups + items) and `secondaryNav`
 * (items rendered in the avatar menu).
 */

export interface NavItem {
  href: string;
  label: string;
  /** Optional inline SVG path d-attribute for a leading 14px icon. */
  iconPath?: string;
  /** Optional badge text (e.g. count of pending items). */
  badge?: string | number;
}

export interface NavGroup {
  /** Optional eyebrow label rendered above the group. */
  label?: string;
  items: NavItem[];
}

export interface AppShellProps {
  /** Legacy flat-list nav. Rendered as a single unlabeled group if `primaryNav` is not provided. */
  navLinks?: NavItem[];
  /** Role-aware primary nav (groups). Replaces `navLinks` when provided. */
  primaryNav?: NavGroup[];
  /** Items demoted out of the sidebar — render in the avatar/profile menu. */
  secondaryNav?: NavItem[];
  /** Short label shown under the wordmark in the sidebar header. e.g. "TPA Portal" / "Concierge" / "Admin". */
  roleSurface?: string;
  children: React.ReactNode;
}

// Pages that render WITHOUT the AppShell chrome (sidebar + top bar).
// Exact matches stay in CHROMELESS_PATHS; everything else is a prefix
// matcher so we don't have to keep adding sub-paths.
const CHROMELESS_PATHS = new Set(['/']);
const CHROMELESS_PREFIXES = [
  '/demo',
  '/site',
  '/signup-tpa',
  '/login',
  '/signup',
  '/sign-up',
  '/auth',
  '/magic-link',
  '/forgot-password',
];

export function AppShell({
  navLinks,
  primaryNav,
  secondaryNav,
  roleSurface,
  children,
}: AppShellProps) {
  const pathname = usePathname();
  const isChromeless =
    CHROMELESS_PATHS.has(pathname) ||
    CHROMELESS_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + '/'));

  if (isChromeless) {
    return <>{children}</>;
  }

  const groups: NavGroup[] =
    primaryNav && primaryNav.length > 0
      ? primaryNav
      : navLinks && navLinks.length > 0
        ? [{ items: navLinks }]
        : [];

  return (
    <TenantScopeProvider>
      <a href="#main-content" className="sr-only-focusable">
        Skip to main content
      </a>
      <div className="min-h-screen bg-background flex">
        <Sidebar groups={groups} roleSurface={roleSurface} pathname={pathname} />

        <div className="flex-1 flex flex-col min-w-0">
          <TopBar pathname={pathname} secondaryNav={secondaryNav} />
          <main id="main-content" className="flex-1 animate-fade-in" tabIndex={-1}>{children}</main>
        </div>
      </div>
    </TenantScopeProvider>
  );
}

/* ─── Sidebar ────────────────────────────────────────────────────────── */

function Sidebar({
  groups,
  roleSurface,
  pathname,
}: {
  groups: NavGroup[];
  roleSurface?: string;
  pathname: string;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);

  // Close mobile drawer on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  return (
    <>
      {/* Mobile toggle (top-left of viewport, only visible <md) */}
      <button
        onClick={() => setMobileOpen(true)}
        className="fixed top-3 left-3 z-40 md:hidden p-2 rounded-md bg-navy text-white shadow-lg shadow-navy-dark/30"
        aria-label="Open navigation"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <line x1="3" y1="6" x2="21" y2="6" />
          <line x1="3" y1="12" x2="21" y2="12" />
          <line x1="3" y1="18" x2="21" y2="18" />
        </svg>
      </button>

      {/* Backdrop */}
      {mobileOpen && (
        <button
          aria-label="Close navigation"
          onClick={() => setMobileOpen(false)}
          className="fixed inset-0 z-40 bg-navy/40 backdrop-blur-sm md:hidden"
        />
      )}

      {/* Sidebar (desktop fixed, mobile sliding drawer) */}
      <aside
        className={`
          fixed inset-y-0 left-0 z-50 w-[240px] bg-surface border-r border-border flex flex-col
          transform transition-transform duration-200 ease-out
          md:static md:translate-x-0 md:w-[240px] md:flex-shrink-0
          ${mobileOpen ? 'translate-x-0 animate-sidebar-slide' : '-translate-x-full md:translate-x-0'}
        `}
      >
        {/* Header: wordmark + role badge */}
        <div className="h-14 px-5 flex items-center gap-3 border-b border-border">
          <Link href="/" className="flex items-center gap-2.5 group">
            <span className="w-8 h-8 rounded-md bg-gold-gradient flex items-center justify-center font-bold text-navy text-sm shadow-sm transition-transform duration-200 group-hover:scale-105">
              V
            </span>
            <span className="font-[family-name:var(--font-display)] text-lg tracking-tight text-navy leading-none">
              Vanta<span className="text-gold-dark">UM</span>
            </span>
          </Link>
        </div>

        {/* Tenant scope (admin only — component self-hides otherwise) */}
        <div className="px-3 pt-3 pb-2">
          <TenantScopeSelector />
        </div>

        {roleSurface && (
          <div className="px-5 pb-3">
            <p className="text-[10px] uppercase tracking-[0.14em] text-muted font-semibold flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-gold" />
              {roleSurface}
            </p>
          </div>
        )}

        {/* Primary nav */}
        <nav className="flex-1 overflow-y-auto custom-scrollbar px-3 py-2 space-y-5">
          {groups.length === 0 ? (
            <p className="px-3 text-xs text-muted">No nav configured.</p>
          ) : (
            groups.map((group, gi) => (
              <div key={gi} className="space-y-0.5">
                {group.label && (
                  <p className="px-3 pb-1.5 text-[10px] uppercase tracking-[0.14em] text-muted font-semibold">
                    {group.label}
                  </p>
                )}
                {group.items.map((item) => (
                  <SidebarLink key={item.href} item={item} active={isActive(pathname, item.href)} />
                ))}
              </div>
            ))
          )}
        </nav>

        {/* Footer: Wells Onyx mark */}
        <div className="px-5 py-4 border-t border-border">
          <a
            href="https://www.wellsonyx.com"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 text-[11px] text-muted hover:text-navy transition-colors group"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-gold" />
            <span>
              A{' '}
              <span className="font-[family-name:var(--font-display)] text-navy group-hover:text-gold-dark transition-colors">
                Wells Onyx
              </span>{' '}
              service
            </span>
          </a>
        </div>
      </aside>
    </>
  );
}

function SidebarLink({ item, active }: { item: NavItem; active: boolean }) {
  return (
    <Link
      href={item.href}
      className={`
        relative flex items-center gap-2.5 pl-4 pr-3 py-2 rounded-md text-sm font-medium transition-all
        ${active
          ? 'bg-gold/8 text-navy'
          : 'text-muted hover:text-navy hover:bg-navy/[0.03]'}
      `}
    >
      {active && (
        <span className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r bg-gold" aria-hidden />
      )}
      {item.iconPath && (
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="flex-shrink-0"
          aria-hidden
        >
          <path d={item.iconPath} />
        </svg>
      )}
      <span className="flex-1 truncate">{item.label}</span>
      {item.badge !== undefined && (
        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${active ? 'bg-gold text-navy' : 'bg-navy/10 text-navy'}`}>
          {item.badge}
        </span>
      )}
    </Link>
  );
}

function isActive(pathname: string, href: string): boolean {
  if (href === '/') return pathname === '/';
  return pathname === href || pathname.startsWith(`${href}/`);
}

/* ─── Top bar ────────────────────────────────────────────────────────── */

function TopBar({
  pathname,
  secondaryNav,
}: {
  pathname: string;
  secondaryNav?: NavItem[];
}) {
  const crumbs = buildBreadcrumbs(pathname);

  return (
    <header className="h-14 bg-navy text-white border-b border-white/10 flex-shrink-0 flex items-center pl-14 md:pl-6 pr-3 sm:pr-6 gap-4 no-print">
      {/* Breadcrumb */}
      <nav aria-label="Breadcrumb" className="flex-1 min-w-0 hidden sm:flex items-center gap-1.5 text-sm text-white/60 overflow-hidden">
        {crumbs.map((c, i) => (
          <span key={i} className="flex items-center gap-1.5 min-w-0">
            {i > 0 && (
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="flex-shrink-0 text-white/30">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            )}
            {c.href && i < crumbs.length - 1 ? (
              <Link href={c.href} className="hover:text-white transition-colors truncate">
                {c.label}
              </Link>
            ) : (
              <span className={`truncate ${i === crumbs.length - 1 ? 'text-white' : ''}`}>{c.label}</span>
            )}
          </span>
        ))}
      </nav>

      {/* Right side: command palette stub + auth */}
      <div className="flex items-center gap-2 flex-shrink-0">
        <button
          type="button"
          disabled
          title="Coming soon"
          className="hidden md:inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs text-white/50 border border-white/15 cursor-not-allowed"
        >
          <span>Search</span>
          <kbd className="text-[10px] px-1 py-0.5 rounded bg-white/10 border border-white/15 font-mono">⌘K</kbd>
        </button>
        <HeaderAuth secondaryNav={secondaryNav} />
      </div>
    </header>
  );
}

interface Crumb {
  label: string;
  href?: string;
}

const PATH_LABELS: Record<string, string> = {
  portal: 'Portal',
  tpa: 'TPA',
  provider: 'Provider',
  concierge: 'Concierge',
  cases: 'Cases',
  admin: 'Admin',
  signups: 'TPA Signups',
  invoices: 'Invoices',
  billing: 'Billing',
  usage: 'Usage',
  setup: 'Setup',
  contracts: 'Contracts',
  attorney: 'Attorney',
  review: 'Review',
  determine: 'Determine',
  determination: 'Determination',
  brief: 'Brief',
  intake: 'Intake',
  efax: 'eFax',
  queue: 'Queue',
  quality: 'Quality',
  ops: 'Operations',
  'mission-control': 'Mission Control',
  'office-ceo': 'Office of the CEO',
  builders: 'Builders',
  'delivery-lead': 'Delivery Lead',
  'command-center': 'Command Center',
  dashboard: 'Dashboard',
  team: 'Team',
  pods: 'Pods',
  clients: 'Clients',
  practices: 'Practices',
  staff: 'Staff',
  reviewers: 'Reviewers',
  analytics: 'Analytics',
  compliance: 'Compliance',
  batch: 'Batch',
  upload: 'Upload',
  welcome: 'Welcome',
  signup: 'Signup',
  'interactive-demo': 'Live Demo',
  'demo-tour': 'Demo Tour',
  login: 'Sign In',
  new: 'New',
  submit: 'Submit',
  invite: 'Invite',
  assign: 'Assign',
};

function buildBreadcrumbs(pathname: string): Crumb[] {
  const segments = pathname.split('/').filter(Boolean);
  if (segments.length === 0) return [{ label: 'Home' }];
  const crumbs: Crumb[] = [];
  let acc = '';
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    acc += `/${seg}`;
    const label =
      PATH_LABELS[seg] ??
      (/^[0-9a-f-]{8,}$/.test(seg) ? `…${seg.slice(-4)}` : seg.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()));
    crumbs.push({ label, href: i < segments.length - 1 ? acc : undefined });
  }
  return crumbs;
}
