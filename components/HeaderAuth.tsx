'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/components/AuthProvider';
import type { NavItem } from '@/components/AppShell';

/**
 * Avatar menu in the top-right of the AppShell top bar.
 *
 * When signed out: a quiet "Sign in" link.
 * When signed in: a circular avatar with the user's initial, which opens
 * a popover containing the user's email + role, optional secondary nav
 * (demoted from the sidebar — e.g. Settings, Help, About), the Wells Onyx
 * marketing link, and Sign out.
 */
export function HeaderAuth({ secondaryNav }: { secondaryNav?: NavItem[] }) {
  const { user, loading, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    if (open) {
      document.addEventListener('mousedown', onClickOutside);
      document.addEventListener('keydown', onEsc);
    }
    return () => {
      document.removeEventListener('mousedown', onClickOutside);
      document.removeEventListener('keydown', onEsc);
    };
  }, [open]);

  if (loading) {
    return <span className="w-8 h-8 rounded-full bg-white/10 animate-pulse" aria-hidden />;
  }

  if (!user) {
    return (
      <Link
        href="/login"
        className="inline-flex items-center px-3 py-1.5 rounded-md text-sm font-medium text-white/70 hover:text-white hover:bg-white/10 transition"
      >
        Sign in
      </Link>
    );
  }

  const initial = (user.email?.[0] ?? '?').toUpperCase();

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-8 h-8 rounded-full bg-gold-gradient text-navy font-bold text-sm flex items-center justify-center shadow-sm hover:shadow-md transition-shadow ring-2 ring-transparent focus:ring-white/30 focus:outline-none"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        {initial}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 mt-2 w-72 rounded-xl bg-surface border border-border shadow-xl shadow-navy-dark/15 overflow-hidden animate-scale-in"
        >
          <div className="px-4 py-3 border-b border-border bg-navy/[0.02]">
            <p className="text-[11px] uppercase tracking-[0.14em] text-muted font-semibold">Signed in as</p>
            <p className="text-sm font-semibold text-navy truncate mt-0.5">{user.email}</p>
          </div>

          {secondaryNav && secondaryNav.length > 0 && (
            <ul className="py-1.5">
              {secondaryNav.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={() => setOpen(false)}
                    className="block px-4 py-2 text-sm text-navy hover:bg-navy/[0.03] transition-colors"
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          )}

          <ul className="py-1.5 border-t border-border">
            <li>
              <a
                href="https://www.wellsonyx.com"
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setOpen(false)}
                className="flex items-center justify-between px-4 py-2 text-sm text-navy hover:bg-navy/[0.03] transition-colors"
              >
                <span>About Wells Onyx</span>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="text-muted">
                  <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                  <polyline points="15 3 21 3 21 9" />
                  <line x1="10" y1="14" x2="21" y2="3" />
                </svg>
              </a>
            </li>
            <li>
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  signOut();
                }}
                className="w-full text-left px-4 py-2 text-sm text-red-700 hover:bg-red-50 transition-colors"
              >
                Sign out
              </button>
            </li>
          </ul>
        </div>
      )}
    </div>
  );
}
