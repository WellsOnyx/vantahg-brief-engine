import { NextRequest, NextResponse } from 'next/server';
import { peekSessionCookie } from '@/lib/adapters/auth/cognito';
import { authMessage, safeNextPath, sessionClockDecision } from '@/lib/auth/account-flow';
import { beginAwsAuth, writeSessionCookie } from '@/lib/auth/public-route';
import { landingPathForRole } from '@/lib/auth-landing';

export const dynamic = 'force-dynamic';

/**
 * POST /api/auth/refresh — rotate the id token inside the absolute cap.
 * GET — same, then redirect to `next` (middleware uses this when a page
 * load finds an expired id token and a live refresh token).
 */

async function rotate(request: NextRequest): Promise<NextResponse> {
  const opened = await beginAwsAuth(request, 30);
  if ('response' in opened) return opened.response;

  const peeked = peekSessionCookie(request);
  const decision = sessionClockDecision({
    expiresAt: peeked?.expires_at,
    absoluteExpiresAt: peeked?.absolute_expires_at,
    hasRefresh: Boolean(peeked?.refresh_token),
    now: Date.now(),
  });
  if (!peeked?.refresh_token || decision === 'expired') {
    return NextResponse.json(
      { ok: false, error: 'session_expired', message: authMessage('session_expired'), backend: 'cognito' },
      { status: 401 },
    );
  }
  if (decision === 'valid' && peeked.id_token) {
    return NextResponse.json({ ok: true, refreshed: false, backend: 'cognito' });
  }

  const result = await opened.adapter.refreshSession(peeked.refresh_token);
  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: 'session_expired', message: authMessage('session_expired'), backend: 'cognito' },
      { status: 401 },
    );
  }
  const res = NextResponse.json({
    ok: true,
    refreshed: true,
    next: landingPathForRole(result.role),
    backend: 'cognito',
    user: { role: result.role ?? null, client_id: result.clientId ?? null },
  });
  const wrote = writeSessionCookie(res, {
    ...result.cookie,
    refresh_token: result.cookie.refresh_token ?? peeked.refresh_token,
    absolute_expires_at: peeked.absolute_expires_at,
  }, peeked.absolute_expires_at);
  if (!wrote) {
    return NextResponse.json(
      { ok: false, error: 'session_expired', message: authMessage('session_expired'), backend: 'cognito' },
      { status: 401 },
    );
  }
  return res;
}

export async function POST(request: NextRequest) {
  return rotate(request);
}

export async function GET(request: NextRequest) {
  const result = await rotate(request);
  const next = safeNextPath(request.nextUrl.searchParams.get('next')) ?? '/dashboard';
  if (result.status !== 200) {
    const login = request.nextUrl.clone();
    login.pathname = '/login';
    login.search = '';
    login.searchParams.set('reason', 'session_expired');
    login.searchParams.set('redirect', next);
    return NextResponse.redirect(login);
  }
  const dest = request.nextUrl.clone();
  dest.pathname = next;
  dest.search = '';
  const redirect = NextResponse.redirect(dest);
  const setCookie = result.headers.get('set-cookie');
  if (setCookie) redirect.headers.set('set-cookie', setCookie);
  return redirect;
}
