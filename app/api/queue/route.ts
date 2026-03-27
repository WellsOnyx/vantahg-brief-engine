import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';
import { isDemoMode, getDemoQueueCases } from '@/lib/demo-mode';
import { requireAuth } from '@/lib/auth-guard';
import { applyRateLimit } from '@/lib/rate-limit-middleware';
import { getTimeRemaining } from '@/lib/sla-calculator';
import type { QueueRole } from '@/lib/types';

export const dynamic = 'force-dynamic';

const VALID_ROLES: QueueRole[] = ['lpn', 'rn', 'md', 'admin'];
const ACTIVE_REVIEW_STATUSES = ['lpn_review', 'rn_review', 'md_review', 'pend_missing_info'];

export async function GET(request: NextRequest) {
  try {
    const authResult = await requireAuth(request);
    if (authResult instanceof NextResponse) return authResult;
    const rateLimited = await applyRateLimit(request, { maxRequests: 200 });
    if (rateLimited) return rateLimited;

    const { searchParams } = new URL(request.url);
    const role = searchParams.get('role') as QueueRole | null;
    const staffId = searchParams.get('staff_id');
    const reviewerId = searchParams.get('reviewer_id');

    if (!role || !VALID_ROLES.includes(role)) {
      return NextResponse.json(
        { error: 'Missing or invalid role parameter. Must be one of: lpn, rn, md, admin' },
        { status: 400 }
      );
    }

    if (role === 'lpn' && !staffId) {
      return NextResponse.json({ error: 'staff_id is required for lpn role' }, { status: 400 });
    }
    if (role === 'rn' && !staffId) {
      return NextResponse.json({ error: 'staff_id is required for rn role' }, { status: 400 });
    }
    if (role === 'md' && !reviewerId) {
      return NextResponse.json({ error: 'reviewer_id is required for md role' }, { status: 400 });
    }

    // Demo mode
    if (isDemoMode()) {
      const result = getDemoQueueCases({ role, staff_id: staffId ?? undefined, reviewer_id: reviewerId ?? undefined });
      return NextResponse.json(result);
    }

    // Production mode: Supabase queries
    const supabase = getServiceClient();
    let cases;

    switch (role) {
      case 'lpn': {
        const { data, error } = await supabase
          .from('cases')
          .select('*, reviewer:reviewers(*), client:clients(*)')
          .eq('assigned_lpn_id', staffId!)
          .in('status', ['lpn_review', 'pend_missing_info']);
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        cases = data ?? [];
        break;
      }
      case 'rn': {
        // Direct RN review cases
        const { data: rnDirect, error: rnErr } = await supabase
          .from('cases')
          .select('*, reviewer:reviewers(*), client:clients(*)')
          .eq('assigned_rn_id', staffId!)
          .eq('status', 'rn_review');
        if (rnErr) return NextResponse.json({ error: rnErr.message }, { status: 500 });

        // Find pods this RN supervises
        const { data: pods } = await supabase
          .from('pods')
          .select('id')
          .eq('rn_id', staffId!);
        const podIds = (pods ?? []).map((p: { id: string }) => p.id);

        let oversight: typeof rnDirect = [];
        if (podIds.length > 0) {
          const { data: podCases, error: podErr } = await supabase
            .from('cases')
            .select('*, reviewer:reviewers(*), client:clients(*)')
            .in('assigned_pod_id', podIds)
            .in('status', ['lpn_review', 'pend_missing_info']);
          if (podErr) return NextResponse.json({ error: podErr.message }, { status: 500 });
          oversight = podCases ?? [];
        }

        // Deduplicate
        const seen = new Set<string>();
        cases = [...(rnDirect ?? []), ...oversight].filter((c) => {
          if (seen.has(c.id)) return false;
          seen.add(c.id);
          return true;
        });
        break;
      }
      case 'md': {
        const { data, error } = await supabase
          .from('cases')
          .select('*, reviewer:reviewers(*), client:clients(*)')
          .eq('assigned_reviewer_id', reviewerId!)
          .eq('status', 'md_review');
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        cases = data ?? [];
        break;
      }
      case 'admin':
      default: {
        const { data, error } = await supabase
          .from('cases')
          .select('*, reviewer:reviewers(*), client:clients(*)')
          .in('status', ACTIVE_REVIEW_STATUSES);
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        cases = data ?? [];
        break;
      }
    }

    // Compute meta
    let overdueCount = 0;
    let criticalCount = 0;
    for (const c of cases) {
      if (c.turnaround_deadline) {
        const tr = getTimeRemaining(c.turnaround_deadline);
        if (tr.urgencyLevel === 'overdue') overdueCount++;
        else if (tr.urgencyLevel === 'critical') criticalCount++;
      }
    }

    // Count completed today
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const { count: completedToday } = await supabase
      .from('cases')
      .select('*', { count: 'exact', head: true })
      .gte('determination_at', todayStart.toISOString());

    return NextResponse.json({
      cases,
      meta: {
        total: cases.length,
        overdue_count: overdueCount,
        critical_count: criticalCount,
        completed_today: completedToday ?? 0,
      },
    });
  } catch (err) {
    console.error('Error fetching queue:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
