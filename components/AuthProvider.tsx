'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { createBrowserClient } from '@/lib/supabase-browser';

export interface AuthSessionUser {
  id: string;
  email: string;
  role?: string | null;
}

interface AuthContextValue {
  user: AuthSessionUser | null;
  backend: 'cognito' | 'supabase';
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  backend: 'supabase',
  loading: true,
  signOut: async () => {},
});

export function useAuth() {
  return useContext(AuthContext);
}

/**
 * Session chrome. Always reads GET /api/auth/session so both backends
 * (Cognito `vantaum_session` and Supabase SSR cookies) surface the same
 * `{ id, email, role }` shape. Does not talk to supabase-js when
 * ENABLE_AWS_AUTH=true — that flag is enforced on the server.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthSessionUser | null>(null);
  const [backend, setBackend] = useState<'cognito' | 'supabase'>('supabase');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch('/api/auth/session', { cache: 'no-store' });
        if (!res.ok) {
          if (!cancelled) {
            setUser(null);
            setLoading(false);
          }
          return;
        }
        const data = (await res.json()) as {
          backend?: 'cognito' | 'supabase';
          user?: AuthSessionUser | null;
        };
        if (!cancelled) {
          setBackend(data.backend === 'cognito' ? 'cognito' : 'supabase');
          setUser(data.user ?? null);
        }
      } catch {
        if (!cancelled) setUser(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  async function signOut() {
    try {
      await fetch('/api/auth/sign-out', { method: 'POST' });
    } catch {
      // Still bounce to login.
    }
    // Hybrid leftover: clear sb-* cookies from the browser client when
    // present. No-op when NEXT_PUBLIC_SUPABASE_* are empty (AWS-only).
    const supabase = createBrowserClient();
    if (supabase) {
      try {
        await supabase.auth.signOut();
      } catch {
        // ignore
      }
    }
    window.location.href = '/login';
  }

  return (
    <AuthContext.Provider value={{ user, backend, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}
