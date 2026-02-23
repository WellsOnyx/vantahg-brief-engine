import { getServiceClient } from './supabase';
import { isDemoMode } from './demo-mode';
import { sanitizeForLogging, type RequestContext } from './security';

// ── Core audit writer ──────────────────────────────────────────────────────

/**
 * Writes an entry to the audit_log table.
 *
 * All PHI inside `details` is automatically redacted via `sanitizeForLogging`
 * so that audit logs never contain raw patient data.
 *
 * An optional `requestContext` (IP, user-agent, request ID) is merged into the
 * details payload when provided.
 */
export async function logAuditEvent(
  caseId: string | null,
  action: string,
  actor: string,
  details?: Record<string, unknown>,
  requestContext?: RequestContext
) {
  const sanitizedDetails = details
    ? (sanitizeForLogging(details) as Record<string, unknown>)
    : {};

  const fullDetails: Record<string, unknown> = {
    ...sanitizedDetails,
    ...(requestContext
      ? {
          ip: requestContext.ip,
          user_agent: requestContext.userAgent,
          request_id: requestContext.requestId,
          event_timestamp: requestContext.timestamp,
        }
      : {}),
  };

  // In demo mode fall back to console logging
  if (isDemoMode()) {
    console.log(`[AUDIT] ${action} by ${actor}`, {
      case_id: caseId,
      ...fullDetails,
    });
    return;
  }

  try {
    const supabase = getServiceClient();
    const { error } = await supabase.from('audit_log').insert({
      case_id: caseId,
      action,
      actor,
      details: Object.keys(fullDetails).length > 0 ? fullDetails : null,
    });
    if (error) {
      console.error('Failed to write audit log:', error);
    }
  } catch (err) {
    console.error('Audit log write exception:', err);
  }
}

// ── Specialized audit helpers ──────────────────────────────────────────────

/**
 * Logs a data-access event (SOC 2 CC6.1 — logical access monitoring).
 * Call this when a user views / reads case data.
 */
export async function logDataAccess(
  caseId: string,
  actor: string,
  fieldsAccessed: string[],
  requestContext?: RequestContext
) {
  await logAuditEvent(
    caseId,
    'data_accessed',
    actor,
    { fields_accessed: fieldsAccessed },
    requestContext
  );
}

/**
 * Logs a clinical determination with full context for audit trail.
 */
export async function logDetermination(
  caseId: string,
  actor: string,
  determination: string,
  details: Record<string, unknown>,
  requestContext?: RequestContext
) {
  await logAuditEvent(
    caseId,
    'determination_made',
    actor,
    { determination, ...details },
    requestContext
  );
}

/**
 * Logs security-relevant events: authentication failures, rate-limit hits,
 * permission denials, etc.  These entries have no associated case_id.
 */
export async function logSecurityEvent(
  event: string,
  actor: string,
  details?: Record<string, unknown>,
  requestContext?: RequestContext
) {
  await logAuditEvent(null, `security:${event}`, actor, details, requestContext);
}

/**
 * Logs a chat message interaction for the audit trail.
 * Content is truncated and sanitized before logging.
 */
export async function logChatMessage(
  caseId: string | null,
  actor: string,
  messageRole: 'user' | 'assistant',
  messageContent: string,
  requestContext?: RequestContext
) {
  await logAuditEvent(
    caseId,
    `chat:${messageRole}_message`,
    actor,
    { message_preview: messageContent.substring(0, 200), role: messageRole },
    requestContext
  );
}
