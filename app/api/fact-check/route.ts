import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';
import { factCheckBrief } from '@/lib/fact-checker';
import { isDemoMode, getDemoCase } from '@/lib/demo-mode';
import { requireAuth } from '@/lib/auth-guard';
import { applyRateLimit } from '@/lib/rate-limit-middleware';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAuth(request);
    if (authResult instanceof NextResponse) return authResult;
    const rateLimited = await applyRateLimit(request, { maxRequests: 20 });
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
      const caseData = getDemoCase(case_id);
      if (!caseData) {
        return NextResponse.json(
          { error: 'Case not found' },
          { status: 404 }
        );
      }
      if (!caseData.ai_brief) {
        return NextResponse.json(
          { error: 'No brief exists for this case. Generate a brief first.' },
          { status: 400 }
        );
      }
      const factCheck = factCheckBrief(caseData.ai_brief, caseData);
      return NextResponse.json({
        case: { ...caseData, fact_check: factCheck, fact_check_at: new Date().toISOString() },
        factCheck,
      });
    }

    const supabase = getServiceClient();

    const { data: caseData, error: fetchError } = await supabase
      .from('cases')
      .select('*')
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

    if (!caseData.ai_brief) {
      return NextResponse.json(
        { error: 'No brief exists for this case. Generate a brief first.' },
        { status: 400 }
      );
    }

    const factCheck = factCheckBrief(caseData.ai_brief, caseData);

    const { data: updatedCase, error: updateError } = await supabase
      .from('cases')
      .update({
        fact_check: factCheck,
        fact_check_at: new Date().toISOString(),
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

    return NextResponse.json({
      case: updatedCase,
      factCheck,
    });
  } catch (err: unknown) {
    console.error('Error running fact-check:', err);
    return NextResponse.json(
      { error: 'Failed to run fact-check. Please try again.' },
      { status: 500 }
    );
  }
}
