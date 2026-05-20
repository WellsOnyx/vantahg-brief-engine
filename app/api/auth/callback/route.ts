import { NextRequest, NextResponse } from 'next/server';
import { CognitoAuthAdapter } from '@/lib/adapters/auth/cognito';
import { SESSION_COOKIE_NAME } from '@/lib/adapters/auth/cognito';
import { applyRateLimit } from '@/lib/rate-limit-middleware';
import { logSecurityEvent } from '@/lib/audit';
import { getRequestContext } from '@/lib/security';

export const dynamic = 'force-dynamic';

/**
 * GET /api/auth/callback?code=<32-hex-otp>&user=<cognito-sub>&next=<path>
 *
 * Landing page for the magic-link emailed by the Cognito create-auth-challenge
 * Lambda. Flow:
 *   1. Pull `code` (the OTP the user clicked) and `user` (their Cognito sub).
 *   2. Retrieve the stashed Cognito `Session` token (set during the prior
 *      AdminInitiateAuth call) keyed by sub.
 *   3. Call RespondToAuthChallenge with USERNAME + ANSWER=code + Session.
 *      Cognito's verify-auth-challenge Lambda compares the code against the
 *      DDB OTP row and either issues tokens or rejects.
 *   4. On success, set the `vantaum_session` HttpOnly cookie with the JSON
 *      payload {id_token, access_token, refresh_token, expires_at} and
 *      redirect to ?next= (or /dashboard).
 *   5. On failure, redirect to /login?reason=<...>.
 *
 * Bypasses /auth/callback through the middleware — this route must be
 * publicly reachable (the user hasn't authenticated yet by definition).
 *
 * SECURITY:
 *   - GET-only by design: the magic link is an idempotent navigation.
 *   - Single-use: the verify-auth-challenge Lambda deletes the OTP row on
 *     success, and consumeSession() deletes the stashed Session before
 *     handing it back. A second click on the same link returns 410 Gone.
 *   - Cookie is HttpOnly + Secure + SameSite=Lax so it survives the
 *     top-level navigation from the email client.
 */

const COOKIE_MAX_AGE_SEC = 3600 * 8; // 8h — caller-side refresh on tab activity, then re-issue.

function safeNext(next: string | null): string {
  if (!next) return '/dashboard';
  // Allow only same-origin absolute paths. Reject anything that could
  // redirect off-host or smuggle a scheme.
  if (!next.startsWith('/')) return '/dashboard';
  if (next.startsWith('//')) return '/dashboard';
  if (next.includes('\n') || next.includes('\r')) return '/dashboard';
  return next;
}

export async function GET(request: NextRequest) {
  const rateLimited = await applyRateLimit(request, { maxRequests: 30 });
  if (rateLimited) return rateLimited;

  const ctx = getRequestContext(request);
  const url = new URL(request.url);
  const code = url.searchParams.get('code') || '';
  const sub = url.searchParams.get('user') || '';
  const next = safeNext(url.searchParams.get('next'));

  if (!code || !sub) {
    await logSecurityEvent(
      'auth_callback_bad_params',
      'anonymous',
      { has_code: Boolean(code), has_user: Boolean(sub) },
      ctx,
    );
    return NextResponse.redirect(new URL('/login?reason=invalid_callback', request.url));
  }

  const adapter = new CognitoAuthAdapter();
  const redeem = await adapter.redeemMagicLink({ sub, code });

  if (!redeem.ok) {
    await logSecurityEvent(
      'auth_callback_failed',
      sub,
      { message: redeem.message },
      ctx,
    );
    return NextResponse.redirect(
      new URL('/login?reason=magic_link_expired', request.url),
    );
  }

  const redirect = NextResponse.redirect(new URL(next, request.url));
  redirect.cookies.set(SESSION_COOKIE_NAME, JSON.stringify(redeem.cookie), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: COOKIE_MAX_AGE_SEC,
  });

  await logSecurityEvent('auth_callback_success', sub, { next }, ctx);
  return redirect;
}
