import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-guard';
import { isDemoMode } from '@/lib/demo-mode';
import { getServiceClient } from '@/lib/supabase';
import { submitAudit } from '@/lib/quality-audit';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const authResult = await requireAuth(request);
    if (authResult instanceof NextResponse) return authResult;

    const { id } = await params;

    if (isDemoMode()) {
      return NextResponse.json({ error: 'Individual audit lookup not available in demo mode' }, { status: 404 });
    }

    const supabase = getServiceClient();
    const { data, error } = await supabase.from('quality_audits').select('*').eq('id', id).single();

    if (error || !data) return NextResponse.json({ error: 'Audit not found' }, { status: 404 });

    return NextResponse.json(data);
  } catch (err) {
    console.error('Quality audit GET error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const authResult = await requireAuth(request);
    if (authResult instanceof NextResponse) return authResult;

    const { id } = await params;
    const body = await request.json();

    const { criteria_accuracy, documentation_quality, sla_compliance, determination_appropriate, notes } = body;

    const result = await submitAudit(id, {
      criteria_accuracy,
      documentation_quality,
      sla_compliance,
      determination_appropriate,
      notes: notes || '',
    });

    if (!result.success) {
      return NextResponse.json({ error: result.reason }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: 'Audit submitted.' });
  } catch (err) {
    console.error('Quality audit PATCH error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
