import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { AUTH_CHALLENGES, authMessage, safeNextPath } from '@/lib/auth/account-flow';
import { beginAwsAuth, writeSessionCookie } from '@/lib/auth/public-route';
import { landingPathForRole } from '@/lib/auth-landing';
import { logSecurityEvent } from '@/lib/audit';
import { getRequestContext, redactEmail } from '@/lib/security';
import { withRequest } from '@/lib/log';

export const dynamic = 'force-dynamic';

const Body = z.object({
  email: z.string().email().max(320),
  session: z.string().min(1).max(8192),
  challenge: z.enum(AUTH_CHALLENGES),
  code: z.string().max(32).optional(),
  new_password: z.string().max(256).optional(),
  next: z.string().optional(),
});

export async function POST(request: NextRequest) {
  const log = withRequest(request);
  const ctx = getRequestContext(request);
  const opened = await beginAwsAuth(request, 10);
  if ('response' in opened) return opened.response;

  let body: z.infer<typeof Body>;
  try {
    body = Body.parse(await request.json());
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_input', message: authMessage('invalid_code') }, { status: 400 });
  }

  const email = body.email.toLowerCase().trim();
  const result = await opened.adapter.continueSignInChallenge({
    username: email,
    session: body.session,
    challenge: body.challenge,
    code: body.code,
    newPassword: body.new_password,
  });

  if (!result.ok) {
    if (result.code === 'challenge') {
      return NextResponse.json({
        ok: false,
        error: 'challenge',
        challenge: result.challenge,
        session: result.session,
        message: result.message,
        backend: 'cognito',
      });
    }
    if (result.message === 'weak_password') {
      return NextResponse.json({ ok: false, error: 'weak_password', message: authMessage('weak_password') }, { status: 400 });
    }
    const status = result.code === 'unavailable' ? 503 : result.code === 'rate_limited' ? 429 : 401;
    log.warn('challenge_failed', { code: result.code, recipient_email: redactEmail(email) });
    await logSecurityEvent('sign_in_failed', email, { code: result.code, step: 'challenge' }, ctx);
    return NextResponse.json(
      { ok: false, error: result.code, message: authMessage(result.code), backend: 'cognito' },
      { status },
    );
  }

  const next = safeNextPath(body.next) ?? landingPathForRole(result.role);
  const res = NextResponse.json({ ok: true, next, backend: 'cognito' });
  if (!writeSessionCookie(res, result.cookie)) {
    return NextResponse.json({ ok: false, error: 'session_expired', message: authMessage('session_expired') }, { status: 401 });
  }
  log.info('sign_in_success', { recipient_email: redactEmail(email), step: 'challenge' });
  await logSecurityEvent('sign_in_success', email, { step: body.challenge }, ctx);
  return res;
}
