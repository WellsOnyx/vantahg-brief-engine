import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';
import { getAuthAdapter } from '@/lib/adapters/auth';
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
 * Supports optional ?status=brief_ready (or any valid CaseStatus) to power
 * the dedicated Concierge Review Queue (cases ready for human review of the
 * AI-generated clinical brief). When omitted, returns the broader personal queue.
 *
 * Pure work-list endpoint - no PHI beyond what's already in the cases
 * table for the case_number, patient_name, and procedure description.
 * All access is strictly scoped to the concierge's assigned client tenants.
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
  {
    id: 'demo-case-q-5',
    case_number: 'VUM-2026-00143',
    status: 'intake',
    priority: 'urgent',
    patient_name: 'D. Okafor',
    procedure_description: 'Total knee arthroplasty (CPT 27447) — voice intake',
    client_name: 'Optum (pilot)',
    created_at: new Date(Date.now() - 0.1 * 3600 * 1000).toISOString(),
    turnaround_deadline: new Date(Date.now() + 23.9 * 3600 * 1000).toISOString(),
  },
  {
    id: 'demo-case-q-6',
    case_number: 'VUM-2026-00138',
    status: 'md_review',
    priority: 'expedited',
    patient_name: 'S. Whitfield',
    procedure_description: 'Inpatient admission — CHF exacerbation (Two-Midnight)',
    client_name: 'Optum (pilot)',
    created_at: new Date(Date.now() - 9 * 3600 * 1000).toISOString(),
    turnaround_deadline: new Date(Date.now() + 3 * 3600 * 1000).toISOString(),
  },
  {
    id: 'demo-case-q-7',
    case_number: 'VUM-2026-00137',
    status: 'pend_missing_info',
    priority: 'standard',
    patient_name: 'L. Nguyen',
    procedure_description: 'Shoulder arthroscopy (CPT 29827) — awaiting op notes',
    client_name: 'Optum (pilot)',
    created_at: new Date(Date.now() - 51 * 3600 * 1000).toISOString(),
    turnaround_deadline: new Date(Date.now() - 3.4 * 3600 * 1000).toISOString(),
  },
  {
    id: 'demo-case-q-8',
    case_number: 'VUM-2026-00136',
    status: 'processing',
    priority: 'standard',
    patient_name: 'K. Douglas',
    procedure_description: 'Home health — skilled nursing x 12 visits',
    client_name: 'Sunrise Health Plan',
    created_at: new Date(Date.now() - 1.2 * 3600 * 1000).toISOString(),
    turnaround_deadline: new Date(Date.now() + 34 * 3600 * 1000).toISOString(),
  },
  {
    id: 'demo-case-q-9',
    case_number: 'VUM-2026-00135',
    status: 'brief_ready',
    priority: 'urgent',
    patient_name: 'T. Alvarez',
    procedure_description: 'PET/CT skull-to-thigh (CPT 78815) — oncology staging',
    client_name: 'Optum (pilot)',
    created_at: new Date(Date.now() - 3.5 * 3600 * 1000).toISOString(),
    turnaround_deadline: new Date(Date.now() + 6.5 * 3600 * 1000).toISOString(),
  },
  {
    id: 'demo-case-q-10',
    case_number: 'VUM-2026-00134',
    status: 'rn_review',
    priority: 'standard',
    patient_name: 'H. Broussard',
    procedure_description: 'Spinal cord stimulator trial (CPT 63650)',
    client_name: 'Garrison Benefits',
    created_at: new Date(Date.now() - 20 * 3600 * 1000).toISOString(),
    turnaround_deadline: new Date(Date.now() + 27 * 3600 * 1000).toISOString(),
  },
  {
    id: 'demo-case-q-11',
    case_number: 'VUM-2026-00133',
    status: 'lpn_review',
    priority: 'standard',
    patient_name: 'P. Castellanos',
    procedure_description: 'CT abdomen/pelvis with contrast (CPT 74178)',
    client_name: 'Acme TPA',
    created_at: new Date(Date.now() - 7.6 * 3600 * 1000).toISOString(),
    turnaround_deadline: new Date(Date.now() + 14 * 3600 * 1000).toISOString(),
  },
  // Dedicated review-ready demo item (brief_ready = AI brief complete, concierge human review gate)
  {
    id: 'demo-case-q-review-1',
    case_number: 'VUM-2026-00139',
    status: 'brief_ready',
    priority: 'standard',
    patient_name: 'J. Kim',
    procedure_description: 'Outpatient knee MRI (CPT 73721)',
    client_name: 'Acme TPA',
    created_at: new Date(Date.now() - 2 * 3600 * 1000).toISOString(),
    turnaround_deadline: new Date(Date.now() + 22 * 3600 * 1000).toISOString(),
    // Sample high-quality AI output for demo of Track B/C quality signal
    fact_check: {
      overall_score: 92,
      overall_status: 'pass',
      sections: [],
      summary: { verified: 8, unverified: 1, flagged: 0 },
      consistency_checks: [{ check: 'All checks', passed: true, detail: 'Coherent' }],
      checked_at: new Date().toISOString(),
    },
  },
];

export async function GET(request: NextRequest) {
  try {
    const rateLimited = await applyRateLimit(request, { maxRequests: 240 });
    if (rateLimited) return rateLimited;

    if (isDemoMode()) {
      // Respect status / review_ready filters in demo mode for the new concierge review queue
      const requestedStatus = request.nextUrl.searchParams.get('status');
      const reviewReadyOnly = request.nextUrl.searchParams.get('review_ready') === 'true';

      let filtered = DEMO_QUEUE;
      if (requestedStatus) {
        filtered = DEMO_QUEUE.filter((c) => c.status === requestedStatus);
      } else if (reviewReadyOnly) {
        filtered = DEMO_QUEUE.filter((c) => c.status === 'brief_ready');
      }
      return NextResponse.json({ cases: filtered });
    }

    const sessionUser = await getAuthAdapter().getSessionUser(request);
    if (!sessionUser) {
      return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
    }
    const userData = { user: { id: sessionUser.id, email: sessionUser.email } };

    const supabase = getServiceClient();
    const { data: concierge } = await supabase
      .from('concierges')
      .select('id, client_ids')
      .eq('user_id', userData.user.id)
      .maybeSingle();

    if (!concierge) {
      return NextResponse.json({ error: 'Not linked to a concierge record' }, { status: 403 });
    }

    // Support dedicated "ready for human review" queue via ?status=brief_ready
    // (or any specific status). Default = broad personal active queue.
    const requestedStatus = request.nextUrl.searchParams.get('status');
    const reviewReadyOnly = request.nextUrl.searchParams.get('review_ready') === 'true';

    let targetStatuses = ACTIVE_STATUSES;
    if (requestedStatus && ACTIVE_STATUSES.includes(requestedStatus as any)) {
      targetStatuses = [requestedStatus as any];
    } else if (reviewReadyOnly) {
      targetStatuses = ['brief_ready'];
    }

    let query = supabase
      .from('cases')
      .select('id, case_number, status, priority, patient_name, procedure_description, client_id, created_at, turnaround_deadline, fact_check, clients(name)')
      .eq('assigned_concierge_id', concierge.id)
      .in('status', targetStatuses)
      .order('turnaround_deadline', { ascending: true, nullsFirst: false })
      .limit(50);

    // Extra tenant safety: if the concierge record carries explicit client_ids, further restrict
    // (defense in depth — the assigned_concierge_id + RLS should already enforce, but explicit filter helps)
    if (concierge.client_ids && Array.isArray(concierge.client_ids) && concierge.client_ids.length > 0) {
      query = query.in('client_id', concierge.client_ids);
    }

    const { data: cases, error } = await query;

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
      // AI Automation Layer (Track C): include quality signal for review queue prioritization
      // (fact_check is JSONB, safe; only shown in brief_ready context for human gate)
      fact_check: c.fact_check ?? null,
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
