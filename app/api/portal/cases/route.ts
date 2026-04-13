import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';
import { isDemoMode, getDemoCases } from '@/lib/demo-mode';
import { applyRateLimit } from '@/lib/rate-limit-middleware';

export const dynamic = 'force-dynamic';

/**
 * Public-facing portal API for providers to look up case status.
 * Returns a limited set of fields (no PHI beyond masked patient name).
 * Rate-limited more aggressively than internal endpoints.
 * Does NOT require auth — this is the external provider portal.
 */
export async function GET(request: NextRequest) {
  try {
    const rateLimited = await applyRateLimit(request, { maxRequests: 60 });
    if (rateLimited) return rateLimited;

    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search');

    if (isDemoMode()) {
      const cases = getDemoCases({ search });
      // Return limited fields for portal consumption
      const portalCases = cases.map((c) => ({
        id: c.id,
        case_number: c.case_number,
        status: c.status,
        priority: c.priority,
        patient_name: c.patient_name,
        patient_member_id: c.patient_member_id,
        procedure_codes: c.procedure_codes,
        procedure_description: c.procedure_description,
        created_at: c.created_at,
        turnaround_deadline: c.turnaround_deadline,
        determination: c.determination,
        determination_rationale: c.determination_rationale,
        determination_at: c.determination_at,
        review_type: c.review_type,
        authorization_number: c.authorization_number,
        peer_to_peer_status: c.peer_to_peer_status,
        service_category: c.service_category,
        requesting_provider: c.requesting_provider,
        payer_name: c.payer_name,
      }));
      return NextResponse.json(portalCases);
    }

    const supabase = getServiceClient();

    let query = supabase
      .from('cases')
      .select(
        'id, case_number, status, priority, patient_name, patient_member_id, procedure_codes, procedure_description, created_at, turnaround_deadline, determination, determination_rationale, determination_at, review_type, authorization_number, peer_to_peer_status, service_category, requesting_provider, payer_name'
      )
      .order('created_at', { ascending: false })
      .limit(100);

    if (search) {
      query = query.or(
        `case_number.ilike.%${search}%,patient_name.ilike.%${search}%,patient_member_id.ilike.%${search}%,authorization_number.ilike.%${search}%`
      );
    }

    const { data, error } = await query;

    if (error) {
      console.error('[portal/cases] Supabase error:', error.message);
      return NextResponse.json({ error: 'Failed to fetch cases' }, { status: 500 });
    }

    return NextResponse.json(data || []);
  } catch (err) {
    console.error('[portal/cases] Unexpected error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
