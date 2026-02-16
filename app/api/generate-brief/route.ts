import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';
import { logAuditEvent } from '@/lib/audit';
import { generateBriefForCase } from '@/lib/generate-brief';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const supabase = getServiceClient();
    const body = await request.json();

    const { case_id } = body;

    if (!case_id) {
      return NextResponse.json(
        { error: 'case_id is required' },
        { status: 400 }
      );
    }

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

    // Generate the brief
    const brief = await generateBriefForCase(caseData);

    // Store the result in the database
    const { data: updatedCase, error: updateError } = await supabase
      .from('cases')
      .update({
        ai_brief: brief,
        ai_brief_generated_at: new Date().toISOString(),
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

    return NextResponse.json({
      case: updatedCase,
      brief,
    });
  } catch (err) {
    console.error('Error generating brief:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
