import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';
import { createServerClient } from '@/lib/supabase-server';
import { isDemoMode } from '@/lib/demo-mode';
import { applyRateLimit } from '@/lib/rate-limit-middleware';
import { apiError } from '@/lib/api-error';
import { getRequestContext } from '@/lib/security';

export const dynamic = 'force-dynamic';

/**
 * GET /api/concierge/queue
 *
 * Returns the active worklist for the signed-in concierge - cases
 * assigned to them, sorted by SLA urgency (overdue first, then
 * approaching deadline, then everything else by created_at desc).
 *
 * Pure work-list endpoint - no PHI beyond what's already in the cases
 * table for the case_number, patient_name (masked at display layer if
 * needed), and procedure description.
 */

const ACTIVE_STATUSES = ['intake', 'processing', 'brief_ready', 'lpn_review', 'rn_review', 'md_review', 'pend_missing_info'];

const DEMO_QUEUE = [
  {
    id: 'demo-case-q-1',
    case_number: 'VUM-2026-00142',
    status: 'rn_review',
    priority: 'urgent',
    patient_name: 'R. Garcia',
    procedure_description: 'CPAP device (HCPCS E0601)',
    client_name: 'Acme TPA',
    created_at: new Date(Date.now() - 6 * 3600 * 1000).toISOString(),
    turnaround_deadline: new Date(Date.now() + 1.5 * 3600 * 1000).toISOString(),
  },
  {
    id: 'demo-case-q-2',
    case_number: 'VUM-2026-00141',
    status: 'pend_missing_info',
    priority: 'standard',
    patient_name: 'A. Patel',
    procedure_description: 'MRI lumbar spine',
    client_name: 'Sunrise Health Plan',
    created_at: new Date(Date.now() - 28 * 3600 * 1000).toISOString(),
    turnaround_deadline: new Date(Date.now() - 1.2 * 3600 * 1000).toISOString(),
  },
  {
    id: 'demo-case-q-3',
    case_number: 'VUM-2026-00140',
    status: 'lpn_review',
    priority: 'standard',
    patient_name: 'M. Wong',
    procedure_description: 'Physical therapy x 8 visits',
    client_name: 'Garrison Benefits',
    created_at: new Date(Date.now() - 4 * 3600 * 1000).toISOString(),
    turnaround_deadline: new Date(Date.now() + 18 * 3600 * 1000).toISOString(),
  },
];

export async function GET(request: NextRequest) {
  try {
    const rateLimited = await applyRateLimit(request, { maxRequests: 240 });
    if (rateLimited) return rateLimited;

    if (isDemoMode()) {
      return NextResponse.json({ cases: DEMO_QUEUE });
    }

    const ssr = await createServerClient();
    const { data: userData, error: userErr } = await ssr.auth.getUser();
    if (userErr || !userData?.user) {
      return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
    }

    const supabase = getServiceClient();
    const { data: concierge } = await supabase
      .from('concierges')
      .select('id')
      .eq('user_id', userData.user.id)
      .maybeSingle();

    if (!concierge) {
      return NextResponse.json({ error: 'Not linked to a concierge record' }, { status: 403 });
    }

    const { data: cases, error } = await supabase
      .from('cases')
      .select('id, case_number, status, priority, patient_name, procedure_description, client_id, created_at, turnaround_deadline, clients(name)')
      .eq('assigned_concierge_id', concierge.id)
      .in('status', ACTIVE_STATUSES)
      .order('turnaround_deadline', { ascending: true, nullsFirst: false })
      .limit(50);

    if (error) {
      return apiError(error, {
        operation: 'concierge_queue',
        actor: userData.user.email ?? '(unknown)',
        requestContext: getRequestContext(request),
      });
    }

    const shaped = (cases ?? []).map((c) => ({
      id: c.id,
      case_number: c.case_number,
      status: c.status,
      priority: c.priority,
      patient_name: c.patient_name,
      procedure_description: c.procedure_description,
      client_name: (c.clients as { name?: string } | null)?.name ?? null,
      created_at: c.created_at,
      turnaround_deadline: c.turnaround_deadline,
    }));

    return NextResponse.json({ cases: shaped });
  } catch (err) {
    return apiError(err, {
      operation: 'concierge_queue',
      actor: 'system',
      requestContext: getRequestContext(request),
    });
  }
}
