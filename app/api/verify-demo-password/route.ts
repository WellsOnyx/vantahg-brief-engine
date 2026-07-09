import { NextRequest, NextResponse } from 'next/server';
import { getDemoPassword } from '@/lib/demo-password';

const COOKIE_OPTS = {
  // not httpOnly so client-side pages (dashboard, cases) can detect the cookie
  // and force synthetic data instead of hitting protected APIs that 401 in prod demo
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
  maxAge: 60 * 60 * 24 * 30, // 30 days
};

export async function POST(request: NextRequest) {
  try {
    const { password } = await request.json();

    if (password !== getDemoPassword()) {
      return NextResponse.json(
        { error: 'Incorrect password' },
        { status: 401 }
      );
    }

    // Success — set cookie and return ok
    const res = NextResponse.json({ ok: true });
    res.cookies.set('demo_access', 'granted', COOKIE_OPTS);

    return res;
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
}

// Also support direct link sharing: /api/verify-demo-password?pw=secret
// This is useful so you can give people vantaum.com?pw=YOURPASSWORD
export async function GET(request: NextRequest) {
  const pw = request.nextUrl.searchParams.get('pw');

  if (!pw || pw !== getDemoPassword()) {
    return NextResponse.redirect(new URL('/demo-password', request.url));
  }

  const res = NextResponse.redirect(new URL('/demo', request.url));
  res.cookies.set('demo_access', 'granted', COOKIE_OPTS);

  return res;
}
