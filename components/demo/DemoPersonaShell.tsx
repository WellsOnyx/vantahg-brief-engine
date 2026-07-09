'use client';

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { AppShell } from '@/components/AppShell';
import { DEMO_PERSONAS, DEFAULT_PERSONA_ID, getPersona, type DemoPersona } from '@/components/demo/personas';

/**
 * Demo-aware shell wrapper + floating persona switcher.
 *
 * When demo access is active (the `demo_access=granted` cookie from the
 * /demo-password unlock, or NEXT_PUBLIC_DEMO_MODE=true in local dev), the
 * sidebar nav / role surface transform per persona and a floating
 * "Viewing as" switcher appears, letting a presenter flip the whole app
 * between Concierge (CX), Medical Review, Delivery Lead, Executive, TPA
 * portal, and Admin views in one click.
 *
 * Outside demo access this renders AppShell with the default nav —
 * byte-for-byte the previous behavior. The switcher is a demo affordance
 * gated on demo access, never a production surface: real deployments with
 * real auth have no demo cookie, so nothing here renders.
 *
 * State lives in external stores (cookie + localStorage) read through
 * useSyncExternalStore, so hydration is clean: the server snapshot renders
 * the default shell, the client snapshot swaps in the persona.
 */

const STORAGE_KEY = 'vantaum_demo_persona';

// Keep the switcher off marketing/auth surfaces even in demo.
const SWITCHER_HIDDEN_PREFIXES = ['/site', '/login', '/signup', '/sign-up', '/magic-link', '/forgot-password', '/welcome', '/demo-password'];

function hasDemoAccess(): boolean {
  if (process.env.NEXT_PUBLIC_DEMO_MODE === 'true') return true;
  if (typeof document === 'undefined') return false;
  return document.cookie.split(';').some((c) => c.trim() === 'demo_access=granted');
}

// Tiny external store over localStorage so persona changes re-render
// without setState-in-effect and hydrate cleanly (server snapshot = default).
const personaListeners = new Set<() => void>();
function subscribePersona(cb: () => void): () => void {
  personaListeners.add(cb);
  window.addEventListener('storage', cb);
  return () => {
    personaListeners.delete(cb);
    window.removeEventListener('storage', cb);
  };
}
function readPersonaId(): string {
  try {
    return window.localStorage.getItem(STORAGE_KEY) ?? DEFAULT_PERSONA_ID;
  } catch {
    return DEFAULT_PERSONA_ID;
  }
}
function writePersonaId(id: string): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, id);
  } catch {
    /* non-fatal */
  }
  personaListeners.forEach((l) => l());
}

export function DemoPersonaShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  // Cookie snapshot re-evaluates on every render (navigation re-renders us),
  // so unlocking at /demo-password is picked up on the next route change.
  const demoActive = useSyncExternalStore(subscribePersona, hasDemoAccess, () => false);
  const personaId = useSyncExternalStore(subscribePersona, readPersonaId, () => DEFAULT_PERSONA_ID);

  const persona = getPersona(demoActive ? personaId : DEFAULT_PERSONA_ID);

  const switchTo = useCallback(
    (next: DemoPersona) => {
      writePersonaId(next.id);
      router.push(next.home);
    },
    [router],
  );

  const switcherHidden =
    pathname === '/' || SWITCHER_HIDDEN_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + '/'));

  return (
    <>
      <AppShell primaryNav={persona.nav} roleSurface={persona.roleSurface}>
        {children}
      </AppShell>
      {demoActive && !switcherHidden && (
        <PersonaSwitcher current={persona} onSwitch={switchTo} />
      )}
    </>
  );
}

/* ─── Floating switcher ─────────────────────────────────────────────── */

function PersonaSwitcher({
  current,
  onSwitch,
}: {
  current: DemoPersona;
  onSwitch: (p: DemoPersona) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="fixed bottom-4 right-4 z-[70] font-[family-name:var(--font-dm-sans)]">
      {open && (
        <div className="absolute bottom-full right-0 mb-2 w-80 rounded-xl border border-navy/10 bg-white shadow-2xl shadow-navy/20 overflow-hidden animate-fade-in">
          <div className="px-4 py-3 bg-navy">
            <p className="text-[10px] uppercase tracking-[0.18em] text-gold font-semibold">Demo · switch view</p>
            <p className="text-xs text-white/70 mt-0.5">One platform, every seat at the table.</p>
          </div>
          <ul className="py-1 max-h-[60vh] overflow-auto" role="listbox" aria-label="Demo persona">
            {DEMO_PERSONAS.map((p) => {
              const active = p.id === current.id;
              return (
                <li key={p.id}>
                  <button
                    role="option"
                    aria-selected={active}
                    onClick={() => {
                      setOpen(false);
                      if (!active) onSwitch(p);
                    }}
                    className={`w-full text-left px-4 py-2.5 flex items-start gap-3 transition-colors ${
                      active ? 'bg-gold/10' : 'hover:bg-navy/[0.04]'
                    }`}
                  >
                    <span className="text-xl leading-none mt-0.5" aria-hidden>
                      {p.icon}
                    </span>
                    <span className="min-w-0">
                      <span className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-navy">{p.label}</span>
                        {active && (
                          <span className="text-[10px] font-semibold text-gold uppercase tracking-wide">viewing</span>
                        )}
                      </span>
                      <span className="block text-[11px] text-navy/50 truncate">{p.person} — {p.blurb}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="px-4 py-2.5 border-t border-navy/10 bg-navy/[0.03] flex items-center justify-between gap-2">
            <p className="text-[10px] text-navy/40">
              Demo environment · synthetic data only · no PHI
            </p>
            <a href="/demo" className="text-[10px] font-semibold text-navy/60 hover:text-navy whitespace-nowrap">
              ⌂ Demo hub
            </a>
          </div>
        </div>
      )}

      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="listbox"
        className="flex items-center gap-2.5 pl-3 pr-4 py-2.5 rounded-full bg-navy text-white shadow-xl shadow-navy/30 border border-white/10 hover:border-gold/60 transition-colors"
      >
        <span className="text-base leading-none" aria-hidden>{current.icon}</span>
        <span className="text-left">
          <span className="block text-[9px] uppercase tracking-[0.16em] text-gold font-semibold leading-tight">
            Viewing as
          </span>
          <span className="block text-xs font-semibold leading-tight">{current.label}</span>
        </span>
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
          className={`transition-transform ${open ? 'rotate-180' : ''}`}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
    </div>
  );
}
