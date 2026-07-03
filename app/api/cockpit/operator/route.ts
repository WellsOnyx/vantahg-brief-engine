import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth-guard';
import { applyRateLimit } from '@/lib/rate-limit-middleware';
import { isDemoMode } from '@/lib/demo-mode';
import { getServiceClient } from '@/lib/supabase';
import { getRequestContext } from '@/lib/security';

/**
 * GET /api/cockpit/operator
 *
 * Durable per-operator completed-count + streak, computed from audit_log.
 * The audit record is the product — no client-side approximations.
 * completion + consistency only. estimated_pending_calibration.
 *
 * Returns counts of determination_made / case_delivered by actor, and current streak (consecutive days with activity, back from today).
 */
export async function GET(request: NextRequest) {
  const authResult = await requireRole(request, ['admin', 'delivery_lead']);
  if (authResult instanceof NextResponse) return authResult;
  const rateLimited = await applyRateLimit(request, { maxRequests: 100 });
  if (rateLimited) return rateLimited;

  if (isDemoMode()) {
    // Demo seed for operator stats (completion + consistency)
    return NextResponse.json({
      operators: [
        { actor: 'demo-cx@local', completed_count: 42, current_streak_days: 5, last_activity: new Date().toISOString() },
        { actor: 'demo-arbiter@local', completed_count: 18, current_streak_days: 3, last_activity: new Date().toISOString() },
      ],
      generated_at: new Date().toISOString(),
      note: 'demo; real from audit_log when not demo. estimated_pending_calibration',
    });
  }

  try {
    const supabase = getServiceClient();
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);

    // Fetch recent determination and delivery events for aggregation
    const { data: events, error } = await supabase
      .from('audit_log')
      .select('actor, created_at, action')
      .in('action', ['determination_made', 'case_delivered', 'attorney_determination_made'])
      .gte('created_at', new Date(now.getTime() - 90 * 24 * 3600 * 1000).toISOString()) // last 90d
      .order('created_at', { ascending: false })
      .limit(5000);

    if (error) throw error;

    // Per actor counts
    const countByActor: Record<string, number> = {};
    const datesByActor: Record<string, Set<string>> = {};

    for (const e of events || []) {
      const actor = e.actor || 'unknown';
      countByActor[actor] = (countByActor[actor] || 0) + 1;
      const d = (e.created_at as string).slice(0, 10);
      if (!datesByActor[actor]) datesByActor[actor] = new Set();
      datesByActor[actor].add(d);
    }

    const operators = Object.keys(countByActor).map((actor) => {
      const dates = Array.from(datesByActor[actor] || []).sort().reverse(); // newest first
      let streak = 0;
      let cursor = new Date(todayStr);
      for (const d of dates) {
        const cursorStr = cursor.toISOString().slice(0, 10);
        if (d === cursorStr) {
          streak++;
          cursor.setDate(cursor.getDate() - 1);
        } else {
          break;
        }
      }
      return {
        actor,
        completed_count: countByActor[actor],
        current_streak_days: streak,
        last_activity: dates[0] || null,
      };
    });

    // sort by count desc
    operators.sort((a, b) => b.completed_count - a.completed_count);

    return NextResponse.json({
      operators,
      generated_at: new Date().toISOString(),
      note: 'computed from audit_log. completion + consistency only. estimated_pending_calibration',
    });
  } catch (err) {
    console.error('operator stats error', err);
    return NextResponse.json({ error: 'failed to compute operator stats' }, { status: 500 });
  }
}
