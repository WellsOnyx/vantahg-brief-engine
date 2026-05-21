import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';
import { isDemoMode } from '@/lib/demo-mode';
import { requireRole } from '@/lib/auth-guard';
import { applyRateLimit } from '@/lib/rate-limit-middleware';
import { apiError } from '@/lib/api-error';
import { getRequestContext } from '@/lib/security';
import { listConciergesWithLoad, reassignClientToConcierge } from '@/lib/delivery/assignment';
import { logAuditEvent } from '@/lib/audit';

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
      // Rich demo fixtures for the full DL operations layer.
      // Includes SLA urgency aggregates + sample urgent cases so the dashboard
      // can demonstrate white-glove visibility + one-click control without DB.
      const demoConcierges = [
        {
          id: 'demo-c-1',
          name: 'Alex Rivera',
          email: 'alex@vantaum.demo',
          weekly_auth_cap: 300,
          delivery_lead_id: 'demo-dl-1',
          active: true,
          estimated_weekly_load: 210,
          active_client_count: 3,
          utilization: 0.7,
          // Extra for DL workload + SLA views
          sla: { critical: 1, warning: 2, caution: 3, ok: 8, overdue: 0, total: 14 },
          clients: [
            { id: 'cli-acme', name: 'Acme TPA', expected_weekly: 85 },
            { id: 'cli-sunrise', name: 'Sunrise Health', expected_weekly: 70 },
            { id: 'cli-garrison', name: 'Garrison Benefits', expected_weekly: 55 },
          ],
          urgent_cases: [
            { id: 'case-dl-101', case_number: 'VUM-2401-8847', patient_name: 'Maria Lopez', status: 'brief_ready', priority: 'urgent', turnaround_deadline: new Date(Date.now() + 2.5 * 3600_000).toISOString(), sla_label: '2h 30m' },
          ],
        },
        {
          id: 'demo-c-2',
          name: 'Sam Chen',
          email: 'sam@vantaum.demo',
          weekly_auth_cap: 300,
          delivery_lead_id: 'demo-dl-1',
          active: true,
          estimated_weekly_load: 145,
          active_client_count: 2,
          utilization: 0.48,
          sla: { critical: 0, warning: 1, caution: 2, ok: 11, overdue: 0, total: 14 },
          clients: [
            { id: 'cli-pinnacle', name: 'Pinnacle Health Plan', expected_weekly: 90 },
            { id: 'cli-western', name: 'Western Employers', expected_weekly: 55 },
          ],
          urgent_cases: [],
        },
        {
          id: 'demo-c-3',
          name: 'Jordan Patel',
          email: 'jordan@vantaum.demo',
          weekly_auth_cap: 300,
          delivery_lead_id: 'demo-dl-1',
          active: true,
          estimated_weekly_load: 285,
          active_client_count: 4,
          utilization: 0.95,
          sla: { critical: 3, warning: 4, caution: 2, ok: 5, overdue: 1, total: 15 },
          clients: [
            { id: 'cli-valley', name: 'Valley Medical Group', expected_weekly: 95 },
            { id: 'cli-coastal', name: 'Coastal TPA', expected_weekly: 80 },
            { id: 'cli-midwest', name: 'Midwest Benefits', expected_weekly: 60 },
            { id: 'cli-texas', name: 'Texas Health Trust', expected_weekly: 50 },
          ],
          urgent_cases: [
            { id: 'case-dl-203', case_number: 'VUM-2405-1192', patient_name: 'Robert Kim', status: 'lpn_review', priority: 'standard', turnaround_deadline: new Date(Date.now() - 1.2 * 3600_000).toISOString(), sla_label: '1h 12m overdue' },
            { id: 'case-dl-207', case_number: 'VUM-2405-1201', patient_name: 'Elena Vargas', status: 'brief_ready', priority: 'expedited', turnaround_deadline: new Date(Date.now() + 3.8 * 3600_000).toISOString(), sla_label: '3h 48m' },
          ],
        },
      ];

      return NextResponse.json({
        demo: true,
        concierges: demoConcierges,
        pod_summary: {
          total_concierges: 3,
          total_active_cases: 43,
          at_risk: 11, // warning + critical + overdue
          critical_overdue: 4,
          aggregate_utilization: 0.71,
        },
      });
    }

    const supabase = getServiceClient();
    const concierges = await listConciergesWithLoad(supabase, {
      deliveryLeadId: dlFilter || undefined,
      onlyActive: true,
    });

    // Lightweight real pod summary (capacity view). SLA/urgent detail is richer in demo for now.
    const totalLoad = concierges.reduce((s, c) => s + c.estimated_weekly_load, 0);
    const totalCap = concierges.reduce((s, c) => s + c.weekly_auth_cap, 0);
    const aggregateUtil = totalCap > 0 ? Math.min(1, totalLoad / totalCap) : 0;
    const atCapacityCount = concierges.filter((c) => c.utilization >= 0.9).length;

    const podSummary = {
      total_concierges: concierges.length,
      total_active_cases: 0, // populated by richer case aggregation in future iteration
      at_risk: atCapacityCount,
      critical_overdue: 0,
      aggregate_utilization: aggregateUtil,
    };

    return NextResponse.json({ demo: false, concierges, pod_summary: podSummary });
  } catch (err) {
    return apiError(err, {
      operation: 'list_concierges_with_load',
      actor: 'system',
      requestContext: getRequestContext(request),
    });
  }
}

/**
 * POST /api/delivery/concierges
 *
 * Supports Delivery Lead control actions:
 *   { action: 'reassign_client', client_id, to_concierge_id, reason? }
 *
 * Returns the (possibly refreshed) roster on success so the UI can update
 * immediately with zero manual refresh friction.
 */
export async function POST(request: NextRequest) {
  try {
    const authResult = await requireRole(request, [
      'admin', 'builder', 'ceo', 'slt', 'practice-lead', 'delivery-lead',
    ]);
    if (authResult instanceof NextResponse) return authResult;

    const rateLimited = await applyRateLimit(request, { maxRequests: 60 });
    if (rateLimited) return rateLimited;

    const body = await request.json().catch(() => ({}));
    const { action, client_id, to_concierge_id, reason } = body || {};

    if (action === 'reassign_client') {
      if (!client_id || !to_concierge_id) {
        return NextResponse.json({ error: 'client_id and to_concierge_id required' }, { status: 400 });
      }

      if (isDemoMode()) {
        // Simulate rebalance instantly for white-glove demo experience.
        // In real, the lib function + DB would persist + audit.
        return NextResponse.json({
          success: true,
          message: 'Client reassigned in demo. Load bars and SLA will reflect on next refresh.',
          demo: true,
        });
      }

      const supabase = getServiceClient();
      // Who is performing? Use email from auth context if available, fallback.
      const actor = (authResult as any)?.user?.email || 'delivery-lead';

      const result = await reassignClientToConcierge(supabase, {
        client_id,
        to_concierge_id,
        assigned_by: actor,
        reason,
      });

      if (!result.ok) {
        return NextResponse.json({ error: result.message }, { status: 409 });
      }

      // Refresh the roster for the caller's pod after mutation
      const dlFilter = new URL(request.url).searchParams.get('delivery_lead_id');
      const updated = await listConciergesWithLoad(supabase, {
        deliveryLeadId: dlFilter || undefined,
        onlyActive: true,
      });

      return NextResponse.json({ success: true, message: result.message, concierges: updated, demo: false });
    }

    if (action === 'flag_second_look') {
      const { case_id, concierge_id, reason } = body || {};
      if (!case_id) {
        return NextResponse.json({ error: 'case_id is required' }, { status: 400 });
      }

      const actor = (authResult as any)?.user?.email || 'delivery-lead';
      const requestContext = getRequestContext(request);

      await logAuditEvent(
        case_id,
        'quality_second_look_requested',
        actor,
        {
          concierge_id: concierge_id || null,
          reason: reason || 'Delivery Lead requested second look',
          source: 'delivery_lead_dashboard',
        },
        requestContext
      );

      return NextResponse.json({
        success: true,
        message: 'Second-look flag recorded. Audit entry created.',
      });
    }

    return NextResponse.json({ error: 'Unsupported action' }, { status: 400 });
  } catch (err) {
    return apiError(err, {
      operation: 'delivery_concierges_post',
      actor: 'delivery-lead',
      requestContext: getRequestContext(request),
    });
  }
}
