import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';
import { isDemoMode } from '@/lib/demo-mode';
import { requireRole } from '@/lib/auth-guard';
import { applyRateLimit } from '@/lib/rate-limit-middleware';

export const dynamic = 'force-dynamic';

interface AppealAnalytics {
  total_appeals: number;
  outcomes: {
    upheld: number;
    overturned: number;
    modified: number;
    withdrawn: number;
    pending: number;
  };
  overturn_rate: number; // percentage of decided appeals that were overturned
  by_reviewer: { reviewer_id: string; total: number; upheld: number; overturned: number; modified: number; overturn_rate: number }[];
  by_service_category: { category: string; total: number; upheld: number; overturned: number; overturn_rate: number }[];
  by_denial_reason: { reason: string; total: number; overturned: number; overturn_rate: number }[];
  avg_denial_strength_upheld: number | null;
  avg_denial_strength_overturned: number | null;
  ai_agreement_stats: {
    total_feedback: number;
    agree: number;
    disagree: number;
    modified: number;
    ai_accuracy_rate: number;
  };
}

/**
 * GET /api/analytics/appeals
 *
 * Comprehensive appeal analytics: overturn rates per physician, per client,
 * per service category, per denial reason. Also includes AI recommendation
 * accuracy tracking (physician feedback loop).
 */
export async function GET(request: NextRequest) {
  try {
    const authResult = await requireRole(request, ['admin']);
    if (authResult instanceof NextResponse) return authResult;
    const rateLimited = await applyRateLimit(request, { maxRequests: 100 });
    if (rateLimited) return rateLimited;

    if (isDemoMode()) {
      const demoAnalytics: AppealAnalytics = {
        total_appeals: 12,
        outcomes: {
          upheld: 6,
          overturned: 3,
          modified: 1,
          withdrawn: 1,
          pending: 1,
        },
        overturn_rate: 30.0,
        by_reviewer: [
          { reviewer_id: 'rev-001-james-richardson', total: 5, upheld: 4, overturned: 1, modified: 0, overturn_rate: 20.0 },
          { reviewer_id: 'rev-002-priya-patel', total: 4, upheld: 2, overturned: 1, modified: 1, overturn_rate: 25.0 },
          { reviewer_id: 'rev-003-michael-torres', total: 3, upheld: 0, overturned: 1, modified: 0, overturn_rate: 100.0 },
        ],
        by_service_category: [
          { category: 'imaging', total: 4, upheld: 3, overturned: 1, overturn_rate: 25.0 },
          { category: 'surgery', total: 3, upheld: 1, overturned: 1, overturn_rate: 50.0 },
          { category: 'behavioral_health', total: 3, upheld: 2, overturned: 0, overturn_rate: 0.0 },
          { category: 'pain_management', total: 2, upheld: 0, overturned: 1, overturn_rate: 100.0 },
        ],
        by_denial_reason: [
          { reason: 'Insufficient conservative treatment', total: 4, overturned: 2, overturn_rate: 50.0 },
          { reason: 'Does not meet medical necessity criteria', total: 3, overturned: 0, overturn_rate: 0.0 },
          { reason: 'Missing documentation', total: 3, overturned: 1, overturn_rate: 33.3 },
          { reason: 'Treatment plateau reached', total: 2, overturned: 0, overturn_rate: 0.0 },
        ],
        avg_denial_strength_upheld: 82,
        avg_denial_strength_overturned: 48,
        ai_agreement_stats: {
          total_feedback: 45,
          agree: 38,
          disagree: 4,
          modified: 3,
          ai_accuracy_rate: 84.4,
        },
      };
      return NextResponse.json(demoAnalytics);
    }

    const supabase = getServiceClient();

    // Fetch all appeals with their cases
    const { data: appeals, error: appealErr } = await supabase
      .from('appeals')
      .select('*, original_case:cases!original_case_id(service_category, denial_reason, denial_strength_score, assigned_reviewer_id)');

    if (appealErr) {
      return NextResponse.json({ error: appealErr.message }, { status: 500 });
    }

    // Fetch AI agreement feedback
    const { data: feedbackCases, error: feedbackErr } = await supabase
      .from('cases')
      .select('physician_ai_agreement')
      .not('physician_ai_agreement', 'is', null);

    if (feedbackErr) {
      return NextResponse.json({ error: feedbackErr.message }, { status: 500 });
    }

    // Calculate analytics
    const total = appeals?.length || 0;
    const outcomes = { upheld: 0, overturned: 0, modified: 0, withdrawn: 0, pending: 0 };
    const reviewerMap = new Map<string, { total: number; upheld: number; overturned: number; modified: number }>();
    const categoryMap = new Map<string, { total: number; upheld: number; overturned: number }>();
    const reasonMap = new Map<string, { total: number; overturned: number }>();
    const upheldStrengths: number[] = [];
    const overturnedStrengths: number[] = [];

    for (const appeal of (appeals || [])) {
      const outcome = appeal.outcome || appeal.status;
      if (outcome === 'upheld') outcomes.upheld++;
      else if (outcome === 'overturned') outcomes.overturned++;
      else if (outcome === 'modified') outcomes.modified++;
      else if (outcome === 'withdrawn') outcomes.withdrawn++;
      else outcomes.pending++;

      const originalCase = appeal.original_case;
      const reviewerId = originalCase?.assigned_reviewer_id || appeal.original_denying_reviewer_id || 'unknown';
      const category = originalCase?.service_category || 'other';
      const reason = originalCase?.denial_reason || 'Unspecified';
      const strength = originalCase?.denial_strength_score;

      // By reviewer
      if (!reviewerMap.has(reviewerId)) reviewerMap.set(reviewerId, { total: 0, upheld: 0, overturned: 0, modified: 0 });
      const r = reviewerMap.get(reviewerId)!;
      r.total++;
      if (outcome === 'upheld') r.upheld++;
      else if (outcome === 'overturned') r.overturned++;
      else if (outcome === 'modified') r.modified++;

      // By category
      if (!categoryMap.has(category)) categoryMap.set(category, { total: 0, upheld: 0, overturned: 0 });
      const c = categoryMap.get(category)!;
      c.total++;
      if (outcome === 'upheld') c.upheld++;
      else if (outcome === 'overturned') c.overturned++;

      // By reason
      if (!reasonMap.has(reason)) reasonMap.set(reason, { total: 0, overturned: 0 });
      const rn = reasonMap.get(reason)!;
      rn.total++;
      if (outcome === 'overturned') rn.overturned++;

      // Strength correlation
      if (strength != null) {
        if (outcome === 'upheld') upheldStrengths.push(strength);
        else if (outcome === 'overturned') overturnedStrengths.push(strength);
      }
    }

    const decided = outcomes.upheld + outcomes.overturned + outcomes.modified;
    const overturnRate = decided > 0 ? Math.round((outcomes.overturned / decided) * 1000) / 10 : 0;

    // AI agreement stats
    const feedbacks = feedbackCases || [];
    const aiStats = {
      total_feedback: feedbacks.length,
      agree: feedbacks.filter(f => f.physician_ai_agreement === 'agree').length,
      disagree: feedbacks.filter(f => f.physician_ai_agreement === 'disagree').length,
      modified: feedbacks.filter(f => f.physician_ai_agreement === 'modified').length,
      ai_accuracy_rate: feedbacks.length > 0
        ? Math.round((feedbacks.filter(f => f.physician_ai_agreement === 'agree').length / feedbacks.length) * 1000) / 10
        : 0,
    };

    const avg = (arr: number[]) => arr.length > 0 ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : null;

    const analytics: AppealAnalytics = {
      total_appeals: total,
      outcomes,
      overturn_rate: overturnRate,
      by_reviewer: Array.from(reviewerMap.entries()).map(([id, d]) => ({
        reviewer_id: id, ...d,
        overturn_rate: d.total > 0 ? Math.round((d.overturned / d.total) * 1000) / 10 : 0,
      })),
      by_service_category: Array.from(categoryMap.entries()).map(([cat, d]) => ({
        category: cat, ...d,
        overturn_rate: d.total > 0 ? Math.round((d.overturned / d.total) * 1000) / 10 : 0,
      })),
      by_denial_reason: Array.from(reasonMap.entries()).map(([reason, d]) => ({
        reason, ...d,
        overturn_rate: d.total > 0 ? Math.round((d.overturned / d.total) * 1000) / 10 : 0,
      })),
      avg_denial_strength_upheld: avg(upheldStrengths),
      avg_denial_strength_overturned: avg(overturnedStrengths),
      ai_agreement_stats: aiStats,
    };

    return NextResponse.json(analytics);
  } catch (err) {
    console.error('Error fetching appeal analytics:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
