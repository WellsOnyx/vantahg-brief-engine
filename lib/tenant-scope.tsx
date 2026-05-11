'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { createBrowserClient } from './supabase-browser';

/**
 * Tenant scope = "which client is the admin currently focused on?"
 *
 * UX-only filter — does NOT enforce isolation. Admins still have full
 * server-side access; the selector adds a `?client_id=` filter to list
 * calls so the UI shows just the active tenant's data. Real tenant
 * isolation for cases lives in lib/case-access.ts.
 *
 * Persisted in localStorage so the selection survives reloads. Defaults
 * to `null` ("All Tenants") on first load.
 *
 * Only renders an active selector for admin users. Non-admins get a
 * permanently-`null` scope and no UI surface, so consuming pages that
 * `useTenantScope()` don't need a role check of their own.
 */

const STORAGE_KEY = 'vantaum.tenant_scope';

export interface TenantClient {
  id: string;
  name: string;
}

interface TenantScopeContextValue {
  /** The currently-selected client_id, or null for "All Tenants". */
  selectedClientId: string | null;
  /** Setter — null clears the filter. Writes through to localStorage. */
  setSelectedClientId: (id: string | null) => void;
  /** Full list of clients available to the picker. */
  clients: TenantClient[];
  /** True while the clients list is loading. */
  loadingClients: boolean;
  /** Whether the current user can change the scope (admin only). */
  canChangeScope: boolean;
  /** Convenience: the name of the active client, or null if "All". */
  selectedClientName: string | null;
}

const TenantScopeContext = createContext<TenantScopeContextValue | null>(null);

function readStoredScope(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    return v && v.length > 0 ? v : null;
  } catch {
    return null;
  }
}

function writeStoredScope(id: string | null): void {
  if (typeof window === 'undefined') return;
  try {
    if (id === null) window.localStorage.removeItem(STORAGE_KEY);
    else window.localStorage.setItem(STORAGE_KEY, id);
  } catch {
    /* localStorage unavailable (private browsing, etc) — fall back to in-memory only */
  }
}

export function TenantScopeProvider({ children }: { children: React.ReactNode }) {
  const [selectedClientId, setSelectedClientIdState] = useState<string | null>(null);
  const [clients, setClients] = useState<TenantClient[]>([]);
  const [loadingClients, setLoadingClients] = useState(true);
  const [canChangeScope, setCanChangeScope] = useState(false);

  // Hydrate from localStorage on mount.
  useEffect(() => {
    setSelectedClientIdState(readStoredScope());
  }, []);

  // Probe the user's role + load the clients list. Both are admin-only
  // endpoints; if either 401/403s we just leave the selector dormant.
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        // Role detection. In demo mode there's no browser supabase client,
        // but isDemoMode bypasses auth at the server and treats the user
        // as admin — so optimistically allow the selector in that case
        // and let /api/clients confirm.
        const browser = createBrowserClient();
        let isAdmin = browser === null; // demo
        if (browser) {
          const { data: { user } } = await browser.auth.getUser();
          if (user) {
            const { data: profile } = await browser
              .from('user_profiles')
              .select('role')
              .eq('id', user.id)
              .maybeSingle();
            isAdmin = profile?.role === 'admin';
          }
        }
        if (!isAdmin) {
          if (!cancelled) {
            setCanChangeScope(false);
            setLoadingClients(false);
          }
          return;
        }

        const res = await fetch('/api/clients');
        if (!res.ok) {
          // Non-admins get a 403 here too — fail silent and dormant.
          if (!cancelled) {
            setCanChangeScope(false);
            setLoadingClients(false);
          }
          return;
        }
        const data = (await res.json()) as TenantClient[];
        if (!cancelled) {
          setClients(data ?? []);
          setCanChangeScope(true);
          setLoadingClients(false);
        }
      } catch {
        if (!cancelled) {
          setCanChangeScope(false);
          setLoadingClients(false);
        }
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  const setSelectedClientId = useCallback((id: string | null) => {
    setSelectedClientIdState(id);
    writeStoredScope(id);
  }, []);

  const selectedClientName = useMemo(() => {
    if (selectedClientId === null) return null;
    return clients.find((c) => c.id === selectedClientId)?.name ?? null;
  }, [selectedClientId, clients]);

  const value = useMemo<TenantScopeContextValue>(
    () => ({
      selectedClientId,
      setSelectedClientId,
      clients,
      loadingClients,
      canChangeScope,
      selectedClientName,
    }),
    [selectedClientId, setSelectedClientId, clients, loadingClients, canChangeScope, selectedClientName],
  );

  return <TenantScopeContext.Provider value={value}>{children}</TenantScopeContext.Provider>;
}

/**
 * Hook for consuming pages. Returns the full context shape. Safe to call
 * outside the provider — degrades to "All Tenants" with no clients list.
 * That keeps pages renderable on chromeless surfaces (e.g. /portal, /demo)
 * that don't wrap with the provider.
 */
export function useTenantScope(): TenantScopeContextValue {
  const ctx = useContext(TenantScopeContext);
  if (ctx) return ctx;
  return {
    selectedClientId: null,
    setSelectedClientId: () => {},
    clients: [],
    loadingClients: false,
    canChangeScope: false,
    selectedClientName: null,
  };
}

/**
 * Convenience helper for fetch URLs. Appends `client_id=X` when a scope
 * is active. Pass the base URL string with or without an existing query.
 */
export function withTenantScope(url: string, clientId: string | null): string {
  if (!clientId) return url;
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}client_id=${encodeURIComponent(clientId)}`;
}
