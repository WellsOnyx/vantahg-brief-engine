/**
 * Safe case-edit pipeline for admin/reviewer mutations.
 *
 * Distinct from PATCH /api/cases/[id] (which accepts arbitrary fields and
 * exists for the assignment/determination workflow). This module enforces:
 *
 *   1. Field allowlist by role — admins can change status; reviewers can't.
 *   2. Enum validation — priority and status are checked against the
 *      type-system enums, not just "any string."
 *   3. Diff-based audit — every change writes a `case_edited` audit event
 *      with the before/after for each field, so the audit log is the
 *      immutable record of who changed what and when. Long text fields
 *      log a 200-char preview (PHI-aware: notes may legitimately reference
 *      patient info), matching the chat-message audit convention.
 *
 * Single source of truth for "which fields can be edited via this surface."
 * Adding a new editable field is: add it to EditableFields, add to the
 * role allowlist, and (for enums) add to ENUM_VALIDATORS.
 */

import type { CasePriority, CaseStatus } from './types';
import type { UserRole } from './auth-guard';

// ── Allowlist + validation ────────────────────────────────────────────────

/**
 * Fields that may be set via /api/cases/[id]/edit. Anything else in the
 * request body is silently dropped — we deliberately do not 400 on extra
 * fields so a client sending the full case row can still call the endpoint
 * with just a few fields actually changed.
 */
export interface EditableFields {
  priority?: CasePriority;
  status?: CaseStatus;
  clinical_question?: string | null;
  internal_notes?: string | null;
}

export const EDITABLE_FIELDS_BY_ROLE: Record<UserRole, ReadonlyArray<keyof EditableFields>> = {
  admin: ['priority', 'status', 'clinical_question', 'internal_notes'],
  // Reviewers can update clinical context + priority but NOT the case
  // status — status overrides are an admin-level operation (they can move
  // a case out of pend_missing_info, skip tiers, etc., all of which affect
  // SLA computation).
  reviewer: ['priority', 'clinical_question', 'internal_notes'],
  // Clients cannot edit cases through this surface; assertCaseAccess on
  // the route refuses them anyway. Listed empty for completeness.
  client: [],
  // Organizational / exec roles (added in migration 011) have read access
  // via RLS but no edit privileges on case fields. If a CEO needs to
  // change priority, they wear the admin hat by reassigning their own
  // role from /team.
  builder: [],
  ceo: [],
  'practice-lead': [],
  slt: [],
  // Delivery-side roles (added in migration 016). They see cases via RLS
  // for routing + load views but don't edit case fields directly. If a DL
  // needs to override they wear the admin hat.
  'delivery-lead': [],
  concierge: [],
  'idr-attorney': [],
};

const PRIORITY_VALUES: ReadonlySet<string> = new Set<CasePriority>([
  'standard', 'urgent', 'expedited',
]);

const STATUS_VALUES: ReadonlySet<string> = new Set<CaseStatus>([
  'intake', 'processing', 'brief_ready', 'lpn_review', 'rn_review',
  'md_review', 'pend_missing_info', 'determination_made', 'delivered',
]);

// Cap on internal_notes length. Generous — these are clinical/admin notes,
// not chat messages — but bounded so a single edit can't insert megabytes.
const MAX_INTERNAL_NOTES_CHARS = 20_000;
const MAX_CLINICAL_QUESTION_CHARS = 4_000;

// ── Diff shape ────────────────────────────────────────────────────────────

interface ScalarChange {
  field: string;
  before: string | null;
  after: string | null;
}

interface TextChange {
  field: string;
  before_length: number;
  after_length: number;
  before_preview: string | null;
  after_preview: string | null;
}

export type FieldChange = ScalarChange | TextChange;

/**
 * Minimal slice of the existing case row we need to diff against. Accepts
 * a loose shape so route callers can pass whatever Supabase returned.
 */
export interface CaseSnapshot {
  id: string;
  priority?: string | null;
  status?: string | null;
  clinical_question?: string | null;
  internal_notes?: string | null;
}

export interface ApplyEditResult {
  ok: true;
  /** Field-level changes for the audit event. Empty if the edit was a no-op. */
  changes: FieldChange[];
  /** The fields-to-update payload to pass to Supabase. */
  patch: Record<string, unknown>;
}

export interface ApplyEditValidationErr {
  ok: false;
  reason: string;
}

export type ApplyEditOutcome = ApplyEditResult | ApplyEditValidationErr;

// ── Core: validate + diff ────────────────────────────────────────────────

/**
 * Validates an edit request against the role allowlist + enum + length
 * rules, and produces (a) the Supabase patch payload and (b) the audit
 * diff. Does NOT touch the database — the route does that, then passes
 * `changes` to logAuditEvent.
 */
export function buildCaseEdit(
  current: CaseSnapshot,
  edit: EditableFields,
  role: UserRole,
): ApplyEditOutcome {
  const allowed = EDITABLE_FIELDS_BY_ROLE[role];
  if (!allowed || allowed.length === 0) {
    return { ok: false, reason: 'role has no edit permissions' };
  }

  const patch: Record<string, unknown> = {};
  const changes: FieldChange[] = [];

  // priority — enum validation
  if ('priority' in edit && allowed.includes('priority')) {
    const v = edit.priority;
    if (v !== undefined) {
      if (!PRIORITY_VALUES.has(v as string)) {
        return { ok: false, reason: `invalid priority value` };
      }
      if (v !== current.priority) {
        patch.priority = v;
        changes.push({ field: 'priority', before: current.priority ?? null, after: v });
      }
    }
  }

  // status — enum validation, admin-only via the role allowlist
  if ('status' in edit && allowed.includes('status')) {
    const v = edit.status;
    if (v !== undefined) {
      if (!STATUS_VALUES.has(v as string)) {
        return { ok: false, reason: `invalid status value` };
      }
      if (v !== current.status) {
        patch.status = v;
        changes.push({ field: 'status', before: current.status ?? null, after: v });
      }
    }
  }

  // clinical_question — text, length-bounded
  if ('clinical_question' in edit && allowed.includes('clinical_question')) {
    const v = edit.clinical_question;
    if (v !== undefined) {
      if (v !== null && typeof v !== 'string') {
        return { ok: false, reason: 'clinical_question must be string or null' };
      }
      if (typeof v === 'string' && v.length > MAX_CLINICAL_QUESTION_CHARS) {
        return { ok: false, reason: `clinical_question exceeds ${MAX_CLINICAL_QUESTION_CHARS} chars` };
      }
      if (normalizeText(v) !== normalizeText(current.clinical_question ?? null)) {
        patch.clinical_question = v;
        changes.push(textChange('clinical_question', current.clinical_question ?? null, v));
      }
    }
  }

  // internal_notes — text, length-bounded
  if ('internal_notes' in edit && allowed.includes('internal_notes')) {
    const v = edit.internal_notes;
    if (v !== undefined) {
      if (v !== null && typeof v !== 'string') {
        return { ok: false, reason: 'internal_notes must be string or null' };
      }
      if (typeof v === 'string' && v.length > MAX_INTERNAL_NOTES_CHARS) {
        return { ok: false, reason: `internal_notes exceeds ${MAX_INTERNAL_NOTES_CHARS} chars` };
      }
      if (normalizeText(v) !== normalizeText(current.internal_notes ?? null)) {
        patch.internal_notes = v;
        changes.push(textChange('internal_notes', current.internal_notes ?? null, v));
      }
    }
  }

  return { ok: true, changes, patch };
}

// ── Helpers ───────────────────────────────────────────────────────────────

function normalizeText(s: string | null | undefined): string {
  return s == null ? '' : s;
}

function textChange(field: string, before: string | null, after: string | null): TextChange {
  return {
    field,
    before_length: before ? before.length : 0,
    after_length: after ? after.length : 0,
    before_preview: previewText(before),
    after_preview: previewText(after),
  };
}

function previewText(s: string | null): string | null {
  if (s == null) return null;
  const PREVIEW_LEN = 200;
  return s.length > PREVIEW_LEN ? `${s.slice(0, PREVIEW_LEN)}…` : s;
}
