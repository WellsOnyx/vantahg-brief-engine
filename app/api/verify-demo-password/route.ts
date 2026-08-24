import { NextRequest, NextResponse } from 'next/server';
import {
  DEMO_PREVIEW_COOKIE,
  DEMO_PREVIEW_VALUE,
  demoPreviewCookieOptions,
} from '@/lib/demo-preview-cookie';

export async function POST(request: NextRequest) {
  try {
    const { password } = await request.json();

    const correctPassword = process.env.DEMO_PASSWORD;

    if (!correctPassword) {
      // If no password is configured, block access (safety)
      return NextResponse.json(
        { error: 'Preview is currently closed.' },
        { status: 503 }
      );
    }

    if (password !== correctPassword) {
      return NextResponse.json(
        { error: 'Incorrect password' },
        { status: 401 }
      );
    }

    // Success — set cookie and return ok
    const res = NextResponse.json({ ok: true });
    res.cookies.set(DEMO_PREVIEW_COOKIE, DEMO_PREVIEW_VALUE, demoPreviewCookieOptions());

    return res;
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
}

// Also support direct link sharing: /api/verify-demo-password?pw=secret
// This is useful so you can give people vantaum.com?pw=YOURPASSWORD
export async function GET(request: NextRequest) {
  const pw = request.nextUrl.searchParams.get('pw');
  const correctPassword = process.env.DEMO_PASSWORD;

  if (!pw || !correctPassword || pw !== correctPassword) {
    return NextResponse.redirect(new URL('/demo-password', request.url));
  }

  const res = NextResponse.redirect(new URL('/demo', request.url));
  res.cookies.set(DEMO_PREVIEW_COOKIE, DEMO_PREVIEW_VALUE, demoPreviewCookieOptions());

  return res;
}
