import { NextResponse } from 'next/server';
import { logAuditEvent } from './audit';
import type { RequestContext } from './security';

export interface ApiErrorOptions {
  /**
   * Short, low-cardinality identifier for what was being attempted
   * (e.g. `'fetch_case'`, `'update_case'`, `'generate_brief'`). Becomes part
   * of the audit log `action` so support can grep for it.
   */
  operation: string;
  caseId?: string | null;
  /** User email or `'system'`. Defaults to `'system'`. */
  actor?: string;
  requestContext?: RequestContext;
  /** HTTP status returned to the client. Defaults to 500. */
  status?: number;
  /**
   * Generic message returned in the response body. Defaults to
   * `'Internal server error'`. Never include caught error text here — that's
   * what this helper exists to prevent.
   */
  clientMessage?: string;
  /**
   * When true, the audit `action` is prefixed `security:` so SOC 2 dashboards
   * pick it up. Use for auth failures, invalid signatures, blocked requests.
   */
  security?: boolean;
}

/**
 * Centralized error handler for API routes.
 *
 * What it does:
 *   - Captures a low-cardinality, PHI-safe description of the error (class
 *     name, code, status) into the audit log.
 *   - Emits a structured console line so Vercel logs are useful without
 *     echoing the raw error text (which may contain PHI from a Supabase or
 *     Anthropic upstream).
 *   - Returns a generic client response that says nothing about the failure.
 *
 * What it deliberately does NOT do: send `error.message`, `error.stack`,
 * `error.details`, or any other free-text upstream field to either the audit
 * log or the client. Supabase PostgREST errors can include row values
 * (`Key (member_id)=(ABC123) already exists`), and Anthropic errors can echo
 * back prompt fragments — both are PHI risks.
 */
export async function apiError(
  err: unknown,
  opts: ApiErrorOptions,
): Promise<NextResponse> {
  const status = opts.status ?? 500;
  const clientMessage = opts.clientMessage ?? 'Internal server error';
  const action = opts.security
    ? `security:${opts.operation}_failed`
    : `error:${opts.operation}`;

  const meta = describeError(err);
  console.error(`[api-error] ${action}`, meta);

  try {
    await logAuditEvent(
      opts.caseId ?? null,
      action,
      opts.actor ?? 'system',
      meta,
      opts.requestContext,
    );
  } catch {
    // Audit write itself failed — already logged to console above. No retry
    // here: this path runs inside an error handler and must not throw.
  }

  return NextResponse.json({ error: clientMessage }, { status });
}

/**
 * Builds a stable metadata record from an unknown thrown value.
 *
 * Includes ONLY:
 *   - `kind`: the error class name (`'Error'`, `'PostgrestError'`, …)
 *   - `code`: provider-issued error code (`'PGRST116'`, `'invalid_request_error'`)
 *   - `status`: HTTP status if the error has one
 *
 * Does NOT include the raw `message`, `stack`, `hint`, or `details` —
 * those can contain row values from upstream APIs.
 */
function describeError(err: unknown): Record<string, unknown> {
  if (err === null || err === undefined) {
    return { kind: 'unknown' };
  }
  if (err instanceof Error) {
    const e = err as Error & { code?: unknown; status?: unknown };
    return {
      kind: err.name || 'Error',
      code: stringOrNull(e.code),
      status: numberOrNull(e.status),
    };
  }
  if (typeof err === 'object') {
    const obj = err as Record<string, unknown>;
    return {
      kind: 'object',
      code: stringOrNull(obj.code),
      status: numberOrNull(obj.status),
    };
  }
  return { kind: typeof err };
}

function stringOrNull(v: unknown): string | null {
  if (typeof v === 'string' && v.length > 0) return v;
  if (typeof v === 'number') return String(v);
  return null;
}

function numberOrNull(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}
