import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';
import { logAuditEvent } from '@/lib/audit';
import { isDemoMode } from '@/lib/demo-mode';
import { applyRateLimit } from '@/lib/rate-limit-middleware';

export const dynamic = 'force-dynamic';

/**
 * POST /api/cases/[id]/acknowledge
 * TPA systems acknowledge receipt of a determination.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const rateLimited = await applyRateLimit(request, { maxRequests: 60 });
    if (rateLimited) return rateLimited;

    const { id } = await params;
    const body = await request.json();

    if (!body.acknowledged_by || typeof body.acknowledged_by !== 'string') {
      return NextResponse.json(
        { error: 'acknowledged_by is required' },
        { status: 400 }
      );
    }

    if (isDemoMode()) {
      console.log(`[DEMO] Case ${id} acknowledged by ${body.acknowledged_by}`);
      return NextResponse.json({
        acknowledged: true,
        case_id: id,
        acknowledged_at: new Date().toISOString(),
      });
    }

    const supabase = getServiceClient();

    // Verify case exists and is in appropriate status
    const { data: caseData, error: fetchError } = await supabase
      .from('cases')
      .select('id, case_number, status')
      .eq('id', id)
      .single();

    if (fetchError || !caseData) {
      return NextResponse.json({ error: 'Case not found' }, { status: 404 });
    }

    if (!['determination_made', 'delivered'].includes(caseData.status)) {
      return NextResponse.json(
        { error: `Case is not ready for acknowledgment (status: ${caseData.status})` },
        { status: 400 }
      );
    }

    // Update status to delivered if not already
    if (caseData.status !== 'delivered') {
      await supabase
        .from('cases')
        .update({ status: 'delivered' })
        .eq('id', id);
    }

    await logAuditEvent(id, 'delivery_acknowledged', body.acknowledged_by, {
      case_number: caseData.case_number,
      notes: body.notes || null,
    });

    return NextResponse.json({
      acknowledged: true,
      case_id: id,
      case_number: caseData.case_number,
      acknowledged_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error('Error acknowledging case:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
