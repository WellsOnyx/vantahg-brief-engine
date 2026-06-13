import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';
import { getAuthAdapter } from '@/lib/adapters/auth';
import { isDemoMode, getDemoCases } from '@/lib/demo-mode';
import { applyRateLimit } from '@/lib/rate-limit-middleware';
import { buildPings, type Touchpoint } from '@/lib/concierge/pings';
import type { Case } from '@/lib/types';

export const dynamic = 'force-dynamic';

/**
 * GET /api/concierge/pings
 *
 * Open intake pings for the signed-in concierge: active cases from
 * their client tenants that have not had the first outbound
 * relationship call logged yet. Every entry point — eFax, Gravity
 * Rails agent, live call, call center, client portal, manual entry —
 * funnels into the same case engine, so this is the single feed.
 *
 * Sorted most-overdue first against the 30-minute callback target.
 */

/**
 * Demo: spread the demo cases across all six entry points so the feed
 * shows the full intake fan-in. Demo fixtures are all 'portal' today;
 * the rotation here is presentation-only.
 */
const DEMO_CHANNEL_ROTATION = ['efax', 'api', 'phone', 'email', 'portal', 'batch_upload'];

export async function GET(request: NextRequest) {
  try {
    const rateLimited = await applyRateLimit(request, { maxRequests: 240 });
    if (rateLimited) return rateLimited;

    if (isDemoMode()) {
      const demoCases = getDemoCases().map((c, i) => ({
        ...c,
        intake_channel: DEMO_CHANNEL_ROTATION[i % DEMO_CHANNEL_ROTATION.length],
        client_name: i % 2 === 0 ? 'Southwest Administrators' : 'Pinnacle Health Plan',
      }));
      return NextResponse.json({ pings: buildPings(demoCases, []) });
    }

    const sessionUser = await getAuthAdapter().getSessionUser(request);
    if (!sessionUser) {
      return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
    }

    const supabase = getServiceClient();
    const { data: concierge } = await supabase
      .from('concierges')
      .select('id, client_ids')
      .eq('user_id', sessionUser.id)
      .maybeSingle();
    if (!concierge) {
      return NextResponse.json({ error: 'Not linked to a concierge record' }, { status: 403 });
    }

    const clientIds: string[] = concierge.client_ids ?? [];
    if (clientIds.length === 0) {
      return NextResponse.json({ pings: [] });
    }

    const { data: cases, error: casesErr } = await supabase
      .from('cases')
      .select('*, client:clients(name)')
      .in('client_id', clientIds)
      .in('status', [
        'intake',
        'processing',
        'brief_ready',
        'lpn_review',
        'rn_review',
        'md_review',
        'pend_missing_info',
      ]);
    if (casesErr) {
      return NextResponse.json({ error: casesErr.message }, { status: 500 });
    }

    const caseRows = (cases ?? []).map((c: Case & { client?: { name: string } | null }) => ({
      ...c,
      client_name: c.client?.name ?? null,
    }));

    let touchpoints: Pick<Touchpoint, 'case_id' | 'direction' | 'is_first_contact'>[] = [];
    if (caseRows.length > 0) {
      const { data: tps, error: tpErr } = await supabase
        .from('concierge_touchpoints')
        .select('case_id, direction, is_first_contact')
        .in('case_id', caseRows.map((c) => c.id));
      if (tpErr) {
        return NextResponse.json({ error: tpErr.message }, { status: 500 });
      }
      touchpoints = tps ?? [];
    }

    return NextResponse.json({ pings: buildPings(caseRows, touchpoints) });
  } catch (err) {
    console.error('Concierge pings GET error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
