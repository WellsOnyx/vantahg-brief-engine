import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';

/**
 * Magic-link callback. Supabase redirects here after the user clicks
 * the email link; we exchange the auth code for a session cookie and
 * forward the user to `next` (defaulting to the portal home).
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const next = url.searchParams.get('next') || '/firstmover/portal';

  if (!code) {
    return NextResponse.redirect(new URL('/firstmover/portal/login?err=missing_code', request.url));
  }

  const supabase = await createServerClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(
      new URL(`/firstmover/portal/login?err=${encodeURIComponent(error.message)}`, request.url)
    );
  }

  return NextResponse.redirect(new URL(next, request.url));
}
