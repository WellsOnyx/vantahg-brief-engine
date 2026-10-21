import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { authMessage } from '@/lib/auth/account-flow';
import { beginAwsAuth } from '@/lib/auth/public-route';
import { withRequest } from '@/lib/log';
import { redactEmail } from '@/lib/security';

export const dynamic = 'force-dynamic';

/**
 * POST /api/auth/confirm
 *
 * Confirms a Cognito sign-up code and stamps org_role=client on the
 * Med Review line. The account still has no client_id until an admin
 * invite or profile link binds the organization.
 *
 * Body `{ resend: true }` sends another code and does not confirm.
 */

const Body = z.object({
  email: z.string().email().max(320),
  code: z.string().min(1).max(32).optional(),
  resend: z.boolean().optional(),
});

export async function POST(request: NextRequest) {
  const log = withRequest(request);
  const opened = await beginAwsAuth(request, 10);
  if ('response' in opened) return opened.response;

  let body: z.infer<typeof Body>;
  try {
    body = Body.parse(await request.json());
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_input', message: authMessage('invalid_code') }, { status: 400 });
  }

  const email = body.email.toLowerCase().trim();
  if (body.resend) {
    const resent = await opened.adapter.resendConfirmation(email);
    if (!resent.ok) {
      const status = resent.code === 'rate_limited' ? 429 : resent.code === 'unavailable' ? 503 : 400;
      return NextResponse.json(
        { ok: false, error: resent.code, message: authMessage(resent.code), backend: 'cognito' },
        { status },
      );
    }
    return NextResponse.json({
      ok: true,
      next: 'code_resent',
      message: 'If an unconfirmed account exists, we sent another code.',
      backend: 'cognito',
    });
  }

  if (!body.code) {
    return NextResponse.json({ ok: false, error: 'invalid_code', message: authMessage('invalid_code') }, { status: 400 });
  }

  const result = await opened.adapter.confirmSignUp({ email, code: body.code });
  if (!result.ok) {
    const status = result.code === 'rate_limited' ? 429 : result.code === 'unavailable' ? 503 : 400;
    log.warn('confirm_sign_up_failed', { code: result.code, recipient_email: redactEmail(email) });
    return NextResponse.json(
      { ok: false, error: result.code, message: authMessage(result.code), backend: 'cognito' },
      { status },
    );
  }
  log.info('confirm_sign_up', { recipient_email: redactEmail(email) });
  return NextResponse.json({
    ok: true,
    next: '/login',
    message: 'Email confirmed. Sign in. An admin still links your organization before cases appear.',
    backend: 'cognito',
  });
}
