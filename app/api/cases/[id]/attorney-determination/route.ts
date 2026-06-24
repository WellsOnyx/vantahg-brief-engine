import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth-guard';
import { applyRateLimit } from '@/lib/rate-limit-middleware';
import { getServiceClient } from '@/lib/supabase';
import { apiError } from '@/lib/api-error';
import { logAuditEvent } from '@/lib/audit';
import { getRequestContext } from '@/lib/security';
import type { DeterminationFields } from '@/components/DeterminationForm';

export const dynamic = 'force-dynamic';

/**
 * PATCH /api/cases/[id]/attorney-determination
 *
 * Allows an assigned IDR Attorney (or admin) to submit a determination + rationale
 * on a Payer IDR case.
 *
 * Body: DeterminationFields (same shape as clinical DeterminationForm)
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Allow idr-attorney or admin
    const authResult = await requireRole(request, ['idr-attorney', 'admin']);
    if (authResult instanceof NextResponse) return authResult;

    const rateLimited = await applyRateLimit(request, { maxRequests: 30 });
    if (rateLimited) return rateLimited;

    const { id: caseId } = await params;
    const body: DeterminationFields = await request.json();

    if (!body.determination || !body.rationale?.trim()) {
      return NextResponse.json(
        { error: 'Determination and rationale are required' },
        { status: 400 }
      );
    }

    const supabase = getServiceClient();

    // Verify the case is a Payer IDR case and user is authorized
    const { data: existingCase, error: fetchErr } = await supabase
      .from('cases')
      .select('id, case_type, assigned_idr_attorney_id, status')
      .eq('id', caseId)
      .single();

    if (fetchErr || !existingCase) {
      return NextResponse.json({ error: 'Case not found' }, { status: 404 });
    }

    if (existingCase.case_type !== 'payer_idr') {
      return NextResponse.json(
        { error: 'Attorney determination is only available for Payer IDR cases' },
        { status: 400 }
      );
    }

    // If not admin, must be the assigned attorney
    if (
      authResult.user.role === 'idr-attorney' &&
      existingCase.assigned_idr_attorney_id !== authResult.user.id
    ) {
      return NextResponse.json(
        { error: 'You are not assigned to this IDR case' },
        { status: 403 }
      );
    }

    // Update the case with determination
    const determinationPayload = {
      determination: body.determination,
      rationale: body.rationale.trim(),
      denial_reason: body.denial_reason || null,
      denial_criteria_cited: body.denial_criteria_cited || null,
      alternative_recommended: body.alternative_recommended || null,
      modification_details: body.modification_details || null,
      // For IDR training: capture key NSA factors the attorney considered
      idr_factors_considered: (body as any).idr_factors_considered || null,
      determined_by: authResult.user.id,
      determined_at: new Date().toISOString(),
    };

    const { error: updateErr } = await supabase
      .from('cases')
      .update({
        determination: determinationPayload,
        status: 'attorney_determined',
        updated_at: new Date().toISOString(),
      })
      .eq('id', caseId);

    if (updateErr) {
      return apiError(updateErr, {
        operation: 'attorney_determination_update',
        actor: authResult.user.email,
        requestContext: getRequestContext(request),
      });
    }

    // Audit - Task 11: Basic audit logging for attorney decisions and rationale
    await logAuditEvent(
      caseId,
      'attorney_determination_made',
      authResult.user.email,
      {
        determination: body.determination,
        rationale: body.rationale.trim(),
        denial_reason: body.denial_reason || null,
        case_type: 'payer_idr',
        attorney_id: authResult.user.id,
        attorney_email: authResult.user.email,
        previous_status: existingCase.status,
      },
      getRequestContext(request)
    );

    return NextResponse.json({ success: true });
  } catch (err) {
    return apiError(err, {
      operation: 'attorney_determination',
      actor: 'system',
      requestContext: getRequestContext(request),
    });
  }
}
