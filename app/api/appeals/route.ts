import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-guard';
import { applyRateLimit } from '@/lib/rate-limit-middleware';
import { isDemoMode } from '@/lib/demo-mode';
import { getServiceClient } from '@/lib/supabase';
import { createAppeal } from '@/lib/appeal-engine';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const authResult = await requireAuth(request);
    if (authResult instanceof NextResponse) return authResult;

    if (isDemoMode()) {
      return NextResponse.json([]); // No demo appeals
    }

    const supabase = getServiceClient();
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');

    let query = supabase.from('appeals').select('*').order('created_at', { ascending: false });
    if (status) query = query.eq('status', status);

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json(data);
  } catch (err) {
    console.error('Appeals GET error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAuth(request);
    if (authResult instanceof NextResponse) return authResult;
    const rateLimited = await applyRateLimit(request, { maxRequests: 10 });
    if (rateLimited) return rateLimited;

    const body = await request.json();
    const { original_case_id, reason, filed_by } = body;

    if (!original_case_id || !reason) {
      return NextResponse.json(
        { error: 'original_case_id and reason are required' },
        { status: 400 },
      );
    }

    const result = await createAppeal(original_case_id, reason, filed_by || 'system');

    if (!result.success) {
      return NextResponse.json({ error: result.reason }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      appealId: result.appealId,
      appealCaseId: result.appealCaseId,
    }, { status: 201 });
  } catch (err) {
    console.error('Appeals POST error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
