import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';
import { logAuditEvent, logDataAccess } from '@/lib/audit';
import { deliverToClient } from '@/lib/notifications';
import { enqueuePartnerEvent } from '@/lib/partner/webhook-out';
import { isDemoMode, getDemoCase, updateDemoCase } from '@/lib/demo-mode';
import { requireAuth } from '@/lib/auth-guard';
import { applyRateLimit } from '@/lib/rate-limit-middleware';
import { apiError } from '@/lib/api-error';
import { getRequestContext } from '@/lib/security';
import {
  assertReviewerIndependent,
  ReviewerIndependenceError,
  supabaseLineageLoader,
  demoLineageLoader,
} from '@/lib/reviewer-independence';
import { recordLaborMetricForCase, isLaborMetricEnabled } from '@/lib/labor-metric-record';

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

    // Reviewer-independence gate (central enforcement — lib/reviewer-independence.ts).
    // A reviewer who touched the original case cannot be hand-assigned to its
    // appeal/IRO/external review. Guards the manual write path so the rule can't
    // be routed around. No-op for first-pass cases (no appeal_of_case_id).
    if (body.assigned_reviewer_id) {
      let appealOfCaseId: string | null = null;
      let loader;
      if (isDemoMode()) {
        loader = demoLineageLoader(getDemoCase as (i: string) => any);
        appealOfCaseId =
          (getDemoCase(id) as { appeal_of_case_id?: string | null } | null | undefined)
            ?.appeal_of_case_id ?? null;
      } else {
        const sb = getServiceClient();
        loader = supabaseLineageLoader(sb);
        const { data: lineageRow } = await sb
          .from('cases')
          .select('id, appeal_of_case_id')
          .eq('id', id)
          .single();
        appealOfCaseId = lineageRow?.appeal_of_case_id ?? null;
      }
      try {
        await assertReviewerIndependent(
          { id, appeal_of_case_id: appealOfCaseId },
          body.assigned_reviewer_id,
          loader,
        );
      } catch (e) {
        if (e instanceof ReviewerIndependenceError) {
          await logAuditEvent(
            id,
            'reviewer_independence_block',
            actor,
            { attempted_reviewer_id: body.assigned_reviewer_id, path: 'manual_patch', appeal_of_case_id: appealOfCaseId },
            requestContext,
          );
          return NextResponse.json(
            {
              error:
                'Reviewer is not independent of the original determination and cannot be assigned to this case.',
              code: e.code,
            },
            { status: 409 },
          );
        }
        throw e;
      }
    }

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
      // Fact-check ack also captured for full defensibility trail in demo.
      if (body.concierge_validation_rationale) {
        await logAuditEvent(id, 'concierge_brief_validated', actor, {
          rationale: body.concierge_validation_rationale,
          flags: body.validation_flags ?? [],
          validated_at: new Date().toISOString(),
          fact_check_acknowledged: body.fact_check_acknowledged ?? null,
          fact_check_review_notes: body.fact_check_review_notes ?? null,
          fact_check_enforced: !!(body.fact_check_acknowledged || body.fact_check_review_notes),
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
          // AI Automation Layer (Track A): capture explicit human review of denial/appeal risk signals (required reasoning gate)
          ai_risk_acknowledged: body.ai_risk_acknowledged || false,
          ai_risk_notes: body.ai_risk_notes || null,
          risk_signal_present: !!(body.ai_risk_acknowledged || body.ai_risk_notes),
        }, requestContext);
      }

      const updated = getDemoCase(id);
      return NextResponse.json(updated ?? { id, ...demoUpdates });
    }

    // ── Live path ──
    const supabase = getServiceClient();

    // IRO/IRE independence enforcement at DETERMINATION time — routed through the
    // central module (lib/reviewer-independence.ts), replacing the inline check.
    // Prevents the reviewer rendering an IRO/IRE determination from being one who
    // touched the original case. Same trigger as before; shared enforcement.
    const ENABLE_IRO_STREAM = true; // feature flag for IRO/IRE stream
    if (ENABLE_IRO_STREAM && body.determination) {
      const { data: currentCase } = await supabase
        .from('cases')
        .select('case_type, appeal_of_case_id, assigned_reviewer_id')
        .eq('id', id)
        .single();
      if (
        currentCase &&
        (currentCase.case_type === 'iro' || currentCase.case_type === 'ire') &&
        currentCase.appeal_of_case_id &&
        currentCase.assigned_reviewer_id
      ) {
        try {
          await assertReviewerIndependent(
            { id, appeal_of_case_id: currentCase.appeal_of_case_id },
            currentCase.assigned_reviewer_id,
            supabaseLineageLoader(supabase),
          );
        } catch (e) {
          if (e instanceof ReviewerIndependenceError) {
            return NextResponse.json(
              { error: 'Independence wall violation: the assigned reviewer touched the original case.', code: e.code },
              { status: 403 },
            );
          }
          throw e;
        }
      }
    }

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
    // Extended for Fact-Check & Verification Hardening: capture explicit acknowledgment of automated verification (multi-source + fidelity).
    if (body.concierge_validation_rationale) {
      await logAuditEvent(id, 'concierge_brief_validated', actor, {
        rationale: body.concierge_validation_rationale,
        flags: body.validation_flags ?? [],
        validated_at: new Date().toISOString(),
        // Fact-check acknowledgment fields (only sent when gate was active; human reasoning on verification output)
        fact_check_acknowledged: body.fact_check_acknowledged ?? null,
        fact_check_review_notes: body.fact_check_review_notes ?? null,
        fact_check_enforced: !!(body.fact_check_acknowledged || body.fact_check_review_notes),
      }, requestContext);
      delete updates.concierge_validation_rationale;
      delete updates.validation_flags;
      delete updates.fact_check_acknowledged;
      delete updates.fact_check_review_notes;
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
        // AI Automation Layer (Track A): capture explicit human review of denial/appeal risk signals (required reasoning gate)
        ai_risk_acknowledged: body.ai_risk_acknowledged || false,
        ai_risk_notes: body.ai_risk_notes || null,
        risk_signal_present: !!(body.ai_risk_acknowledged || body.ai_risk_notes),
      }, requestContext);

      // Auto-deliver to client for final determinations (non-blocking)
      const finalDeterminations = ['approve', 'deny', 'partial_approve', 'modify'];
      if (finalDeterminations.includes(body.determination)) {
        // Decision-out to partner systems (Partner API v1): enqueue a signed
        // case.determination webhook for every webhook-configured key on the
        // case's client. Awaited — it's a fast insert, and losing it would
        // silently break the partner's loop.
        await enqueuePartnerEvent(id, 'case.determination');
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

      // Labor-reduction metric at determination time (flag-gated, default off).
      // Recomputes/finalizes the per-case number now the determination exists.
      if (isLaborMetricEnabled()) {
        const { data: forMetric } = await supabase
          .from('cases')
          .select('id, case_type, ai_brief, fact_check')
          .eq('id', id)
          .single();
        if (forMetric) await recordLaborMetricForCase(forMetric, supabase);
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
