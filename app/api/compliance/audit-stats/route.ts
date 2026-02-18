import { NextResponse } from 'next/server';
import { isDemoMode } from '@/lib/demo-mode';
import { getServiceClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

/**
 * GET /api/compliance/audit-stats
 *
 * Returns aggregate audit-log statistics for the compliance dashboard.
 * No PHI is returned — only counts and security event metadata.
 */
export async function GET() {
  if (isDemoMode()) {
    return NextResponse.json(
      { error: 'Audit stats unavailable in demo mode' },
      { status: 503 }
    );
  }

  try {
    const supabase = getServiceClient();
    const now = new Date();

    // Total count
    const { count: total, error: totalErr } = await supabase
      .from('audit_log')
      .select('*', { count: 'exact', head: true });

    if (totalErr) throw totalErr;

    // This week (Monday 00:00 UTC)
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - now.getDay() + (now.getDay() === 0 ? -6 : 1));
    weekStart.setHours(0, 0, 0, 0);

    const { count: thisWeek, error: weekErr } = await supabase
      .from('audit_log')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', weekStart.toISOString());

    if (weekErr) throw weekErr;

    // Today
    const dayStart = new Date(now);
    dayStart.setHours(0, 0, 0, 0);

    const { count: today, error: dayErr } = await supabase
      .from('audit_log')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', dayStart.toISOString());

    if (dayErr) throw dayErr;

    // Last 10 security events (action starts with "security:")
    const { data: securityEvents, error: secErr } = await supabase
      .from('audit_log')
      .select('id, created_at, action, actor, details')
      .like('action', 'security:%')
      .order('created_at', { ascending: false })
      .limit(10);

    if (secErr) throw secErr;

    return NextResponse.json({
      total: total ?? 0,
      thisWeek: thisWeek ?? 0,
      today: today ?? 0,
      recentSecurityEvents: securityEvents ?? [],
    });
  } catch (err) {
    console.error('Failed to fetch audit stats:', err);
    return NextResponse.json(
      { error: 'Failed to fetch audit statistics' },
      { status: 500 }
    );
  }
}
