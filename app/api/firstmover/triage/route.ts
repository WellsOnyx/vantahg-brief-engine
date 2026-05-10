import { NextRequest, NextResponse } from 'next/server';
import { applyRateLimit } from '@/lib/rate-limit-middleware';
import { isDemoMode, getDemoCases } from '@/lib/demo-mode';
import { getServiceClient, hasSupabaseConfig } from '@/lib/supabase';
import { triageBatch, summarizeBatch, laneToReviewerRole } from '@/lib/firstmover/triage';
import { logAuditEvent } from '@/lib/audit';
import type { Case } from '@/lib/types';

export const dynamic = 'force-dynamic';

/**
 * POST /api/firstmover/triage
 *
 * Body: { case_ids: string[]; apply?: boolean }
 *
 * Without apply: returns { decisions, summary } for preview.
 * With apply=true: also writes priority + review_type + audit entries.
 */
export async function POST(request: NextRequest) {
  const rateLimited = await applyRateLimit(request, { maxRequests: 30 });
  if (rateLimited) return rateLimited;

  let body: { case_ids?: string[]; apply?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { case_ids, apply = false } = body;
  if (!Array.isArray(case_ids) || case_ids.length === 0) {
    return NextResponse.json({ error: 'case_ids must be a non-empty array' }, { status: 400 });
  }
  if (case_ids.length > 500) {
    return NextResponse.json({ error: 'Batch size limited to 500' }, { status: 400 });
  }

  // Load cases (demo or live)
  let cases: Case[] = [];
  if (isDemoMode() || !hasSupabaseConfig()) {
    const demoSet = getDemoCases();
    cases = demoSet.filter((c) => case_ids.includes(c.id));
  } else {
    const supabase = getServiceClient();
    const { data, error } = await supabase
      .from('cases')
      .select('*')
      .in('id', case_ids);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    cases = (data as Case[]) || [];
  }

  if (cases.length === 0) {
    return NextResponse.json({ error: 'No cases found for given IDs' }, { status: 404 });
  }

  const decisions = triageBatch(cases.map((c) => ({ case: c })));
  const summary = summarizeBatch(decisions);

  if (!apply) {
    return NextResponse.json({ decisions, summary, applied: false });
  }

  // Apply: update priority and write audit entries.
  // We do NOT auto-assign reviewer_id here — that's a separate concern owned
  // by `lib/assignment-engine.ts` and pod assignment. Triage only decides
  // the lane and priority; assignment picks the specific reviewer.
  const failures: Array<{ case_id: string; error: string }> = [];

  if (isDemoMode() || !hasSupabaseConfig()) {
    // Demo mode: just log to audit (which falls through to console)
    for (const d of decisions) {
      await logAuditEvent(
        d.case_id,
        'firstmover_triage_applied',
        'firstmover_triage',
        { lane: d.lane, priority: d.priority, reasons: d.reasons, confidence: d.confidence }
      );
    }
  } else {
    const supabase = getServiceClient();
    for (const d of decisions) {
      const { error } = await supabase
        .from('cases')
        .update({
          priority: d.priority,
          // We don't overwrite review_type because it has UM-specific semantics
          // (prior_auth, concurrent, etc). Triage records its lane in audit.
        })
        .eq('id', d.case_id);
      if (error) {
        failures.push({ case_id: d.case_id, error: error.message });
        continue;
      }
      await logAuditEvent(
        d.case_id,
        'firstmover_triage_applied',
        'firstmover_triage',
        { lane: d.lane, priority: d.priority, reasons: d.reasons, confidence: d.confidence }
      );
    }
  }

  return NextResponse.json({
    decisions,
    summary,
    applied: true,
    applied_count: decisions.length - failures.length,
    failures,
    // Hint to clients on next-step assignment
    suggested_reviewer_roles: decisions.reduce<Record<string, string>>((m, d) => {
      m[d.case_id] = laneToReviewerRole(d.lane);
      return m;
    }, {}),
  });
}
