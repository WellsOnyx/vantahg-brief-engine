import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';
import { logAuditEvent, logDataAccess } from '@/lib/audit';
import { deliverToClient } from '@/lib/notifications';
import { isDemoMode, getDemoCase, updateDemoCase } from '@/lib/demo-mode';
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

    // Enrich with linked first appeal info for clean handoff UX (originals with appeal_status, and appeals)
    // No schema change on cases table; joins via appeals junction. Enables reliable View Appeal / View Original links.
    if (data) {
      try {
        if (data.appeal_status && !data.appeal_of_case_id) {
          // Original case: resolve the appeal case id for handoff banner link
          const { data: appealLink } = await supabase
            .from('appeals')
            .select('appeal_case_id')
            .eq('original_case_id', id)
            .maybeSingle();
          if (appealLink?.appeal_case_id) {
            (data as any).resolved_appeal_case_id = appealLink.appeal_case_id;
          }
        } else if (data.review_type === 'appeal' && data.appeal_of_case_id) {
          // Appeal case: surface the original for context (already on row as appeal_of_case_id)
          (data as any).resolved_original_case_id = data.appeal_of_case_id;
        }
      } catch {
        // Non-blocking enrichment for handoff UX
      }
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
    const body = await request.json();
    const actor = body.updated_by || authResult.user.email || 'system';
    const requestContext = getRequestContext(request);

    // ── Demo mode: mutate in-memory demo data + fire audits (console) ──
    if (isDemoMode()) {
      const demoUpdates: Record<string, unknown> = { ...body };

      if (body.determination) {
        demoUpdates.determination_at = new Date().toISOString();
      }
      if (body.assigned_reviewer_id) {
        demoUpdates.status = 'md_review';
      }

      // Special concierge validation gate (no column needed; rationale captured in audit)
      if (body.concierge_validation_rationale) {
        await logAuditEvent(id, 'concierge_brief_validated', actor, {
          rationale: body.concierge_validation_rationale,
          flags: body.validation_flags ?? [],
          validated_at: new Date().toISOString(),
        }, requestContext);
        // Do not attempt to persist concierge_* fields to demo shape unless present
        delete demoUpdates.concierge_validation_rationale;
        delete demoUpdates.validation_flags;
      }

      updateDemoCase(id, demoUpdates as any);

      // Standard status / determination / assignment audits (demo path)
      if (body.status) {
        await logAuditEvent(id, 'status_changed', actor, { new_status: body.status }, requestContext);
      }
      if (body.assigned_reviewer_id) {
        await logAuditEvent(id, 'reviewer_assigned', actor, { reviewer_id: body.assigned_reviewer_id }, requestContext);
      }
      if (body.determination) {
        await logAuditEvent(id, 'determination_made', actor, {
          determination: body.determination,
          rationale: body.determination_rationale || null,
        }, requestContext);
      }

      const updated = getDemoCase(id);
      return NextResponse.json(updated ?? { id, ...demoUpdates });
    }

    // ── Live path ──
    const supabase = getServiceClient();
    const updates: Record<string, unknown> = { ...body };

    // When a determination is set, record the timestamp
    if (body.determination) {
      updates.determination_at = new Date().toISOString();
    }

    // When a reviewer is assigned, move status to md_review
    if (body.assigned_reviewer_id) {
      updates.status = 'md_review';
    }

    // Special concierge validation gate — always log rich audit (rationale is the human reasoning)
    // Do NOT include in DB update to avoid schema dependency; lives in audit payload.
    if (body.concierge_validation_rationale) {
      await logAuditEvent(id, 'concierge_brief_validated', actor, {
        rationale: body.concierge_validation_rationale,
        flags: body.validation_flags ?? [],
        validated_at: new Date().toISOString(),
      }, requestContext);
      delete updates.concierge_validation_rationale;
      delete updates.validation_flags;
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

    // Log audit events based on what changed (live)
    if (body.status) {
      await logAuditEvent(id, 'status_changed', actor, {
        new_status: body.status,
      }, requestContext);
    }

    if (body.assigned_reviewer_id) {
      await logAuditEvent(id, 'reviewer_assigned', actor, {
        reviewer_id: body.assigned_reviewer_id,
      }, requestContext);
    }

    if (body.determination) {
      await logAuditEvent(id, 'determination_made', actor, {
        determination: body.determination,
        rationale: body.determination_rationale || null,
      }, requestContext);

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
            }, requestContext);
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
