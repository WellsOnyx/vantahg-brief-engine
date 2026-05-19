import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';
import { logAuditEvent } from '@/lib/audit';
import { generateBriefForCase } from '@/lib/generate-brief';
import { autoAssignReviewer } from '@/lib/assignment-engine';
import { notifyCaseAssigned } from '@/lib/notifications';
import { isDemoMode, getDemoBrief } from '@/lib/demo-mode';
import { requireAuth } from '@/lib/auth-guard';
import { applyRateLimit } from '@/lib/rate-limit-middleware';
import { LlmError } from '@/lib/llm';
import { apiError } from '@/lib/api-error';
import { getRequestContext } from '@/lib/security';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAuth(request);
    if (authResult instanceof NextResponse) return authResult;
    const rateLimited = await applyRateLimit(request, { maxRequests: 10 });
    if (rateLimited) return rateLimited;
    const body = await request.json();
    const { case_id } = body;

    if (!case_id) {
      return NextResponse.json(
        { error: 'case_id is required' },
        { status: 400 }
      );
    }

    if (isDemoMode()) {
      const result = getDemoBrief(case_id);
      if (!result) {
        return NextResponse.json(
          { error: 'Case not found' },
          { status: 404 }
        );
      }
      return NextResponse.json(result);
    }

    const supabase = getServiceClient();

    // Fetch the case from Supabase
    const { data: caseData, error: fetchError } = await supabase
      .from('cases')
      .select('*, reviewer:reviewers(*), client:clients(*)')
      .eq('id', case_id)
      .single();

    if (fetchError) {
      if (fetchError.code === 'PGRST116') {
        return NextResponse.json(
          { error: 'Case not found' },
          { status: 404 }
        );
      }
      return apiError(fetchError, {
        operation: 'fetch_case_for_brief',
        caseId: case_id,
        actor: authResult.user.email,
        requestContext: getRequestContext(request),
      });
    }

    // Generate the brief and run fact-check (pass client for criteria source context)
    const { brief, factCheck } = await generateBriefForCase(caseData, { client: caseData.client ?? null });

    // Store the result in the database
    const { data: updatedCase, error: updateError } = await supabase
      .from('cases')
      .update({
        ai_brief: brief,
        ai_brief_generated_at: new Date().toISOString(),
        fact_check: factCheck,
        fact_check_at: new Date().toISOString(),
        status: 'brief_ready',
      })
      .eq('id', case_id)
      .select('*, reviewer:reviewers(*), client:clients(*)')
      .single();

    if (updateError) {
      return apiError(updateError, {
        operation: 'persist_brief',
        caseId: case_id,
        actor: authResult.user.email,
        requestContext: getRequestContext(request),
      });
    }

    // Log audit event (now carries self-improvement metadata via the brief object itself)
    await logAuditEvent(case_id, 'brief_generated', 'system', {
      triggered_manually: true,
      passes: (brief as any)?.generation_metadata?.passes_completed ?? 1,
      self_improved: (brief as any)?.generation_metadata?.self_improvement_applied ?? false,
    });

    // Auto-assign a reviewer now that brief is ready (non-blocking)
    autoAssignReviewer(case_id).then(async (assignment) => {
      if (assignment.assigned && assignment.reviewerId) {
        notifyCaseAssigned(case_id, assignment.reviewerId).catch(console.error);
      }
    }).catch(console.error);

    return NextResponse.json({
      case: updatedCase,
      brief,
    });
  } catch (err: unknown) {
    // Structured handling for the LlmError shape from lib/llm. Every other
    // path falls through to apiError(), which logs PHI-safe metadata and
    // returns a generic 500. No more string-sniffing error messages.
    if (err instanceof LlmError) {
      const ctx = getRequestContext(request);
      const briefCaseId = await safeReadCaseId(request);

      logAuditEvent(briefCaseId, 'brief_llm_error', 'system', {
        kind: err.kind,
        status: err.status ?? null,
        retryable: err.retryable,
      }, ctx).catch(() => { /* already logged inside logAuditEvent */ });

      switch (err.kind) {
        case 'auth':
          return NextResponse.json(
            { error: 'AI service authentication failed. Check API key configuration.' },
            { status: 503 },
          );
        case 'rate_limit':
          return NextResponse.json(
            { error: 'AI service rate limit reached. Please try again in a few minutes.' },
            { status: 429 },
          );
        case 'timeout':
          return NextResponse.json(
            { error: 'AI service timed out. Please try again.' },
            { status: 504 },
          );
        case 'server':
          return NextResponse.json(
            { error: 'AI service is temporarily unavailable. Please try again shortly.' },
            { status: 503 },
          );
        case 'no_response':
          return NextResponse.json(
            { error: 'AI returned an incomplete brief. Please try again.' },
            { status: 502 },
          );
        case 'bad_request':
        default:
          return NextResponse.json(
            { error: 'Failed to generate clinical brief. Please try again.' },
            { status: 500 },
          );
      }
    }

    return apiError(err, {
      operation: 'generate_brief',
      actor: 'system',
      requestContext: getRequestContext(request),
      clientMessage: 'Failed to generate clinical brief. Please try again.',
    });
  }
}

// Helper: the brief route reads case_id from a JSON body. By the time the
// catch fires, we may not have it in scope (the request has been consumed).
// Re-cloning the request once for audit purposes is cheap and safer than
// hoisting the body.
async function safeReadCaseId(request: NextRequest): Promise<string | null> {
  try {
    const clone = request.clone();
    const body = await clone.json();
    return typeof body?.case_id === 'string' ? body.case_id : null;
  } catch {
    return null;
  }
}
