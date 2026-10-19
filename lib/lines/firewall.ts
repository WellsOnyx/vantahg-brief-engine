import type {
  FirewallAuditEvent,
  LineAccessDecision,
  LineActor,
  LineOfBusiness,
  LineOperation,
  LineScopedRecord,
} from './types';

export interface FirewallOptions {
  now?: () => string;
  audit?: FirewallAuditEvent[];
}

function deny(
  actor: LineActor,
  record: LineScopedRecord,
  op: LineOperation,
  code: LineAccessDeniedCode,
  message: string,
  options: FirewallOptions | undefined,
): LineAccessDecision {
  options?.audit?.push({
    type: 'line_access_denied',
    at: options.now ? options.now() : new Date().toISOString(),
    actor_id: actor.id,
    record_id: record.id,
    case_id: record.case_id,
    op,
    code,
    actor_lines: actor.lines,
    record_line: record.line_of_business,
  });
  return { allowed: false, code, message };
}

type LineAccessDeniedCode = 'cross_line' | 'cross_company' | 'case_not_assigned';

/**
 * Server-side line check. UI hiding is not a control.
 * A Medical Review contract does not satisfy this function; callers pass
 * only lines the actor is explicitly entitled to.
 */
export function authorizeLineAccess(
  actor: LineActor,
  record: LineScopedRecord,
  op: LineOperation,
  options?: FirewallOptions,
): LineAccessDecision {
  if (!actor.lines.includes(record.line_of_business)) {
    return deny(
      actor,
      record,
      op,
      'cross_line',
      `Access denied: ${record.line_of_business} is outside this actor's lines.`,
      options,
    );
  }
  if (!actor.companies.includes(record.company)) {
    return deny(
      actor,
      record,
      op,
      'cross_company',
      'Access denied: company does not match.',
      options,
    );
  }
  const caseBound = actor.case_restricted && !actor.line_wide;
  if (caseBound && !actor.assigned_case_ids.includes(record.case_id)) {
    return deny(
      actor,
      record,
      op,
      'case_not_assigned',
      'Access denied: actor is not assigned to this case.',
      options,
    );
  }
  return { allowed: true, code: 'allowed' };
}

export interface LineQuery {
  line: LineOfBusiness;
}

export interface LineQuerySuccess<T> {
  ok: true;
  line: LineOfBusiness;
  rows: T[];
}

export interface LineQueryFailure {
  ok: false;
  code: 'cross_line' | 'cross_company' | 'case_not_assigned';
  message: string;
  rows: [];
}

/**
 * Line-level gate for a report, export, or search.
 * Case assignment is applied to each row afterward, so asking for your own
 * line is not itself a case-assignment failure.
 */
export function authorizeLineScope(
  actor: LineActor,
  line: LineOfBusiness,
  op: LineOperation,
  options?: FirewallOptions,
): LineAccessDecision {
  const probe: LineScopedRecord = {
    id: `query:${op}:${line}`,
    case_id: `query:${op}:${line}`,
    company: 'VANTA_HG',
    line_of_business: line,
    kind: op === 'report' || op === 'export' || op === 'search' ? op : 'case',
  };
  if (!actor.lines.includes(line)) {
    return deny(actor, probe, op, 'cross_line', `Access denied: ${line} is outside this actor's lines.`, options);
  }
  if (!actor.companies.includes(probe.company)) {
    return deny(actor, probe, op, 'cross_company', 'Access denied: company does not match.', options);
  }
  return { allowed: true, code: 'allowed' };
}

function queryLine<T extends LineScopedRecord>(
  actor: LineActor,
  records: readonly T[],
  query: LineQuery,
  op: LineOperation,
  options?: FirewallOptions,
): LineQuerySuccess<T> | LineQueryFailure {
  const gate = authorizeLineScope(actor, query.line, op, options);
  if (!gate.allowed) {
    return { ok: false, code: gate.code, message: gate.message, rows: [] };
  }
  const rows = records.filter((record) => {
    if (record.line_of_business !== query.line) return false;
    return authorizeLineAccess(actor, record, op).allowed;
  });
  return { ok: true, line: query.line, rows };
}

export function searchLine<T extends LineScopedRecord>(
  actor: LineActor,
  records: readonly T[],
  query: LineQuery,
  options?: FirewallOptions,
): LineQuerySuccess<T> | LineQueryFailure {
  return queryLine(actor, records, query, 'search', options);
}

export function reportLine<T extends LineScopedRecord>(
  actor: LineActor,
  records: readonly T[],
  query: LineQuery,
  options?: FirewallOptions,
): LineQuerySuccess<T> | LineQueryFailure {
  return queryLine(actor, records, query, 'report', options);
}

export function exportLine<T extends LineScopedRecord>(
  actor: LineActor,
  records: readonly T[],
  query: LineQuery,
  options?: FirewallOptions,
): LineQuerySuccess<T> | LineQueryFailure {
  return queryLine(actor, records, query, 'export', options);
}

/**
 * Med Review packaging entitlement is a different gate and does not open IRO or IDR.
 * Explicit line grants are the only input that counts here.
 */
export function linesFromExplicitGrants(input: {
  vanta_med_review_contract?: boolean | null;
  explicit_lines?: readonly LineOfBusiness[] | null;
}): LineOfBusiness[] {
  return [...(input.explicit_lines ?? [])];
}
