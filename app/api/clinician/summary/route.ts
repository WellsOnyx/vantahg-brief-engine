import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';
import { isDemoMode, getDemoStaffMember, getDemoQueueCases, getDemoQualityAudits } from '@/lib/demo-mode';
import { requireAuth } from '@/lib/auth-guard';
import { applyRateLimit } from '@/lib/rate-limit-middleware';
import { buildDayPlan } from '@/lib/clinician/day-planner';
import type { Case, QualityAudit, Staff } from '@/lib/types';

export const dynamic = 'force-dynamic';

/**
 * GET /api/clinician/summary?staff_id=<uuid>
 *
 * Personal day view for an LPN or RN: their staff record, an
 * EDF-ordered day plan over their active queue (lib/clinician/
 * day-planner.ts), and a summary of their recent quality audits.
 *
 * The plan only covers cases the clinician must personally work —
 * LPN: assigned_lpn_id in (lpn_review, pend_missing_info);
 * RN: assigned_rn_id in rn_review. RN pod-oversight cases are LPN
 * work and belong in /api/queue, not in a personal schedule.
 */

interface QualitySummary {
  audit_count: number;
  avg_overall_score: number | null;
  sla_compliance_rate: number | null;
  last_audit_at: string | null;
}

function summarizeAudits(audits: QualityAudit[]): QualitySummary {
  const completed = audits.filter((a) => a.status === 'completed');
  if (completed.length === 0) {
    return { audit_count: 0, avg_overall_score: null, sla_compliance_rate: null, last_audit_at: null };
  }
  const avg = completed.reduce((sum, a) => sum + a.overall_score, 0) / completed.length;
  const slaRate = completed.filter((a) => a.sla_compliance).length / completed.length;
  const last = completed
    .map((a) => a.created_at)
    .sort()
    .at(-1);
  return {
    audit_count: completed.length,
    avg_overall_score: Math.round(avg * 10) / 10,
    sla_compliance_rate: Math.round(slaRate * 1000) / 1000,
    last_audit_at: last ?? null,
  };
}

export async function GET(request: NextRequest) {
  try {
    const authResult = await requireAuth(request);
    if (authResult instanceof NextResponse) return authResult;
    const rateLimited = await applyRateLimit(request, { maxRequests: 200 });
    if (rateLimited) return rateLimited;

    const { searchParams } = new URL(request.url);
    const staffId = searchParams.get('staff_id');
    if (!staffId) {
      return NextResponse.json({ error: 'staff_id is required' }, { status: 400 });
    }

    if (isDemoMode()) {
      const staff = getDemoStaffMember(staffId);
      if (!staff) {
        return NextResponse.json({ error: 'Staff member not found' }, { status: 404 });
      }
      if (staff.role !== 'lpn' && staff.role !== 'rn') {
        return NextResponse.json(
          { error: 'Day plan is only available for lpn and rn roles' },
          { status: 400 }
        );
      }
      const { cases } = getDemoQueueCases({ role: staff.role, staff_id: staffId });
      // getDemoQueueCases adds pod-oversight cases for RNs; keep only
      // the cases this RN personally reviews.
      const personal =
        staff.role === 'rn'
          ? cases.filter((c) => c.assigned_rn_id === staffId && c.status === 'rn_review')
          : cases;
      const audits = getDemoQualityAudits(undefined, staffId);
      return NextResponse.json({
        staff,
        plan: buildDayPlan(personal, staff),
        quality: summarizeAudits(audits),
      });
    }

    const supabase = getServiceClient();

    const { data: staff, error: staffErr } = await supabase
      .from('staff')
      .select('*')
      .eq('id', staffId)
      .single();
    if (staffErr || !staff) {
      return NextResponse.json({ error: 'Staff member not found' }, { status: 404 });
    }
    const typedStaff = staff as Staff;
    if (typedStaff.role !== 'lpn' && typedStaff.role !== 'rn') {
      return NextResponse.json(
        { error: 'Day plan is only available for lpn and rn roles' },
        { status: 400 }
      );
    }

    const queueQuery =
      typedStaff.role === 'lpn'
        ? supabase
            .from('cases')
            .select('*')
            .eq('assigned_lpn_id', staffId)
            .in('status', ['lpn_review', 'pend_missing_info'])
        : supabase
            .from('cases')
            .select('*')
            .eq('assigned_rn_id', staffId)
            .eq('status', 'rn_review');
    const { data: cases, error: casesErr } = await queueQuery;
    if (casesErr) {
      return NextResponse.json({ error: casesErr.message }, { status: 500 });
    }

    const { data: audits, error: auditsErr } = await supabase
      .from('quality_audits')
      .select('*')
      .eq('audited_staff_id', staffId)
      .order('created_at', { ascending: false })
      .limit(25);
    if (auditsErr) {
      return NextResponse.json({ error: auditsErr.message }, { status: 500 });
    }

    return NextResponse.json({
      staff: typedStaff,
      plan: buildDayPlan((cases ?? []) as Case[], typedStaff),
      quality: summarizeAudits((audits ?? []) as QualityAudit[]),
    });
  } catch (err) {
    console.error('Clinician summary GET error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
