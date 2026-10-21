import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { authMessage, passwordPolicyError } from '@/lib/auth/account-flow';
import { beginAwsAuth } from '@/lib/auth/public-route';
import { logSecurityEvent } from '@/lib/audit';
import { getRequestContext } from '@/lib/security';

export const dynamic = 'force-dynamic';

const Body = z.object({
  email: z.string().email().max(320),
  code: z.string().min(1).max(32),
  password: z.string().min(1).max(256),
});

export async function POST(request: NextRequest) {
  const opened = await beginAwsAuth(request, 8);
  if ('response' in opened) return opened.response;

  let body: z.infer<typeof Body>;
  try {
    body = Body.parse(await request.json());
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_input', message: authMessage('invalid_code') }, { status: 400 });
  }

  const weak = passwordPolicyError(body.password);
  if (weak) {
    return NextResponse.json({ ok: false, error: weak, message: authMessage(weak) }, { status: 400 });
  }

  const email = body.email.toLowerCase().trim();
  const result = await opened.adapter.confirmForgotPassword({
    email,
    code: body.code,
    password: body.password,
  });
  if (!result.ok) {
    const status = result.code === 'rate_limited' ? 429 : result.code === 'unavailable' ? 503 : 400;
    await logSecurityEvent('password_reset_failed', email, { code: result.code }, getRequestContext(request));
    return NextResponse.json(
      { ok: false, error: result.code, message: authMessage(result.code), backend: 'cognito' },
      { status },
    );
  }
  await logSecurityEvent('password_reset', email, {}, getRequestContext(request));
  return NextResponse.json({
    ok: true,
    next: '/login',
    message: 'Password updated. Sign in with the new password.',
    backend: 'cognito',
  });
}
