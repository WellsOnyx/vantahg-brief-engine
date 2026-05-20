import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth-guard';
import { applyRateLimit } from '@/lib/rate-limit-middleware';
import { getServiceClient } from '@/lib/supabase';
import { apiError } from '@/lib/api-error';
import { logAuditEvent } from '@/lib/audit';
import { getRequestContext } from '@/lib/security';
import { notifyIdrAttorneyAssigned } from '@/lib/notifications';

export const dynamic = 'force-dynamic';

/**
 * PATCH /api/cases/[id]/assign-idr-attorney
 *
 * Admin-only endpoint to assign (or unassign) an IDR Attorney to a Payer IDR case.
 *
 * Body:
 *   { attorney_id: string | null }
 *
 * Basic conflict checking:
 *   - Target user must have role 'idr-attorney'
 *   - Cannot assign the same attorney who is already assigned to this case
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await requireRole(request, ['admin']);
    if (authResult instanceof NextResponse) return authResult;

    const rateLimited = await applyRateLimit(request, { maxRequests: 30 });
    if (rateLimited) return rateLimited;

    const { id: caseId } = await params;
    const body = await request.json().catch(() => ({}));
    const attorneyId: string | null = body?.attorney_id ?? null;

    const supabase = getServiceClient();

    // 1. Load the case and verify it is a Payer IDR case
    const { data: existingCase, error: caseErr } = await supabase
      .from('cases')
      .select('id, case_type, assigned_idr_attorney_id, case_number')
      .eq('id', caseId)
      .single();

    if (caseErr || !existingCase) {
      return NextResponse.json({ error: 'Case not found' }, { status: 404 });
    }

    if (existingCase.case_type !== 'payer_idr') {
      return NextResponse.json(
        { error: 'This endpoint is only available for Payer IDR cases' },
        { status: 400 }
      );
    }

    // 2. If assigning, validate the target user
    if (attorneyId) {
      const { data: attorney, error: attorneyErr } = await supabase
        .from('user_profiles')
        .select('id, role, email')
        .eq('id', attorneyId)
        .single();

      if (attorneyErr || !attorney) {
        return NextResponse.json({ error: 'Attorney not found' }, { status: 404 });
      }

      if (attorney.role !== 'idr-attorney') {
        return NextResponse.json(
          { error: 'User does not have the idr-attorney role' },
          { status: 400 }
        );
      }

      // Basic conflict check: already assigned to this case
      if (existingCase.assigned_idr_attorney_id === attorneyId) {
        return NextResponse.json(
          { error: 'This attorney is already assigned to the case' },
          { status: 409 }
        );
      }
    }

    // 3. Perform the update
    const { error: updateErr } = await supabase
      .from('cases')
      .update({ assigned_idr_attorney_id: attorneyId })
      .eq('id', caseId);

    if (updateErr) {
      return apiError(updateErr, {
        operation: 'assign_idr_attorney',
        actor: authResult.user.email,
        requestContext: getRequestContext(request),
      });
    }

    // 4. Audit
    await logAuditEvent(
      caseId,
      attorneyId ? 'idr_attorney_assigned' : 'idr_attorney_unassigned',
      authResult.user.email,
      {
        previous_attorney_id: existingCase.assigned_idr_attorney_id,
        new_attorney_id: attorneyId,
        case_number: existingCase.case_number,
      },
      getRequestContext(request)
    );

    // Fire-and-forget notification to the newly assigned attorney (Task 9)
    if (attorneyId) {
      notifyIdrAttorneyAssigned(caseId, attorneyId, existingCase.case_number).catch(() => {});
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return apiError(err, {
      operation: 'assign_idr_attorney',
      actor: 'system',
      requestContext: getRequestContext(request),
    });
  }
}
