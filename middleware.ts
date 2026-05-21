import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { isDemoMode } from '@/lib/demo-mode';

// Public marketing / auth-flow page prefixes. `startsWith` semantics are
// intentional here because routes like `/signup-tpa` and `/demo-tour` are
// real pages that should remain reachable without auth.
const PUBLIC_PAGE_PREFIXES = ['/login', '/signup', '/sign-up', '/magic-link', '/forgot-password', '/welcome', '/demo', '/site'];

// Protected portal paths — these require an authenticated + approved TPA / Provider
const TPA_PORTAL_PREFIX = '/portal/tpa';
const PROVIDER_PORTAL_PREFIX = '/portal/provider';

// Public API endpoints. STRICT matching — `/api/intake/efax/queue` is a
// CSR-only triage surface that must NOT be reachable just because it
// shares the `/api/intake/efax` prefix. Webhooks self-authenticate via
// HMAC where applicable.
const PUBLIC_EXACT = new Set([
  '/',
  '/api/health',
  '/api/external/submit',
  '/api/intake/efax', // generic webhook (HMAC-protected, see app/api/intake/efax/route.ts)
  '/api/intake/email', // email intake webhook
  '/api/auth/callback', // Cognito magic-link landing — user is unauthenticated by definition
  '/api/auth/request-magic-link', // unauthenticated by definition; rate-limited internally
]);

// Public API prefixes whose sub-paths are themselves public. The trailing
// slash boundary prevents `/api/intake/efax/phaxio` from also matching
// something like `/api/intake/efax/phaxio-queue` if that's ever added.
const PUBLIC_API_PREFIXES = ['/api/intake/efax/phaxio'];

function isPublicRoute(pathname: string): boolean {
  if (PUBLIC_EXACT.has(pathname)) return true;
  if (PUBLIC_PAGE_PREFIXES.some((p) => pathname.startsWith(p))) return true;
  if (PUBLIC_API_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + '/'))) return true;
  return false;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isPublicRoute(pathname)) {
    return NextResponse.next();
  }

  // Allow static assets and Next.js internals
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon') ||
    pathname.includes('.')
  ) {
    return NextResponse.next();
  }

  let response = NextResponse.next({
    request: { headers: request.headers },
  });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '';

  // Fail-closed when auth config is missing.
  // Demo mode (NEXT_PUBLIC_DEMO_MODE=true) is the only legitimate empty-config state and is
  // explicitly opted into. Outside demo mode, missing config means the deploy is broken — block
  // protected routes rather than silently allowing them through.
  if (!supabaseUrl || !supabaseAnonKey) {
    if (isDemoMode()) {
      return response;
    }
    if (pathname.startsWith('/api/')) {
      return NextResponse.json(
        { error: 'auth_unavailable', detail: 'Authentication backend is not configured on this deployment.' },
        { status: 503 },
      );
    }
    const errorUrl = request.nextUrl.clone();
    errorUrl.pathname = '/login';
    errorUrl.searchParams.set('reason', 'auth_unavailable');
    return NextResponse.redirect(errorUrl);
  }

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value)
        );
        response = NextResponse.next({
          request: { headers: request.headers },
        });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        );
      },
    },
  });

  // Refresh session (important for keeping tokens alive)
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user && !pathname.startsWith('/api/')) {
    // Redirect unauthenticated page requests to login
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = '/login';
    loginUrl.searchParams.set('redirect', pathname + request.nextUrl.search);

    // Special handling for portal paths (Item 9)
    if (pathname.startsWith(TPA_PORTAL_PREFIX) || pathname.startsWith(PROVIDER_PORTAL_PREFIX)) {
      loginUrl.searchParams.set('reason', 'portal_access_required');
    }

    return NextResponse.redirect(loginUrl);
  }

  if (!user && pathname.startsWith('/api/')) {
    // API routes handle their own 401 via auth-guard
    return response;
  }

  // Set user context headers for API routes
  if (user) {
    response.headers.set('x-user-id', user.id);
    response.headers.set('x-user-email', user.email || '');
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon)
     */
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
