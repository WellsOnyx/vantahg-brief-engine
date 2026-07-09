import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';
import { getAuthAdapter } from '@/lib/adapters/auth';
import { isDemoMode } from '@/lib/demo-mode';
import { applyRateLimit } from '@/lib/rate-limit-middleware';
import { apiError } from '@/lib/api-error';
import { getRequestContext } from '@/lib/security';
import { deriveConciergeQueue } from '@/lib/demo-live-queue';

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

export async function GET(request: NextRequest) {
  try {
    const rateLimited = await applyRateLimit(request, { maxRequests: 240 });
    if (rateLimited) return rateLimited;

    if (isDemoMode()) {
      // Demo queue is DERIVED from the real demo case layer (lib/demo-data via
      // lib/demo-live), so every row's id resolves at /cases/[id] with the full
      // brief / fact-check / audit detail. Respect the status / review_ready
      // filters for the concierge review queue.
      const requestedStatus = request.nextUrl.searchParams.get('status');
      const reviewReadyOnly = request.nextUrl.searchParams.get('review_ready') === 'true';

      let filtered = deriveConciergeQueue();
      if (requestedStatus) {
        filtered = filtered.filter((c) => c.status === requestedStatus);
      } else if (reviewReadyOnly) {
        filtered = filtered.filter((c) => c.status === 'brief_ready');
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
