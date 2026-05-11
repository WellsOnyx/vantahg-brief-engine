import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';
import { logAuditEvent, logDataAccess } from '@/lib/audit';
import { deliverToClient } from '@/lib/notifications';
import { isDemoMode, getDemoCase } from '@/lib/demo-mode';
import { requireAuth } from '@/lib/auth-guard';
import { applyRateLimit } from '@/lib/rate-limit-middleware';
import { apiError } from '@/lib/api-error';
import { getRequestContext } from '@/lib/security';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await requireAuth(request);
    if (authResult instanceof NextResponse) return authResult;
    const rateLimited = await applyRateLimit(request, { maxRequests: 200 });
    if (rateLimited) return rateLimited;
    const { id } = await params;

    if (isDemoMode()) {
      const demoCase = getDemoCase(id);
      if (!demoCase) {
        return NextResponse.json({ error: 'Case not found' }, { status: 404 });
      }
      return NextResponse.json(demoCase);
    }

    const supabase = getServiceClient();

    const { data, error } = await supabase
      .from('cases')
      .select('*, reviewer:reviewers(*), client:clients(*)')
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json({ error: 'Case not found' }, { status: 404 });
      }
      return apiError(error, {
        operation: 'fetch_case',
        caseId: id,
        actor: authResult.user.email,
        requestContext: getRequestContext(request),
      });
    }

    // SOC 2 CC6.1: log every PHI read. Don't block on the audit write — the
    // GET response shouldn't fail if the audit table is briefly unavailable.
    logDataAccess(id, authResult.user.email, ['case_record'], getRequestContext(request))
      .catch(() => { /* already logged inside logAuditEvent */ });

    return NextResponse.json(data);
  } catch (err) {
    return apiError(err, {
      operation: 'fetch_case',
      actor: 'system',
      requestContext: getRequestContext(request),
    });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await requireAuth(request);
    if (authResult instanceof NextResponse) return authResult;
    const rateLimited = await applyRateLimit(request, { maxRequests: 30 });
    if (rateLimited) return rateLimited;

    const { id } = await params;
    const supabase = getServiceClient();
    const body = await request.json();

    const updates: Record<string, unknown> = { ...body };

    // When a determination is set, record the timestamp
    if (body.determination) {
      updates.determination_at = new Date().toISOString();
    }

    // When a reviewer is assigned, move status to md_review
    if (body.assigned_reviewer_id) {
      updates.status = 'md_review';
    }

    const { data, error } = await supabase
      .from('cases')
      .update(updates)
      .eq('id', id)
      .select('*, reviewer:reviewers(*), client:clients(*)')
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json({ error: 'Case not found' }, { status: 404 });
      }
      return apiError(error, {
        operation: 'update_case',
        caseId: id,
        actor: body.updated_by || authResult.user.email,
        requestContext: getRequestContext(request),
      });
    }

    // Log audit events based on what changed
    const actor = body.updated_by || 'system';

    if (body.status) {
      await logAuditEvent(id, 'status_changed', actor, {
        new_status: body.status,
      });
    }

    if (body.assigned_reviewer_id) {
      await logAuditEvent(id, 'reviewer_assigned', actor, {
        reviewer_id: body.assigned_reviewer_id,
      });
    }

    if (body.determination) {
      await logAuditEvent(id, 'determination_made', actor, {
        determination: body.determination,
        rationale: body.determination_rationale || null,
      });

      // Auto-deliver to client for final determinations (non-blocking)
      const finalDeterminations = ['approve', 'deny', 'partial_approve', 'modify'];
      if (finalDeterminations.includes(body.determination)) {
        deliverToClient(id).then(async (delivered) => {
          if (delivered) {
            const supabaseForDelivery = getServiceClient();
            await supabaseForDelivery
              .from('cases')
              .update({ status: 'delivered' })
              .eq('id', id);
            await logAuditEvent(id, 'case_delivered', 'system', {
              determination: body.determination,
            });
          }
        }).catch(console.error);
      }
    }

    return NextResponse.json(data);
  } catch (err) {
    return apiError(err, {
      operation: 'update_case',
      actor: 'system',
      requestContext: getRequestContext(request),
    });
  }
}
