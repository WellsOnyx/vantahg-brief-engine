import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  CognitoIdentityProviderClient,
  AdminInitiateAuthCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { SESSION_COOKIE_NAME } from '@/lib/adapters/auth/cognito';
import { applyRateLimit } from '@/lib/rate-limit-middleware';
import { logSecurityEvent } from '@/lib/audit';
import { getRequestContext, redactEmail } from '@/lib/security';
import { withRequest } from '@/lib/log';

export const dynamic = 'force-dynamic';

/**
 * POST /api/auth/sign-in
 *
 * Email + password sign-in through Cognito (ADMIN_USER_PASSWORD_AUTH).
 * On success, sets the `vantaum_session` HttpOnly cookie with the JSON
 * payload {id_token, access_token, refresh_token, expires_at} and returns
 * { ok: true, next }. The browser navigates client-side from there.
 *
 * Anti-enumeration: every failed sign-in returns the same generic error
 * regardless of whether the user exists or the password was wrong. The
 * structured log carries the specific failure reason for debugging.
 */

const Body = z.object({
  email: z.string().email().max(320),
  password: z.string().min(1).max(256),
  next: z.string().optional(),
});

const REGION = process.env.COGNITO_REGION || process.env.AWS_REGION || 'us-east-1';
const USER_POOL_ID = process.env.COGNITO_USER_POOL_ID || '';
const CLIENT_ID = process.env.COGNITO_CLIENT_ID || '';

const COOKIE_MAX_AGE_SEC = 3600 * 8; // 8h

let cachedClient: CognitoIdentityProviderClient | null = null;
function client(): CognitoIdentityProviderClient {
  if (!cachedClient) cachedClient = new CognitoIdentityProviderClient({ region: REGION });
  return cachedClient;
}

function safeNext(next: string | null | undefined): string {
  if (!next) return '/dashboard';
  if (!next.startsWith('/')) return '/dashboard';
  if (next.startsWith('//')) return '/dashboard';
  if (next.includes('\n') || next.includes('\r')) return '/dashboard';
  return next;
}

export async function POST(request: NextRequest) {
  const log = withRequest(request);
  const ctx = getRequestContext(request);

  const rateLimited = await applyRateLimit(request, { maxRequests: 10 });
  if (rateLimited) {
    log.warn('sign_in_rate_limited');
    return rateLimited;
  }

  if (!USER_POOL_ID || !CLIENT_ID) {
    log.error('sign_in_misconfigured', {
      has_pool: Boolean(USER_POOL_ID),
      has_client: Boolean(CLIENT_ID),
    });
    return NextResponse.json(
      { ok: false, error: 'auth_unavailable' },
      { status: 503 },
    );
  }

  let body: z.infer<typeof Body>;
  try {
    body = Body.parse(await request.json());
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_input' }, { status: 400 });
  }

  const email = body.email.toLowerCase().trim();
  const next = safeNext(body.next);

  try {
    const auth = await client().send(
      new AdminInitiateAuthCommand({
        UserPoolId: USER_POOL_ID,
        ClientId: CLIENT_ID,
        AuthFlow: 'ADMIN_USER_PASSWORD_AUTH',
        AuthParameters: {
          USERNAME: email,
          PASSWORD: body.password,
        },
      }),
    );

    const tokens = auth.AuthenticationResult;
    if (!tokens?.IdToken || !tokens?.AccessToken) {
      log.warn('sign_in_no_tokens', { recipient_email: redactEmail(email) });
      await logSecurityEvent('sign_in_no_tokens', email, {}, ctx);
      return NextResponse.json({ ok: false, error: 'invalid_credentials' }, { status: 401 });
    }

    const payload = {
      id_token: tokens.IdToken,
      access_token: tokens.AccessToken,
      refresh_token: tokens.RefreshToken,
      expires_at: Date.now() + (tokens.ExpiresIn ?? 3600) * 1000,
    };

    const res = NextResponse.json({ ok: true, next });
    res.cookies.set(SESSION_COOKIE_NAME, JSON.stringify(payload), {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: COOKIE_MAX_AGE_SEC,
    });

    log.info('sign_in_success', { recipient_email: redactEmail(email) });
    await logSecurityEvent('sign_in_success', email, {}, ctx);
    return res;
  } catch (err) {
    const name =
      err && typeof err === 'object' && 'name' in err
        ? String((err as { name: unknown }).name)
        : '';
    log.warn('sign_in_failed', {
      recipient_email: redactEmail(email),
      cognito_error: name || 'unknown',
    });
    await logSecurityEvent('sign_in_failed', email, { cognito_error: name }, ctx);

    // Anti-enumeration: same response shape for "no such user" and "bad password".
    return NextResponse.json({ ok: false, error: 'invalid_credentials' }, { status: 401 });
  }
}
