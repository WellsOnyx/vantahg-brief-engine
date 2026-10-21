import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { authMessage, passwordPolicyError } from '@/lib/auth/account-flow';
import { beginAwsAuth } from '@/lib/auth/public-route';
import { withRequest } from '@/lib/log';
import { redactEmail } from '@/lib/security';

export const dynamic = 'force-dynamic';

/**
 * POST /api/auth/sign-up
 *
 * Cognito self-serve client account. Sends a confirmation code.
 * Does not grant a staff role. An existing address returns the same
 * confirm_email step so the response does not reveal registration.
 */

const Body = z.object({
  email: z.string().email().max(320),
  password: z.string().min(1).max(256),
  full_name: z.string().max(120).optional(),
});

export async function POST(request: NextRequest) {
  const log = withRequest(request);
  const opened = await beginAwsAuth(request, 8);
  if ('response' in opened) return opened.response;

  let body: z.infer<typeof Body>;
  try {
    body = Body.parse(await request.json());
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_input', message: authMessage('invalid_email') }, { status: 400 });
  }

  const weak = passwordPolicyError(body.password);
  if (weak) {
    return NextResponse.json({ ok: false, error: weak, message: authMessage(weak) }, { status: 400 });
  }

  const email = body.email.toLowerCase().trim();
  const result = await opened.adapter.signUp({
    email,
    password: body.password,
    fullName: body.full_name,
  });
  if (!result.ok) {
    const status = result.code === 'unavailable' ? 503 : result.code === 'rate_limited' ? 429 : 400;
    log.warn('sign_up_failed', { code: result.code });
    return NextResponse.json(
      { ok: false, error: result.code, message: authMessage(result.code), backend: 'cognito' },
      { status },
    );
  }
  log.info('sign_up_code_sent', { recipient_email: redactEmail(email) });
  return NextResponse.json({
    ok: true,
    next: 'confirm_email',
    message: 'If this address can be registered, we sent a confirmation code.',
    backend: 'cognito',
  });
}
