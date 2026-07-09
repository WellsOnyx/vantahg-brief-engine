import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';
import { logAuditEvent } from '@/lib/audit';
import { isDemoMode } from '@/lib/demo-mode';
import { applyRateLimit } from '@/lib/rate-limit-middleware';
import { authenticatePartner } from '@/lib/partner/auth';
import { requireAuth, isInternalStaff } from '@/lib/auth-guard';

export const dynamic = 'force-dynamic';

/**
 * POST /api/cases/[id]/acknowledge
 * TPA systems acknowledge receipt of a determination.
 *
 * Auth: a Partner API key (X-API-Key — the case must belong to the key's
 * client tenant) or an internal-staff session. Previously unauthenticated:
 * anyone who guessed a case id could flip it to delivered and write
 * arbitrary acknowledged_by strings into the audit trail.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const rateLimited = await applyRateLimit(request, { maxRequests: 60 });
    if (rateLimited) return rateLimited;

    const { id } = await params;

    // Partner key first (the intended caller), staff session as fallback.
    const partner = await authenticatePartner(request);
    let actorLabel: string | null = partner ? `partner:${partner.name}` : null;
    const partnerClientId: string | null = partner?.client_id ?? null;
    if (!partner) {
      const auth = await requireAuth(request);
      if (auth instanceof NextResponse) return auth;
      if (!isInternalStaff(auth.user.role)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
      actorLabel = auth.user.email;
    }

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
    let caseQuery = supabase
      .from('cases')
      .select('id, case_number, status, client_id')
      .eq('id', id);
    // Tenant wall for partner callers: same 404 whether the case exists on
    // another tenant or not at all.
    if (partnerClientId) caseQuery = caseQuery.eq('client_id', partnerClientId);
    const { data: caseData, error: fetchError } = await caseQuery.single();

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

    await logAuditEvent(id, 'delivery_acknowledged', actorLabel ?? 'unknown', {
      case_number: caseData.case_number,
      acknowledged_by: body.acknowledged_by,
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
