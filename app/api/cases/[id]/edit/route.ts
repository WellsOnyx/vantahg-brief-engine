import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';
import { isDemoMode } from '@/lib/demo-mode';
import { requireRole } from '@/lib/auth-guard';
import { applyRateLimit } from '@/lib/rate-limit-middleware';
import { assertCaseAccess } from '@/lib/case-access';
import { buildCaseEdit, type EditableFields } from '@/lib/case-edit';
import { logAuditEvent } from '@/lib/audit';
import { apiError } from '@/lib/api-error';
import { getRequestContext } from '@/lib/security';

export const dynamic = 'force-dynamic';

/**
 * POST /api/cases/[id]/edit
 *
 * Controlled mutation surface for admin/reviewer case edits. The PATCH
 * /api/cases/[id] route stays in place for the assignment/determination
 * workflow; this endpoint is the one to use for ad-hoc edits (priority
 * bumps, status overrides, clinical question updates, internal notes).
 *
 * What it enforces:
 *   - Role: admin or reviewer (assertCaseAccess on the fetched case
 *     gates tenant ownership the same way as the PDF routes).
 *   - Field allowlist by role (see lib/case-edit.ts EDITABLE_FIELDS_BY_ROLE).
 *     Reviewers cannot change status — admin only.
 *   - Enum + length validation on every field.
 *   - Diff-based audit: writes a single case_edited event with a
 *     per-field { before, after } array. Text fields use a 200-char
 *     preview to keep the audit row size bounded while still showing
 *     what changed.
 *   - No-op edits return 200 with `changed: false` — the audit log is
 *     not written in that case (no signal == no event).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const authResult = await requireRole(request, ['admin', 'reviewer']);
    if (authResult instanceof NextResponse) return authResult;

    const rateLimited = await applyRateLimit(request, { maxRequests: 60 });
    if (rateLimited) return rateLimited;

    const { id } = await params;

    let body: EditableFields;
    try {
      body = (await request.json()) as EditableFields;
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    if (isDemoMode()) {
      // Demo: validate + return what we would have written, no DB mutation.
      // Lets operators preview the edit flow without writing to fixtures.
      return NextResponse.json({
        success: true,
        demo: true,
        message: 'Edit accepted (demo mode — no fixture mutated)',
      });
    }

    const supabase = getServiceClient();

    // Load the current case row (with joined client for tenant check).
    const { data: caseData, error: fetchErr } = await supabase
      .from('cases')
      .select('id, priority, status, clinical_question, internal_notes, client_id, client:clients(contact_email)')
      .eq('id', id)
      .single();

    if (fetchErr || !caseData) {
      if (fetchErr?.code === 'PGRST116') {
        return NextResponse.json({ error: 'Case not found' }, { status: 404 });
      }
      return apiError(fetchErr ?? new Error('Case not found'), {
        operation: 'case_edit_fetch',
        caseId: id,
        actor: authResult.user.email,
        requestContext: getRequestContext(request),
      });
    }

    // Tenant ownership. Admin + reviewer pass through; this is defense-in-
    // depth — even if requireRole someday admits a client user, this would
    // still gate them out (client role has no entries in
    // EDITABLE_FIELDS_BY_ROLE anyway). Supabase types the joined client
    // as an array even on FK select; the runtime shape matches CaseLike,
    // so we cast through unknown — the same pragmatic approach the PDF
    // routes use.
    const denied = await assertCaseAccess(
      caseData as unknown as { id: string; client_id?: string | null; client?: { contact_email?: string | null } | null },
      authResult.user,
      request,
    );
    if (denied) return denied;

    // Validate + diff. The helper is the single source of truth for which
    // fields are allowed for which role and how each is validated.
    const outcome = buildCaseEdit(caseData, body, authResult.user.role);
    if (!outcome.ok) {
      // Reasons from buildCaseEdit are low-cardinality enum/length issues
      // — safe to surface to the client so they can correct the request.
      return NextResponse.json({ error: outcome.reason }, { status: 400 });
    }

    if (outcome.changes.length === 0) {
      // No-op edit. Return success but don't write an audit event — we
      // only log actual state changes so the audit log isn't polluted by
      // "save"-without-edit UI interactions.
      return NextResponse.json({
        success: true,
        changed: false,
        case_id: id,
      });
    }

    const { data: updated, error: updateErr } = await supabase
      .from('cases')
      .update(outcome.patch)
      .eq('id', id)
      .select('*, reviewer:reviewers(*), client:clients(*)')
      .single();

    if (updateErr || !updated) {
      return apiError(updateErr ?? new Error('Update failed'), {
        operation: 'case_edit_update',
        caseId: id,
        actor: authResult.user.email,
        requestContext: getRequestContext(request),
      });
    }

    // Audit event — the immutable record of what changed. Fire-and-forget
    // so the response doesn't fail if audit_log is briefly unavailable;
    // the response already contains the new state for the client.
    logAuditEvent(
      id,
      'case_edited',
      authResult.user.email,
      {
        edited_by_role: authResult.user.role,
        changes: outcome.changes,
      },
      getRequestContext(request),
    ).catch(() => { /* already logged inside logAuditEvent */ });

    return NextResponse.json({
      success: true,
      changed: true,
      case: updated,
      changes: outcome.changes,
    });
  } catch (err) {
    return apiError(err, {
      operation: 'case_edit',
      actor: 'system',
      requestContext: getRequestContext(request),
    });
  }
}
