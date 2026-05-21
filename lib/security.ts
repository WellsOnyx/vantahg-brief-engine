/**
 * Security utilities for SOC 2 compliance infrastructure.
 *
 * - PHI sanitization for safe audit logging
 * - Request metadata extraction for audit trails
 * - In-memory rate limiting (swap for Redis in production)
 */

// ── PHI field patterns ─────────────────────────────────────────────────────

const PHI_FIELDS: Record<string, (value: unknown) => unknown> = {
  // Patient identifiers
  patient_name: (v) => initialize(v),
  patient_first_name: (v) => initialize(v),
  patient_last_name: (v) => initialize(v),
  patient_dob: () => 'REDACTED',
  patient_member_id: (v) => lastFour(v),
  member_id: (v) => lastFour(v),
  patient_gender: () => 'REDACTED',
  patient_address: () => 'REDACTED',
  patient_phone: () => 'REDACTED',
  ssn: () => 'REDACTED',
  // Provider identifiers
  dea_number: () => 'REDACTED',
  npi: (v) => lastFour(v),
  // Generic contact info (both `contact_*` and bare keys)
  contact_email: (v) => maskEmail(v),
  contact_phone: () => 'REDACTED',
  contact_name: (v) => initialize(v),
  email: (v) => maskEmail(v),
  phone: () => 'REDACTED',
  // Recipient shapes used by notification helpers
  recipient_email: (v) => maskEmail(v),
  recipient_phone: () => 'REDACTED',
  recipient_name: (v) => initialize(v),
  // Generic `to` field on email/SMS adapters
  to: (v) => {
    if (typeof v === 'string' && v.includes('@')) return maskEmail(v);
    return 'REDACTED';
  },
  // Fax numbers
  from_number: () => 'REDACTED',
  to_number: () => 'REDACTED',
  fax_number: () => 'REDACTED',
};

function initialize(v: unknown): string {
  if (typeof v !== 'string' || v.length === 0) return 'REDACTED';
  return `${v.charAt(0)}***`;
}
function lastFour(v: unknown): string {
  if (typeof v !== 'string' || v.length < 4) return 'REDACTED';
  return `***${v.slice(-4)}`;
}
function maskEmail(v: unknown): string {
  if (typeof v !== 'string' || !v.includes('@')) return 'REDACTED';
  const [, domain] = v.split('@');
  return `***@${domain}`;
}

/**
 * Redact a single email — keep the domain so support can debug routing,
 * never expose the user identifier. "alice@health.com" → "***@health.com".
 */
export function redactEmail(value: unknown): string {
  if (typeof value !== 'string' || !value.includes('@')) return 'REDACTED';
  const [, domain] = value.split('@');
  return `***@${domain}`;
}

/**
 * Redact a phone number to a country-code-and-last-2 shape so on-call can
 * tell roughly where it routed without learning the line.
 * "+12035551234" → "+1***34". Anything that doesn't parse → "REDACTED".
 */
export function redactPhone(value: unknown): string {
  if (typeof value !== 'string' || value.length < 4) return 'REDACTED';
  const digits = value.replace(/\D/g, '');
  if (digits.length < 4) return 'REDACTED';
  const last2 = digits.slice(-2);
  const cc = value.startsWith('+') ? `+${digits.slice(0, digits.length > 10 ? 1 : 0)}` : '';
  return `${cc}***${last2}`;
}

/**
 * Redact a person's name to first initial + asterisks.
 * "Alice Johnson" → "A***". Empty / non-string → "REDACTED".
 */
export function redactName(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0) return 'REDACTED';
  return `${value.charAt(0)}***`;
}

/**
 * Safe console.log replacement. Sanitizes any object arguments through
 * sanitizeForLogging and leaves primitives alone. Use this any time you'd
 * write console.log but the payload might contain PHI.
 *
 *   safeLog('[NOTIFICATION]', { recipient_email, subject });
 *
 * NEVER do template-string interpolation of PHI before passing in — the
 * string is already exfiltrated at that point. Pass structured fields.
 */
export function safeLog(prefix: string, ...args: unknown[]) {
  console.log(prefix, ...args.map((a) => (typeof a === 'object' && a !== null ? sanitizeForLogging(a) : a)));
}

export function safeError(prefix: string, ...args: unknown[]) {
  console.error(prefix, ...args.map((a) => (typeof a === 'object' && a !== null ? sanitizeForLogging(a) : a)));
}

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
