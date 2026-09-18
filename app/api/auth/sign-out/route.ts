import { NextRequest, NextResponse } from 'next/server';
import {
  SESSION_COOKIE_NAME,
  sessionCookieOptions,
} from '@/lib/adapters/auth/cognito';
import { isAwsAuthEnabled } from '@/lib/runtime-backend';
import { createServerClient } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

/**
 * POST /api/auth/sign-out
 *
 * Always clears `vantaum_session`. When ENABLE_AWS_AUTH is false and
 * Supabase SSR is configured, also signs out the hybrid session so
 * leftover sb-* cookies do not keep the user "in".
 */
export async function POST(_request: NextRequest) {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE_NAME, '', sessionCookieOptions(0));

  if (!isAwsAuthEnabled()) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '';
    if (url && anon) {
      try {
        const supabase = await createServerClient();
        await supabase.auth.signOut();
      } catch {
        // Cookie clear above is enough for the Cognito cookie; hybrid
        // sign-out is best-effort.
      }
    }
  }

  return res;
}
