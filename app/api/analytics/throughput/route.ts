import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';
import { isDemoMode } from '@/lib/demo-mode';
import { requireAuth } from '@/lib/auth-guard';
import { applyRateLimit } from '@/lib/rate-limit-middleware';

export const dynamic = 'force-dynamic';

interface ThroughputMetrics {
  avg_brief_generation_minutes: number;
  avg_assignment_minutes: number;
  avg_determination_minutes: number;
  avg_total_minutes: number;
  bottleneck_stage: string;
  cases_analyzed: number;
}

export async function GET(request: NextRequest) {
  try {
    const authResult = await requireAuth(request);
    if (authResult instanceof NextResponse) return authResult;
    const rateLimited = await applyRateLimit(request, { maxRequests: 60 });
    if (rateLimited) return rateLimited;

    if (isDemoMode()) {
      return NextResponse.json({
        avg_brief_generation_minutes: 2.3,
        avg_assignment_minutes: 0.5,
        avg_determination_minutes: 185,
        avg_total_minutes: 188,
        bottleneck_stage: 'physician_review',
        cases_analyzed: 24,
      } satisfies ThroughputMetrics);
    }

    const supabase = getServiceClient();
    const { searchParams } = new URL(request.url);
    const days = parseInt(searchParams.get('days') || '30', 10);
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    // Get all audit events for cases created in the window
    const { data: events, error } = await supabase
      .from('audit_log')
      .select('case_id, action, created_at')
      .in('action', [
        'case_created',
        'brief_generated',
        'auto_assigned_reviewer',
        'reviewer_assigned',
        'determination_made',
        'case_delivered',
      ])
      .gte('created_at', since)
      .order('created_at', { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Group events by case_id
    const caseEvents: Record<string, Record<string, string>> = {};
    for (const event of events || []) {
      if (!caseEvents[event.case_id]) {
        caseEvents[event.case_id] = {};
      }
      // Keep the first occurrence of each action
      if (!caseEvents[event.case_id][event.action]) {
        caseEvents[event.case_id][event.action] = event.created_at;
      }
    }

    // Calculate averages
    let briefTimes: number[] = [];
    let assignTimes: number[] = [];
    let determinationTimes: number[] = [];
    let totalTimes: number[] = [];

    for (const caseId in caseEvents) {
      const e = caseEvents[caseId];
      const created = e['case_created'];
      const briefed = e['brief_generated'];
      const assigned = e['auto_assigned_reviewer'] || e['reviewer_assigned'];
      const determined = e['determination_made'];

      if (created && briefed) {
        briefTimes.push((new Date(briefed).getTime() - new Date(created).getTime()) / 60000);
      }
      if (briefed && assigned) {
        assignTimes.push((new Date(assigned).getTime() - new Date(briefed).getTime()) / 60000);
      }
      if (assigned && determined) {
        determinationTimes.push((new Date(determined).getTime() - new Date(assigned).getTime()) / 60000);
      }
      if (created && determined) {
        totalTimes.push((new Date(determined).getTime() - new Date(created).getTime()) / 60000);
      }
    }

    const avg = (arr: number[]) => arr.length ? Math.round((arr.reduce((a, b) => a + b, 0) / arr.length) * 10) / 10 : 0;

    const avgBrief = avg(briefTimes);
    const avgAssign = avg(assignTimes);
    const avgDetermination = avg(determinationTimes);

    // Find bottleneck
    const stages = [
      { name: 'brief_generation', avg: avgBrief },
      { name: 'assignment', avg: avgAssign },
      { name: 'physician_review', avg: avgDetermination },
    ];
    const bottleneck = stages.reduce((a, b) => a.avg > b.avg ? a : b);

    return NextResponse.json({
      avg_brief_generation_minutes: avgBrief,
      avg_assignment_minutes: avgAssign,
      avg_determination_minutes: avgDetermination,
      avg_total_minutes: avg(totalTimes),
      bottleneck_stage: bottleneck.name,
      cases_analyzed: Object.keys(caseEvents).length,
    } satisfies ThroughputMetrics);
  } catch (err) {
    console.error('Error computing throughput:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
