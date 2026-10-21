/**
 * Med Review reviewer pool.
 *
 * Specialty, state license, credential status, daily capacity, and SLA
 * slack. Shared credentialing stays in lib/credentialing — callers pass
 * the boolean from evaluateAssignment (line MEDICAL_REVIEW). This module
 * does not auto-determine and does not read fees.
 *
 * Synthetic tokens only. Do not pass names, member ids, or free-text PHI.
 */

import { scoreLpnForCase } from '@/lib/delivery/lpn-scoring';

export type CredentialStatus = 'active' | 'lapsed' | 'missing';
export type EscalationLevel = 'none' | 'l1' | 'l2' | 'l3';

export interface PoolReviewer {
  id: string;
  specialty_codes: readonly string[];
  licensed_states: readonly string[];
  credential_status: CredentialStatus;
  /** False when evaluateAssignment denied the reviewer for this due date. */
  credential_ok: boolean;
  active_count: number;
  avg_turnaround_hours: number | null;
  max_cases_per_day: number | null;
  /** Empty means the reviewer may take any client. */
  client_ids?: readonly string[];
}

export interface PoolCase {
  id: string;
  client_id: string;
  specialty_code: string;
  state_code: string | null;
  due_at: string | null;
  received_at?: string | null;
  external_id?: string | null;
}

export type AssignReason =
  | 'assigned'
  | 'no_specialty'
  | 'no_license'
  | 'credential_blocked'
  | 'at_capacity'
  | 'tenant_blocked'
  | 'no_reviewer';

export interface PickResult {
  reviewer_id: string | null;
  reason: AssignReason;
  score: number | null;
  slack_hours: number | null;
  escalation: EscalationLevel;
}

export function intakeKey(clientId: string, externalId: string): string {
  return `${clientId.trim().toLowerCase()}::${externalId.trim().toLowerCase()}`;
}

export function escalationLevel(input: {
  receivedAt: string | null;
  dueAt: string | null;
  now: Date;
}): EscalationLevel {
  if (!input.dueAt) return 'none';
  const due = Date.parse(input.dueAt);
  if (Number.isNaN(due)) return 'none';
  if (input.now.getTime() >= due) return 'l3';
  if (!input.receivedAt) return 'none';
  const start = Date.parse(input.receivedAt);
  if (Number.isNaN(start) || due <= start) return 'none';
  const elapsed = (input.now.getTime() - start) / (due - start);
  if (elapsed >= 0.8) return 'l2';
  if (elapsed >= 0.5) return 'l1';
  return 'none';
}

function norm(value: string): string {
  return value.trim().toLowerCase();
}

function licensedFor(reviewer: PoolReviewer, stateCode: string | null): boolean {
  if (!stateCode) return true;
  const want = stateCode.trim().toUpperCase();
  if (!want) return true;
  return reviewer.licensed_states.some((state) => state.trim().toUpperCase() === want);
}

function specialtyMatch(reviewer: PoolReviewer, specialty: string): boolean {
  const want = norm(specialty);
  if (!want) return false;
  return reviewer.specialty_codes.some((code) => norm(code) === want);
}

function underCapacity(reviewer: PoolReviewer): boolean {
  if (reviewer.max_cases_per_day === null || reviewer.max_cases_per_day === undefined) return true;
  return reviewer.active_count < reviewer.max_cases_per_day;
}

function servesClient(reviewer: PoolReviewer, clientId: string): boolean {
  if (!reviewer.client_ids || reviewer.client_ids.length === 0) return true;
  return reviewer.client_ids.includes(clientId);
}

/**
 * Highest SLA slack wins. Load is the tie-break inside scoreLpnForCase.
 * Equal scores pick the lexicographically smaller reviewer id so the
 * choice is stable across retries.
 */
export function pickMedReviewer(
  reviewers: readonly PoolReviewer[],
  caseRow: PoolCase,
  now: Date = new Date(),
): PickResult {
  const escalation = escalationLevel({
    receivedAt: caseRow.received_at ?? null,
    dueAt: caseRow.due_at,
    now,
  });
  const empty: PickResult = {
    reviewer_id: null,
    reason: 'no_reviewer',
    score: null,
    slack_hours: null,
    escalation,
  };
  if (reviewers.length === 0) return empty;

  const specialty = reviewers.filter((r) => specialtyMatch(r, caseRow.specialty_code));
  if (specialty.length === 0) return { ...empty, reason: 'no_specialty' };

  const tenant = specialty.filter((r) => servesClient(r, caseRow.client_id));
  if (tenant.length === 0) return { ...empty, reason: 'tenant_blocked' };

  const licensed = tenant.filter((r) => licensedFor(r, caseRow.state_code));
  if (licensed.length === 0) return { ...empty, reason: 'no_license' };

  const credentialed = licensed.filter(
    (r) => r.credential_status === 'active' && r.credential_ok,
  );
  if (credentialed.length === 0) return { ...empty, reason: 'credential_blocked' };

  const open = credentialed.filter(underCapacity);
  if (open.length === 0) return { ...empty, reason: 'at_capacity' };

  let best: PoolReviewer | null = null;
  let bestScore = Number.NEGATIVE_INFINITY;
  let bestSlack: number | null = null;
  for (const reviewer of open) {
    const scored = scoreLpnForCase(
      {
        id: reviewer.id,
        activeCount: reviewer.active_count,
        avg_turnaround_hours: reviewer.avg_turnaround_hours,
      },
      { turnaround_deadline: caseRow.due_at },
      now,
    );
    if (
      scored.score > bestScore ||
      (scored.score === bestScore && best && reviewer.id < best.id)
    ) {
      best = reviewer;
      bestScore = scored.score;
      bestSlack = scored.slack_hours;
    }
  }
  if (!best) return empty;
  return {
    reviewer_id: best.id,
    reason: 'assigned',
    score: bestScore,
    slack_hours: bestSlack,
    escalation,
  };
}

export interface Assignment {
  case_id: string;
  client_id: string;
  reviewer_id: string | null;
  reason: AssignReason;
  escalation: EscalationLevel;
}

/**
 * Assign a batch. Each successful assignment increments that reviewer's
 * active count so later cases spread across the pool. Idempotent for a
 * case id already present in `alreadyAssigned`.
 */
export function assignPool(input: {
  cases: readonly PoolCase[];
  reviewers: readonly PoolReviewer[];
  alreadyAssigned?: ReadonlyMap<string, string>;
  now?: Date;
}): Assignment[] {
  const now = input.now ?? new Date();
  const reviewers = input.reviewers.map((r) => ({ ...r, specialty_codes: [...r.specialty_codes], licensed_states: [...r.licensed_states] }));
  const byId = new Map(reviewers.map((r) => [r.id, r]));
  const out: Assignment[] = [];
  for (const row of input.cases) {
    const prior = input.alreadyAssigned?.get(row.id);
    if (prior) {
      out.push({
        case_id: row.id,
        client_id: row.client_id,
        reviewer_id: prior,
        reason: 'assigned',
        escalation: escalationLevel({
          receivedAt: row.received_at ?? null,
          dueAt: row.due_at,
          now,
        }),
      });
      continue;
    }
    const pick = pickMedReviewer(reviewers, row, now);
    if (pick.reviewer_id) {
      const reviewer = byId.get(pick.reviewer_id);
      if (reviewer) reviewer.active_count += 1;
    }
    out.push({
      case_id: row.id,
      client_id: row.client_id,
      reviewer_id: pick.reviewer_id,
      reason: pick.reason,
      escalation: pick.escalation,
    });
  }
  return out;
}

export interface IntakeRow {
  client_id: string;
  external_id: string;
  specialty_code: string;
  state_code?: string | null;
  due_at?: string | null;
}

export interface BulkIntakePlan {
  create: IntakeRow[];
  duplicates: IntakeRow[];
  invalid: Array<{ external_id: string; client_id: string; reason: string }>;
}

/** Same client + external id is one case. Repeats in the batch or the store are duplicates. */
export function planBulkIntake(
  rows: readonly IntakeRow[],
  existingKeys: ReadonlySet<string> = new Set(),
): BulkIntakePlan {
  const seen = new Set(existingKeys);
  const plan: BulkIntakePlan = { create: [], duplicates: [], invalid: [] };
  for (const row of rows) {
    const clientId = typeof row.client_id === 'string' ? row.client_id.trim() : '';
    const externalId = typeof row.external_id === 'string' ? row.external_id.trim() : '';
    const specialty = typeof row.specialty_code === 'string' ? row.specialty_code.trim() : '';
    if (!clientId || !externalId || !specialty) {
      plan.invalid.push({
        client_id: clientId,
        external_id: externalId,
        reason: 'client_id, external_id, and specialty_code are required',
      });
      continue;
    }
    const key = intakeKey(clientId, externalId);
    if (seen.has(key)) {
      plan.duplicates.push(row);
      continue;
    }
    seen.add(key);
    plan.create.push(row);
  }
  return plan;
}

export interface PageQuery {
  /** Staff may filter. Client callers must pass viewerClientId; it wins. */
  clientId?: string | null;
  viewerClientId?: string | null;
  viewerIsClient: boolean;
  specialty?: string | null;
  state?: string | null;
  q?: string | null;
  cursor?: string | null;
  limit?: number;
}

export interface PageResult<T> {
  items: T[];
  next_cursor: string | null;
}

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

/**
 * Stable page over id order after filters. Client viewers are pinned to
 * their own client_id — a query for another tenant returns an empty page,
 * not the other tenant's rows.
 */
export function pageCases<T extends { id: string; client_id: string; specialty_code?: string | null; state_code?: string | null; external_id?: string | null }>(
  rows: readonly T[],
  query: PageQuery,
): PageResult<T> {
  const limit = Math.min(MAX_LIMIT, Math.max(1, query.limit ?? DEFAULT_LIMIT));
  if (query.viewerIsClient && !query.viewerClientId) {
    return { items: [], next_cursor: null };
  }
  const clientId = query.viewerIsClient ? query.viewerClientId : query.clientId;
  const specialty = query.specialty ? norm(query.specialty) : '';
  const state = query.state ? query.state.trim().toUpperCase() : '';
  const q = query.q ? query.q.trim().toLowerCase() : '';

  const filtered = rows.filter((row) => {
    if (clientId && row.client_id !== clientId) return false;
    if (specialty && norm(row.specialty_code ?? '') !== specialty) return false;
    if (state && (row.state_code ?? '').toUpperCase() !== state) return false;
    if (q) {
      const hay = `${row.id} ${row.external_id ?? ''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
  const ordered = [...filtered].sort((a, b) => a.id.localeCompare(b.id));
  const start = query.cursor ? ordered.findIndex((row) => row.id === query.cursor) + 1 : 0;
  const slice = ordered.slice(Math.max(0, start), Math.max(0, start) + limit);
  const last = slice[slice.length - 1];
  const more = last ? ordered.findIndex((row) => row.id === last.id) < ordered.length - 1 : false;
  return {
    items: slice,
    next_cursor: more && last ? last.id : null,
  };
}
