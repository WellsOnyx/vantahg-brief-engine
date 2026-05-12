import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';
import { isDemoMode } from '@/lib/demo-mode';
import { requireRole } from '@/lib/auth-guard';
import { applyRateLimit } from '@/lib/rate-limit-middleware';
import { apiError } from '@/lib/api-error';
import { getRequestContext } from '@/lib/security';
import { listConciergesWithLoad } from '@/lib/delivery/assignment';

export const dynamic = 'force-dynamic';

/**
 * GET /api/delivery/concierges
 *
 * Returns the concierge roster with current weekly load + utilization.
 * Optional `?delivery_lead_id=` filters to a single DL's team.
 *
 * Reads are allowed for any internal-staff role that touches the delivery
 * org — admin, builder, ceo, slt, practice-lead, and the delivery-lead /
 * concierge roles themselves.
 *
 * Demo mode: returns deterministic fixtures so the DL dashboard can be
 * exercised without a real database.
 */
export async function GET(request: NextRequest) {
  try {
    const authResult = await requireRole(request, [
      'admin', 'builder', 'ceo', 'slt', 'practice-lead', 'delivery-lead', 'concierge',
    ]);
    if (authResult instanceof NextResponse) return authResult;
    const rateLimited = await applyRateLimit(request, { maxRequests: 120 });
    if (rateLimited) return rateLimited;

    const url = new URL(request.url);
    const dlFilter = url.searchParams.get('delivery_lead_id');

    if (isDemoMode()) {
      return NextResponse.json({
        demo: true,
        concierges: [
          { id: 'demo-c-1', name: 'Alex Rivera', email: 'alex@vantaum.demo', weekly_auth_cap: 300, delivery_lead_id: 'demo-dl-1', active: true, estimated_weekly_load: 210, active_client_count: 3, utilization: 0.7 },
          { id: 'demo-c-2', name: 'Sam Chen', email: 'sam@vantaum.demo', weekly_auth_cap: 300, delivery_lead_id: 'demo-dl-1', active: true, estimated_weekly_load: 145, active_client_count: 2, utilization: 0.48 },
          { id: 'demo-c-3', name: 'Jordan Patel', email: 'jordan@vantaum.demo', weekly_auth_cap: 300, delivery_lead_id: 'demo-dl-1', active: true, estimated_weekly_load: 285, active_client_count: 4, utilization: 0.95 },
        ],
      });
    }

    const supabase = getServiceClient();
    const concierges = await listConciergesWithLoad(supabase, {
      deliveryLeadId: dlFilter || undefined,
      onlyActive: true,
    });
    return NextResponse.json({ demo: false, concierges });
  } catch (err) {
    return apiError(err, {
      operation: 'list_concierges_with_load',
      actor: 'system',
      requestContext: getRequestContext(request),
    });
  }
}
