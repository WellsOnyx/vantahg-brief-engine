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

  // Hooks must run on every render (before any early return) to keep hook
  // order stable when navigating between chrome and chromeless routes.
  const [demo, setDemo] = useState(false);
  const [activeMicro, setActiveMicro] = useState<string | null>(null);

  useEffect(() => {
    const hasDemoSignal = typeof document !== 'undefined' && (
      !!document.querySelector('[class*="DEMO MODE"], [class*="demo mode"], [class*="synthetic"]') ||
      window.location.search.includes('demo') ||
      pathname.includes('/demo')
    );
    setDemo(hasDemoSignal);
  }, [pathname]);

  const isChromeless =
    CHROMELESS_PATHS.has(pathname) ||
    CHROMELESS_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + '/'));

  function launchMicroDemo(label: string) {
    setActiveMicro(label);
  }

  function closeMicro() {
    setActiveMicro(null);
  }

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
        <Sidebar 
          groups={groups} 
          roleSurface={roleSurface} 
          pathname={pathname} 
          demo={demo}
          activeMicro={activeMicro}
          onLaunchMicro={launchMicroDemo}
          onCloseMicro={closeMicro}
        />

        <div className="flex-1 flex flex-col min-w-0">
          <TopBar pathname={pathname} secondaryNav={secondaryNav} />
          <main id="main-content" className="flex-1 animate-fade-in overflow-auto" tabIndex={-1}>
            {demo && activeMicro ? <MicroMain label={activeMicro} /> : children}
          </main>
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
  demo = false,
  activeMicro = null,
  onLaunchMicro,
  onCloseMicro,
}: {
  groups: NavGroup[];
  roleSurface?: string;
  pathname: string;
  demo?: boolean;
  activeMicro?: string | null;
  onLaunchMicro?: (label: string) => void;
  onCloseMicro?: () => void;
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
                  demo ? (
                    <button
                      key={item.href}
                      onClick={() => onLaunchMicro && onLaunchMicro(item.label)}
                      className="w-full text-left relative flex items-center gap-2.5 pl-4 pr-3 py-2 rounded-md text-sm font-medium transition-all text-muted hover:text-navy hover:bg-navy/[0.03]"
                    >
                      {item.iconPath && (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0" aria-hidden>
                          <path d={item.iconPath} />
                        </svg>
                      )}
                      <span className="flex-1 truncate">{item.label}</span>
                      <span className="text-[9px] px-1 py-0.5 rounded bg-gold/20 text-gold">demo</span>
                    </button>
                  ) : (
                    <SidebarLink key={item.href} item={item} active={isActive(pathname, item.href)} />
                  )
                ))}
              </div>
            ))
          )}
        </nav>

        {/* Micro demo panel for demo flows */}
        {demo && activeMicro && (
          <div className="mx-3 mb-3 p-3 rounded-xl border border-gold/30 bg-gold/5 text-xs">
            <div className="flex justify-between items-center mb-2">
              <span className="font-semibold text-gold-dark">Micro Demo: {activeMicro}</span>
              <button onClick={onCloseMicro} className="text-gold/60 hover:text-gold">×</button>
            </div>
            <MicroSidebar label={activeMicro} />
          </div>
        )}

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

/* ─── Demo micro-experiences ─────────────────────────────────────────── */
// Interactive synthetic demos. Each button mutates local synthetic state and
// surfaces in-UI feedback (MicroToast) instead of a native alert() dialog.

const microWrap = 'p-6 text-white bg-[#0a0f1a] min-h-[calc(100vh-56px)]';
const microCard = 'bg-[#111827] border border-white/10 rounded-xl p-4 mb-4';
const microBtn =
  'px-4 py-2 bg-gold text-navy rounded text-sm font-medium hover:opacity-90 active:scale-[0.99] transition';

const SAMPLE_PATIENTS = ['Dana Whitfield', 'Luis Moreno', 'Aisha Bello', 'Grace Kim', 'Tom Nguyen', 'Priya Patel'];
const SAMPLE_PROCEDURES = ['MRI lumbar 72148', 'Knee arthroscopy 29881', 'CPAP setup E0601', 'Infliximab J1745', 'CT abdomen 74177'];
const STAGES = ['Intake', 'LPN Review', 'Brief Ready', 'Determined'] as const;

function useMicroToast() {
  const [toast, setToast] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  function showToast(message: string) {
    setToast(message);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(null), 3200);
  }
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  return { toast, showToast };
}

function MicroToast({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[60] px-4 py-2.5 rounded-lg bg-gold text-navy text-sm font-medium shadow-lg shadow-black/30 animate-fade-in"
    >
      {message}
    </div>
  );
}

function MicroHeader({ title, action }: { title: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between mb-6">
      <h2 className="text-2xl font-semibold">
        {title} <span className="text-xs px-2 py-0.5 bg-gold/20 text-gold rounded">DEMO</span>
      </h2>
      {action}
    </div>
  );
}

/* Sidebar micro panel — compact synthetic preview + one real action each. */
function MicroSidebar({ label }: { label: string }) {
  const [note, setNote] = useState<string | null>(null);
  const [count, setCount] = useState(0);

  function act(message: string) {
    setCount((c) => c + 1);
    setNote(message);
  }

  let body: React.ReactNode;
  let action: { text: string; run: () => void } | null = null;

  switch (label) {
    case 'Mission Control':
      body = (
        <div className="space-y-2 text-[11px]">
          <div>Synthetic load: <span className="font-medium">6 cases</span> in flight.</div>
          <div>Briefs ready today: 4 • Avg verification: 94%</div>
          <div className="text-gold">SLA compliance: 100% on demo cases</div>
        </div>
      );
      action = { text: 'Recompute synthetic metrics →', run: () => act('Workload re-simulated from demo cases + audits.') };
      break;
    case 'Operations':
      body = (
        <div className="space-y-1.5 text-[11px]">
          <div>Active pods: 3 (synthetic)</div>
          <div>Demo staff loaded from roster</div>
          <div>Next auto-assign target: infliximab or TKA case</div>
        </div>
      );
      action = { text: 'Score next assignment (demo) →', run: () => act('Next pod assignment scored (SLA slack + load).') };
      break;
    case 'Clients':
      body = (
        <div className="space-y-1 text-[11px]">
          <div>3+ demo TPAs loaded (incl. Southwest Administrators)</div>
          <div>• Southwest Administrators (TPA)</div>
          <div>• Other synthetic plans</div>
        </div>
      );
      action = { text: 'Simulate intake for Southwest →', run: () => act(`New synthetic case added to Southwest queue (${6 + count + 1} total).`) };
      break;
    case 'Billing':
      body = (
        <div className="space-y-1 text-[11px]">
          <div>Last synthetic determination batch: 4 cases • ~$1,240 modeled payout</div>
          <div>Demo invoices + Meow exports ready</div>
        </div>
      );
      action = { text: 'Generate demo payout →', run: () => act('Meow-style payout generated from synthetic determinations.') };
      break;
    case 'Setup':
      body = (
        <div className="space-y-1 text-[11px]">
          <div>Demo TPA fully seeded: 3 reviewers, 6 cases, pods ready.</div>
        </div>
      );
      action = { text: 'Run demo onboarding →', run: () => act('Practice invite + kickoff .ics sent (synthetic).') };
      break;
    default:
      body = <div className="text-[11px]">Quick synthetic preview for this area (demo data).</div>;
  }

  return (
    <div>
      {body}
      {action && (
        <button onClick={action.run} className="mt-1 text-gold hover:underline text-[11px]">
          {action.text}
        </button>
      )}
      {note && (
        <div className="mt-2 text-[10px] text-gold-dark bg-gold/10 rounded px-2 py-1">✓ {note}</div>
      )}
    </div>
  );
}

/* Main content micro demos — full stateful synthetic surfaces. */
function MicroMain({ label }: { label: string }) {
  switch (label) {
    case 'Mission Control': return <MissionControlDemo />;
    case 'Operations': return <OperationsDemo />;
    case 'Clients': return <ClientsDemo />;
    case 'Billing': return <BillingDemo />;
    case 'Setup': return <SetupDemo />;
    default:
      return <div className="p-8 text-white">Micro demo content for {label} (synthetic data)</div>;
  }
}

function MissionControlDemo() {
  const { toast, showToast } = useMicroToast();
  const [metrics, setMetrics] = useState({ active: 6, briefs: 4, sla: 100, verify: 94 });
  const [refreshedAt, setRefreshedAt] = useState<string | null>(null);
  const [activity, setActivity] = useState<string[]>([
    'Maria Santos MRI 72148 → Brief ready, fact-check 96',
    'John Rivera TKA → In LPN review',
    'Infliximab case → Pod assigned',
  ]);

  function refresh() {
    const verify = 93 + Math.floor(Math.random() * 6);
    const briefs = Math.min(metrics.active, 3 + Math.floor(Math.random() * 4));
    setMetrics((m) => ({ ...m, verify, briefs }));
    const stamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    setRefreshedAt(stamp);
    setActivity((a) => [`Synthetic metrics recomputed at ${stamp}`, ...a].slice(0, 5));
    showToast('Synthetic metrics refreshed.');
  }

  return (
    <div className={microWrap}>
      <div className="max-w-4xl mx-auto">
        <MicroHeader title="Mission Control" action={<button onClick={refresh} className={microBtn}>Refresh Synthetic Metrics</button>} />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className={microCard}><div className="text-xs text-white/50">ACTIVE CASES</div><div className="text-4xl font-semibold text-gold mt-1">{metrics.active}</div><div className="text-xs">All synthetic</div></div>
          <div className={microCard}><div className="text-xs text-white/50">BRIEFS READY</div><div className="text-4xl font-semibold text-gold mt-1">{metrics.briefs}</div><div className="text-xs">Avg verification {metrics.verify}%</div></div>
          <div className={microCard}><div className="text-xs text-white/50">SLA HEALTH</div><div className="text-4xl font-semibold text-emerald-400 mt-1">{metrics.sla}%</div><div className="text-xs">On demo cases</div></div>
        </div>
        <div className={microCard}>
          <div className="text-sm mb-2 text-white/70">Recent Synthetic Activity (from demo data)</div>
          <div className="text-xs space-y-1 text-white/60">
            {activity.map((a, i) => <div key={i}>• {a}</div>)}
          </div>
        </div>
        <div className="text-xs text-white/40 mt-4">
          {refreshedAt ? `Last recomputed at ${refreshedAt}. ` : ''}This is a micro demo using the same canned synthetic Southwest TPA data as the main tour. Real pages use live data.
        </div>
      </div>
      <MicroToast message={toast} />
    </div>
  );
}

function OperationsDemo() {
  const { toast, showToast } = useMicroToast();
  const [queue, setQueue] = useState([
    { name: 'Maria Santos - MRI 72148', stage: 'Brief Ready' },
    { name: 'John Rivera - TKA 27447', stage: 'LPN Review' },
    { name: 'Robert Garcia - CPAP E0601', stage: 'Intake' },
  ]);
  const [runs, setRuns] = useState(0);

  function toneFor(stage: string) {
    if (stage === 'Brief Ready' || stage === 'Determined') return 'text-emerald-400';
    if (stage === 'LPN Review') return 'text-amber-400';
    return 'text-blue-400';
  }

  function rescore() {
    setQueue((q) =>
      q.map((c) => {
        const i = STAGES.indexOf(c.stage as (typeof STAGES)[number]);
        return { ...c, stage: STAGES[Math.min(i + 1, STAGES.length - 1)] };
      }),
    );
    setRuns((r) => r + 1);
    showToast('Pod assignments re-scored on current synthetic cases.');
  }

  return (
    <div className={microWrap}>
      <div className="max-w-4xl mx-auto">
        <MicroHeader title="Operations" />
        <div className={microCard}>
          <div className="text-sm mb-3">Synthetic Queue (demoCases)</div>
          <div className="space-y-2 text-sm">
            {queue.map((c) => (
              <div key={c.name} className="flex justify-between p-2 bg-white/5 rounded">
                <span>{c.name}</span><span className={toneFor(c.stage)}>{c.stage}</span>
              </div>
            ))}
          </div>
        </div>
        <div className={microCard}>
          <div className="text-sm mb-2">Demo Pods &amp; Staff</div>
          <div className="text-xs text-white/60">3 pods active • Roster loaded with 3 reviewers • Auto-assign uses SLA scoring on synthetic data.{runs > 0 ? ` Re-scored ${runs}×.` : ''}</div>
          <button onClick={rescore} className="mt-3 px-3 py-1.5 bg-gold text-navy text-xs rounded hover:opacity-90 transition">Re-score assignments (demo)</button>
        </div>
      </div>
      <MicroToast message={toast} />
    </div>
  );
}

function ClientsDemo() {
  const { toast, showToast } = useMicroToast();
  const [caseCount, setCaseCount] = useState(6);
  const [intakes, setIntakes] = useState<{ id: string; patient: string; procedure: string }[]>([]);

  function simulateIntake() {
    const n = caseCount + 1;
    const id = `SW-2026-${String(1000 + n)}`;
    const patient = SAMPLE_PATIENTS[n % SAMPLE_PATIENTS.length];
    const procedure = SAMPLE_PROCEDURES[n % SAMPLE_PROCEDURES.length];
    setIntakes((list) => [{ id, patient, procedure }, ...list].slice(0, 6));
    setCaseCount(n);
    showToast(`New synthetic case ${id} added to Southwest queue.`);
  }

  return (
    <div className={microWrap}>
      <div className="max-w-4xl mx-auto">
        <MicroHeader title="Clients" />
        <div className={microCard}>
          <div className="text-sm mb-3">Demo TPAs (from demoClients)</div>
          <div className="space-y-3">
            <div className="p-3 bg-white/5 rounded"><div className="font-medium">Southwest Administrators (TPA)</div><div className="text-xs text-white/60">{caseCount} cases • InterQual + CMS • Fully seeded</div></div>
            <div className="p-3 bg-white/5 rounded"><div className="font-medium">Other Synthetic Plans</div><div className="text-xs text-white/60">Additional clients for demo variety</div></div>
          </div>
        </div>
        {intakes.length > 0 && (
          <div className={microCard}>
            <div className="text-sm mb-3">New Synthetic Intakes</div>
            <div className="space-y-2 text-sm">
              {intakes.map((c) => (
                <div key={c.id} className="flex justify-between p-2 bg-white/5 rounded animate-fade-in">
                  <span>{c.patient} — {c.procedure}</span>
                  <span className="text-blue-400 font-mono text-xs">{c.id} • Intake</span>
                </div>
              ))}
            </div>
          </div>
        )}
        <button onClick={simulateIntake} className={microBtn}>Simulate New Intake for Southwest</button>
      </div>
      <MicroToast message={toast} />
    </div>
  );
}

function BillingDemo() {
  const { toast, showToast } = useMicroToast();
  const [invoices, setInvoices] = useState<{ number: string; cases: number; amount: number }[]>([]);

  function generate() {
    const n = invoices.length + 1;
    const number = `INV-2026-${String(100 + n)}`;
    const cases = 4 + Math.floor(Math.random() * 3);
    const amount = cases * (300 + Math.floor(Math.random() * 40));
    setInvoices((l) => [{ number, cases, amount }, ...l]);
    showToast(`${number} generated — ${cases} cases, $${amount.toLocaleString()} modeled.`);
  }

  return (
    <div className={microWrap}>
      <div className="max-w-4xl mx-auto">
        <MicroHeader title="Billing" />
        <div className={microCard}>
          <div className="text-sm mb-2">Synthetic Payouts (demo determinations)</div>
          <div className="text-xs">Last batch: 4 cases • Modeled ~$1,240 Meow-style payout</div>
          <div className="text-xs text-white/60 mt-1">All tied to synthetic briefs with 94%+ verification.</div>
        </div>
        {invoices.length > 0 && (
          <div className={microCard}>
            <div className="text-sm mb-3">Generated Invoices</div>
            <div className="space-y-2 text-sm">
              {invoices.map((inv) => (
                <div key={inv.number} className="flex justify-between p-2 bg-white/5 rounded animate-fade-in">
                  <span className="font-mono text-xs">{inv.number} • {inv.cases} cases</span>
                  <span className="text-emerald-400">${inv.amount.toLocaleString()}</span>
                </div>
              ))}
            </div>
          </div>
        )}
        <button onClick={generate} className={microBtn}>Generate Demo Payout / Invoice</button>
      </div>
      <MicroToast message={toast} />
    </div>
  );
}

function SetupDemo() {
  const { toast, showToast } = useMicroToast();
  const baseSteps = [
    'Southwest TPA seeded (3 reviewers, 6 cases)',
    'Pods & staff configured',
    'InterQual + CMS criteria engine active',
    'Synthetic audit trail ready',
  ];
  const [invite, setInvite] = useState<string | null>(null);

  function runOnboarding() {
    const d = new Date();
    const add = ((2 - d.getDay() + 7) % 7) || 7; // next Tuesday
    d.setDate(d.getDate() + add);
    const when = d.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' });
    setInvite(`Kickoff invite (.ics) generated for ${when}, 10:00 AM (synthetic)`);
    showToast('Practice invite + kickoff calendar sent (synthetic).');
  }

  return (
    <div className={microWrap}>
      <div className="max-w-4xl mx-auto">
        <MicroHeader title="Setup" />
        <div className={microCard}>
          <div className="text-sm mb-2">Demo Environment Status</div>
          <div className="text-xs space-y-1 text-white/70">
            {baseSteps.map((s) => <div key={s}>✓ {s}</div>)}
            <div className={invite ? 'text-emerald-400' : 'text-white/40'}>{invite ? '✓' : '○'} {invite ?? 'Kickoff invite not yet sent'}</div>
          </div>
        </div>
        <button onClick={runOnboarding} className={microBtn}>Run Demo Onboarding / Invite</button>
      </div>
      <MicroToast message={toast} />
    </div>
  );
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
