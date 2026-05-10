import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';

// Routes that don't require authentication
const PUBLIC_ROUTES = ['/', '/login', '/signup', '/welcome', '/demo', '/site', '/api/health', '/api/external/submit', '/api/intake/efax', '/api/intake/email'];

// Founders Release auth pages must be public so providers can sign in.
const PUBLIC_FOUNDERS_ROUTES = ['/founders/portal/login', '/founders/portal/signup', '/founders/portal/auth-callback', '/api/founders/auth'];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Founders Release gate: in production, /founders/* is only served when
  // RELEASE_TRACK=founders is set on the deploy. Dev always allows it.
  if (pathname.startsWith('/founders') || pathname.startsWith('/api/founders')) {
    const enabled = process.env.RELEASE_TRACK === 'founders' || process.env.NODE_ENV === 'development';
    if (!enabled) {
      return new NextResponse('Not Found', { status: 404 });
    }
  }

  // Allow public routes (exact match for '/', prefix match for others)
  if (PUBLIC_ROUTES.some((route) => route === '/' ? pathname === '/' : pathname.startsWith(route))) {
    return NextResponse.next();
  }
  if (PUBLIC_FOUNDERS_ROUTES.some((route) => pathname.startsWith(route))) {
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

  // If no Supabase config (demo mode), allow all requests
  if (!supabaseUrl || !supabaseAnonKey) {
    return response;
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
