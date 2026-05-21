/**
 * Structured logger for VantaUM.
 *
 * Doctrine:
 *   - Production (NODE_ENV=production) → single-line JSON on stdout. Parses
 *     cleanly in CloudWatch / Vercel / any log aggregator.
 *   - Development → human-readable, color-prefixed lines.
 *   - Every API-route log line carries a `request_id` so a single request
 *     can be reconstructed across services. Use `withRequest(request)` to
 *     get a logger pre-bound to the current request context.
 *
 * PHI safety:
 *   - All payloads pass through sanitizeForLogging before serialization.
 *   - You can still leak PHI by template-string-interpolating it into a
 *     plain `message` — pass structured fields instead.
 *
 * Replacement strategy:
 *   - New code: `import { log } from '@/lib/log'`; `log.info('case_created', { case_id })`.
 *   - Legacy console.log/error sites stay supported but should migrate as
 *     they're touched.
 */

import { sanitizeForLogging, getRequestContext, type RequestContext } from './security';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogFields {
  [key: string]: unknown;
}

interface BoundContext {
  request_id?: string;
  path?: string;
  method?: string;
  ip?: string;
}

const IS_PROD = process.env.NODE_ENV === 'production';

function emit(level: LogLevel, message: string, fields: LogFields, ctx: BoundContext) {
  const sanitized = sanitizeForLogging({ ...fields }) as Record<string, unknown>;
  const record = {
    ts: new Date().toISOString(),
    level,
    msg: message,
    ...ctx,
    ...sanitized,
  };

  const line = IS_PROD ? JSON.stringify(record) : prettyLine(level, message, record);

  switch (level) {
    case 'error':
      console.error(line);
      break;
    case 'warn':
      console.warn(line);
      break;
    default:
      console.log(line);
  }
}

function prettyLine(level: LogLevel, message: string, record: Record<string, unknown>): string {
  const tag = `[${level.toUpperCase()}]`;
  const ctx = [
    record.request_id ? `req=${String(record.request_id).slice(0, 8)}` : null,
    record.path ? `path=${record.path}` : null,
  ]
    .filter(Boolean)
    .join(' ');
  const head = `${tag} ${message}${ctx ? ' ' + ctx : ''}`;
  const tail = Object.entries(record)
    .filter(([k]) => !['ts', 'level', 'msg', 'request_id', 'path', 'method', 'ip'].includes(k))
    .map(([k, v]) => `${k}=${typeof v === 'string' ? v : JSON.stringify(v)}`)
    .join(' ');
  return tail ? `${head} ${tail}` : head;
}

class Logger {
  private ctx: BoundContext;

  constructor(ctx: BoundContext = {}) {
    this.ctx = ctx;
  }

  debug(message: string, fields: LogFields = {}) {
    if (!IS_PROD) emit('debug', message, fields, this.ctx);
  }

  info(message: string, fields: LogFields = {}) {
    emit('info', message, fields, this.ctx);
  }

  warn(message: string, fields: LogFields = {}) {
    emit('warn', message, fields, this.ctx);
  }

  error(message: string, fields: LogFields = {}) {
    emit('error', message, fields, this.ctx);
  }

  /** Bind additional context to a derived logger. */
  with(extra: BoundContext): Logger {
    return new Logger({ ...this.ctx, ...extra });
  }
}

/** Module-level default logger. No request context bound. */
export const log = new Logger();

/**
 * Get a logger pre-bound to the request context (request_id, path, method, ip).
 * Call this at the top of an API route handler:
 *
 *   const reqLog = withRequest(request);
 *   reqLog.info('signup_received', { has_billing: !!body.billing });
 */
export function withRequest(request: Request, extra: BoundContext = {}): Logger {
  const url = new URL(request.url);
  const ctx: RequestContext = getRequestContext(request);
  return new Logger({
    request_id: ctx.requestId,
    path: url.pathname,
    method: request.method,
    ip: ctx.ip,
    ...extra,
  });
}
