import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';
import { logAuditEvent } from '@/lib/audit';
import { generateBriefForCase } from '@/lib/generate-brief';
import { autoAssignReviewer } from '@/lib/assignment-engine';
import { notifyCaseAssigned } from '@/lib/notifications';
import { isDemoMode, getDemoBrief } from '@/lib/demo-mode';
import { requireAuth } from '@/lib/auth-guard';
import { applyRateLimit } from '@/lib/rate-limit-middleware';

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
      return NextResponse.json(
        { error: fetchError.message },
        { status: 500 }
      );
    }

    // Generate the brief and run fact-check
    const { brief, factCheck } = await generateBriefForCase(caseData);

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
      return NextResponse.json(
        { error: updateError.message },
        { status: 500 }
      );
    }

    // Log audit event
    await logAuditEvent(case_id, 'brief_generated', 'system', {
      triggered_manually: true,
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
    console.error('Error generating brief:', err);

    // Provide specific error messages for common failure modes
    const errorObj = err as { status?: number; message?: string; code?: string };

    if (errorObj?.status === 401 || errorObj?.message?.includes('API key') || errorObj?.message?.includes('authentication')) {
      return NextResponse.json(
        { error: 'AI service authentication failed. Please check API key configuration.' },
        { status: 503 }
      );
    }

    if (errorObj?.status === 429 || errorObj?.message?.includes('rate limit') || errorObj?.code === 'rate_limit_exceeded') {
      return NextResponse.json(
        { error: 'AI service rate limit reached. Please try again in a few minutes.' },
        { status: 429 }
      );
    }

    if (errorObj?.message?.includes('JSON') || errorObj?.message?.includes('parse') || errorObj?.message?.includes('Unexpected token')) {
      return NextResponse.json(
        { error: 'AI response could not be parsed. Please try generating the brief again.' },
        { status: 502 }
      );
    }

    if (errorObj?.status === 500 || errorObj?.status === 503 || errorObj?.message?.includes('overloaded')) {
      return NextResponse.json(
        { error: 'AI service is temporarily unavailable. Please try again shortly.' },
        { status: 503 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to generate clinical brief. Please try again.' },
      { status: 500 }
    );
  }
}
