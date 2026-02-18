/**
 * Security utilities for SOC 2 compliance infrastructure.
 *
 * - PHI sanitization for safe audit logging
 * - Request metadata extraction for audit trails
 * - In-memory rate limiting (swap for Redis in production)
 */

// ── PHI field patterns ─────────────────────────────────────────────────────

const PHI_FIELDS: Record<string, (value: unknown) => unknown> = {
  patient_name: (v) => {
    if (typeof v !== 'string' || v.length === 0) return 'REDACTED';
    return `${v.charAt(0)}***`;
  },
  patient_dob: () => 'REDACTED',
  patient_member_id: (v) => {
    if (typeof v !== 'string' || v.length < 4) return 'REDACTED';
    return `***${v.slice(-4)}`;
  },
  patient_gender: () => 'REDACTED',
  dea_number: () => 'REDACTED',
  contact_email: (v) => {
    if (typeof v !== 'string' || !v.includes('@')) return 'REDACTED';
    const [, domain] = v.split('@');
    return `***@${domain}`;
  },
  contact_phone: () => 'REDACTED',
  phone: () => 'REDACTED',
  email: (v) => {
    if (typeof v !== 'string' || !v.includes('@')) return 'REDACTED';
    const [, domain] = v.split('@');
    return `***@${domain}`;
  },
};

/**
 * Deep-clones and redacts PHI fields from an object before it is written to
 * audit logs or non-PHI-safe destinations.
 */
export function sanitizeForLogging(data: unknown): unknown {
  if (data === null || data === undefined) return data;
  if (typeof data !== 'object') return data;

  if (Array.isArray(data)) {
    return data.map((item) => sanitizeForLogging(item));
  }

  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
    const redactor = PHI_FIELDS[key];
    if (redactor) {
      sanitized[key] = redactor(value);
    } else if (typeof value === 'object' && value !== null) {
      sanitized[key] = sanitizeForLogging(value);
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized;
}

// ── Request context extraction ─────────────────────────────────────────────

export interface RequestContext {
  ip: string;
  userAgent: string;
  timestamp: string;
  requestId: string;
}

/**
 * Extracts audit-relevant metadata from an incoming request.
 * The returned `requestId` is a UUID v4 that can be used to correlate
 * log entries across a single request lifecycle.
 */
export function getRequestContext(request: Request): RequestContext {
  return {
    ip: request.headers.get('x-forwarded-for') || 'unknown',
    userAgent: request.headers.get('user-agent') || 'unknown',
    timestamp: new Date().toISOString(),
    requestId: crypto.randomUUID(),
  };
}

// ── Rate limiting (in-memory, MVP) ─────────────────────────────────────────

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const rateLimitMap = new Map<string, RateLimitEntry>();

// Periodic cleanup so the map doesn't grow unbounded (every 5 minutes)
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;
let lastCleanup = Date.now();

function cleanupExpiredEntries() {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL_MS) return;
  lastCleanup = now;
  for (const [key, entry] of rateLimitMap.entries()) {
    if (now > entry.resetAt) {
      rateLimitMap.delete(key);
    }
  }
}

/**
 * Simple sliding-window rate limiter.
 *
 * @param key       Unique identifier (e.g. IP address or user ID)
 * @param maxRequests  Maximum requests allowed within the window
 * @param windowMs     Window duration in milliseconds (default 60 000 = 1 min)
 * @returns `{ allowed, remaining }` — `allowed` is false when the limit is exceeded
 */
export function checkRateLimit(
  key: string,
  maxRequests: number = 100,
  windowMs: number = 60_000
): { allowed: boolean; remaining: number } {
  cleanupExpiredEntries();

  const now = Date.now();
  const entry = rateLimitMap.get(key);

  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: maxRequests - 1 };
  }

  entry.count += 1;

  if (entry.count > maxRequests) {
    return { allowed: false, remaining: 0 };
  }

  return { allowed: true, remaining: maxRequests - entry.count };
}
