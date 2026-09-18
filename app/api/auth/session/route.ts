import { NextRequest, NextResponse } from 'next/server';
import { getAuthAdapter } from '@/lib/adapters/auth';
import { getAuthBackend } from '@/lib/runtime-backend';
import { getServiceClient } from '@/lib/supabase';
import type { UserRole } from '@/lib/auth-guard';

export const dynamic = 'force-dynamic';

/**
 * GET /api/auth/session
 *
 * Backend-agnostic session probe for AuthProvider and client chrome.
 * Uses getAuthAdapter().getSessionUser — Cognito JWKS when
 * ENABLE_AWS_AUTH=true, Supabase SSR cookies otherwise.
 *
 * Does NOT mint a demo admin. Unauthenticated → `{ user: null }`.
 */
export async function GET(request: NextRequest) {
  const backend = getAuthBackend();
  try {
    const sessionUser = await getAuthAdapter().getSessionUser(request);
    if (!sessionUser) {
      return NextResponse.json({ backend, user: null });
    }

    let role = sessionUser.role;
    if (!role) {
      try {
        const svc = getServiceClient();
        const { data: profile } = await svc
          .from('user_profiles')
          .select('role')
          .eq('id', sessionUser.id)
          .maybeSingle();
        role = (profile?.role as UserRole | undefined) ?? undefined;
      } catch {
        // Absence of a profile row is not fatal.
      }
    }

    return NextResponse.json({
      backend,
      user: {
        id: sessionUser.id,
        email: sessionUser.email,
        role: role ?? null,
      },
    });
  } catch {
    return NextResponse.json({ backend, user: null });
  }
}
