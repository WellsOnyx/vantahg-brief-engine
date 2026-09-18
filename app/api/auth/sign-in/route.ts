import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getAuthAdapter } from '@/lib/adapters/auth';
import {
  SESSION_COOKIE_NAME,
  sessionCookieOptions,
} from '@/lib/adapters/auth/cognito';
import { isAwsAuthEnabled } from '@/lib/runtime-backend';
import { applyRateLimit } from '@/lib/rate-limit-middleware';
import { logSecurityEvent } from '@/lib/audit';
import { getRequestContext, redactEmail } from '@/lib/security';
import { withRequest } from '@/lib/log';
import { landingPathForRole } from '@/lib/auth-landing';

export const dynamic = 'force-dynamic';

/**
 * POST /api/auth/sign-in
 *
 * Password sign-in. Backend is selected by ENABLE_AWS_AUTH:
 *
 *   true  → CognitoAuthAdapter.signInWithPassword (ADMIN_USER_PASSWORD_AUTH).
 *           Sets the `vantaum_session` HttpOnly cookie. Never falls through
 *           to Supabase Auth admin / SSR cookies.
 *   false → `{ backend: 'supabase' }` + 503 so the login page uses the
 *           existing `supabase.auth.signInWithPassword` browser path.
 *           Returned even when COGNITO_* ids are present on Fargate, so
 *           leftover pool ids cannot silently hijack hybrid login.
 *
 * Anti-enumeration: failed Cognito sign-in returns the same generic error
 * regardless of whether the user exists or the password was wrong.
 */

const Body = z.object({
  email: z.string().email().max(320),
  password: z.string().min(1).max(256),
  next: z.string().optional(),
});

function safeNext(next: string | null | undefined): string | null {
  if (!next) return null;
  if (!next.startsWith('/')) return null;
  if (next.startsWith('//')) return null;
  if (next.includes('\n') || next.includes('\r')) return null;
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

  if (!isAwsAuthEnabled()) {
    return NextResponse.json(
      { ok: false, error: 'use_supabase', backend: 'supabase' },
      { status: 503 },
    );
  }

  let body: z.infer<typeof Body>;
  try {
    body = Body.parse(await request.json());
  } catch {
    return NextResponse.json(
      { ok: false, error: 'invalid_input', backend: 'cognito' },
      { status: 400 },
    );
  }

  const email = body.email.toLowerCase().trim();
  const adapter = getAuthAdapter();
  const result = await adapter.signInWithPassword({
    email,
    password: body.password,
  });

  if (!result.ok) {
    if (result.code === 'unavailable') {
      log.error('sign_in_misconfigured', { detail: result.message });
      return NextResponse.json(
        { ok: false, error: 'auth_unavailable', backend: 'cognito' },
        { status: 503 },
      );
    }
    log.warn('sign_in_failed', {
      recipient_email: redactEmail(email),
      code: result.code,
    });
    await logSecurityEvent('sign_in_failed', email, { code: result.code }, ctx);
    return NextResponse.json(
      { ok: false, error: 'invalid_credentials', backend: 'cognito' },
      { status: 401 },
    );
  }

  let next = safeNext(body.next);
  if (!next) {
    next = await resolveLanding(email);
  }

  const res = NextResponse.json({ ok: true, next, backend: 'cognito' });
  res.cookies.set(SESSION_COOKIE_NAME, JSON.stringify(result.cookie), sessionCookieOptions());

  log.info('sign_in_success', { recipient_email: redactEmail(email) });
  await logSecurityEvent('sign_in_success', email, {}, ctx);
  return res;
}

async function resolveLanding(email: string): Promise<string> {
  try {
    const { getServiceClient } = await import('@/lib/supabase');
    const svc = getServiceClient();
    const { data } = await svc
      .from('user_profiles')
      .select('role')
      .eq('email', email)
      .maybeSingle();
    if (data?.role) return landingPathForRole(data.role as string);
  } catch {
    // Profile lookup is best-effort. Cognito custom:org_role is the
    // other source; adapter session is not available until the cookie
    // is set on the response.
  }
  return '/dashboard';
}
