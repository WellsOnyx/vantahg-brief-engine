import { NextResponse } from 'next/server';
import { checkRateLimit, getRequestContext } from './security';
import { logSecurityEvent } from './audit';

interface RateLimitOptions {
  maxRequests?: number;
  windowMs?: number;
}

/**
 * Applies rate limiting to an API route.
 * Returns a 429 response if the limit is exceeded, or null if the request is allowed.
 */
export async function applyRateLimit(
  request: Request,
  options: RateLimitOptions = {}
): Promise<NextResponse | null> {
  const { maxRequests = 200, windowMs = 60_000 } = options;
  const ctx = getRequestContext(request);
  const key = `${ctx.ip}:${new URL(request.url).pathname}`;

  const { allowed, remaining } = checkRateLimit(key, maxRequests, windowMs);

  if (!allowed) {
    await logSecurityEvent('rate_limit_exceeded', ctx.ip, {
      path: new URL(request.url).pathname,
      limit: maxRequests,
      window_ms: windowMs,
    }, ctx);

    return NextResponse.json(
      { error: 'Too many requests. Please try again later.' },
      {
        status: 429,
        headers: {
          'Retry-After': String(Math.ceil(windowMs / 1000)),
          'X-RateLimit-Limit': String(maxRequests),
          'X-RateLimit-Remaining': '0',
        },
      }
    );
  }

  // Attach rate limit headers (caller can add these to success response)
  // For now, return null to indicate the request is allowed
  void remaining;
  return null;
}
