import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { authMessage } from '@/lib/auth/account-flow';
import { beginAwsAuth } from '@/lib/auth/public-route';
import { withRequest } from '@/lib/log';
import { redactEmail } from '@/lib/security';

export const dynamic = 'force-dynamic';

const Body = z.object({
  email: z.string().email().max(320),
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

  const email = body.email.toLowerCase().trim();
  const result = await opened.adapter.forgotPassword(email);
  if (!result.ok && result.code !== 'invalid_code') {
    if (result.code === 'rate_limited') {
      return NextResponse.json({ ok: false, error: 'rate_limited', message: authMessage('rate_limited') }, { status: 429 });
    }
    if (result.code === 'unavailable') {
      return NextResponse.json({ ok: false, error: 'unavailable', message: authMessage('unavailable'), backend: 'cognito' }, { status: 503 });
    }
  }
  log.info('forgot_password', { recipient_email: redactEmail(email) });
  return NextResponse.json({
    ok: true,
    next: 'reset_code',
    message: 'If an account exists for that email, we sent a reset code.',
    backend: 'cognito',
  });
}
