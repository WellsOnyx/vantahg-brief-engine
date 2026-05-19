import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, requireRole } from '@/lib/auth-guard';
import { applyRateLimit } from '@/lib/rate-limit-middleware';
import { getServiceClient } from '@/lib/supabase';
import { apiError } from '@/lib/api-error';
import { getRequestContext } from '@/lib/security';

export const dynamic = 'force-dynamic';

/**
 * GET /api/attorney/queue
 *
 * Returns Payer IDR cases for the Attorney Review Queue.
 * Currently scoped to all payer_idr cases the authenticated user can see.
 * Will be tightened when IDR Attorney role + case assignments are implemented (Tasks 4 & 5).
 */
export async function GET(request: NextRequest) {
  try {
    // Require IDR Attorney role (or admin for now during development)
    const authResult = await requireRole(request, ['idr-attorney', 'admin']);
    if (authResult instanceof NextResponse) return authResult;

    const rateLimited = await applyRateLimit(request, { maxRequests: 100 });
    if (rateLimited) return rateLimited;

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100);

    const supabase = getServiceClient();

    let query = supabase
      .from('cases')
      .select(`
        id,
        case_number,
        status,
        priority,
        created_at,
        turnaround_deadline,
        patient_name,
        procedure_description,
        payer_name,
        case_type,
        assigned_reviewer_id
      `)
      .eq('case_type', 'payer_idr')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (status) {
      query = query.eq('status', status);
    }

    const { data, error } = await query;

    if (error) {
      return apiError(error, {
        operation: 'attorney_queue_list',
        actor: authResult.user.email,
        requestContext: getRequestContext(request),
      });
    }

    return NextResponse.json({
      cases: data ?? [],
      meta: {
        count: data?.length ?? 0,
        case_type: 'payer_idr',
      },
    });
  } catch (err) {
    return apiError(err, {
      operation: 'attorney_queue',
      actor: 'system',
      requestContext: getRequestContext(request),
    });
  }
}
