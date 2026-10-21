import { NextResponse } from 'next/server';
import { getAuthAdapter, type AuthAdminAdapter } from '@/lib/adapters/auth';
import { isAwsAuthEnabled } from '@/lib/runtime-backend';
import { applyRateLimit } from '@/lib/rate-limit-middleware';
import {
  AUTH_SESSION_MAX_AGE_SEC,
  SESSION_COOKIE_NAME,
  sessionCookieOptions,
} from '@/lib/adapters/auth/cognito';
import { stampSessionCap } from '@/lib/auth/account-flow';
import type { SessionCookiePayload } from '@/lib/adapters/auth/types';

export async function beginAwsAuth(
  request: Request,
  maxRequests: number,
): Promise<{ adapter: AuthAdminAdapter } | { response: NextResponse }> {
  const limited = await applyRateLimit(request, { maxRequests });
  if (limited) return { response: limited };
  if (!isAwsAuthEnabled()) {
    return {
      response: NextResponse.json(
        { ok: false, error: 'use_supabase', backend: 'supabase' },
        { status: 503 },
      ),
    };
  }
  return { adapter: getAuthAdapter() };
}

export function writeSessionCookie(
  res: NextResponse,
  cookie: SessionCookiePayload,
  previousAbsolute?: number,
): boolean {
  const stamped = stampSessionCap(cookie, Date.now(), AUTH_SESSION_MAX_AGE_SEC, previousAbsolute);
  if ('expired' in stamped) return false;
  res.cookies.set(
    SESSION_COOKIE_NAME,
    JSON.stringify(stamped.cookie),
    sessionCookieOptions(stamped.maxAgeSec),
  );
  return true;
}
