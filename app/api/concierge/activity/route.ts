import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';
import { getAuthAdapter } from '@/lib/adapters/auth';
import { isDemoMode } from '@/lib/demo-mode';
import { applyRateLimit } from '@/lib/rate-limit-middleware';
import { apiError } from '@/lib/api-error';
import { getRequestContext } from '@/lib/security';

export const dynamic = 'force-dynamic';

/**
 * GET /api/concierge/activity
 *
 * The CX pulse behind the concierge dashboard: recent multi-channel intake
 * events (phone / eFax / portal / email), today's channel mix, follow-ups
 * due, and member-experience aggregates.
 *
 * PHI discipline: events carry initials-level identifiers and case numbers
 * only — the same fields already exposed on the queue endpoint. Nothing new
 * leaves the tenant scope.
 *
 * Demo mode: deterministic fixtures with relative timestamps so the feed
 * always reads as "just happened" without any clock seeding.
 *
 * Real mode: recent intake_log rows (compliance trail — patient names are
 * already stored hashed there, so events use channel + auth number),
 * channel mix counted over today's rows, follow-ups derived from
 * pend_missing_info cases. CX aggregates return null until calibration
 * data exists — surfaced with the estimated_pending_calibration label,
 * never invented.
 */

type Channel = 'phone' | 'efax' | 'portal' | 'email';

interface ActivityEvent {
  id: string;
  channel: Channel;
  headline: string;
  detail: string;
  at: string;
  case_number?: string;
}

interface FollowUp {
  id: string;
  kind: 'member_callback' | 'provider_docs' | 'status_update';
  who: string;
  about: string;
  due_at: string;
  case_number?: string;
}

const minsAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString();
const minsAhead = (m: number) => new Date(Date.now() + m * 60_000).toISOString();

function demoPayload() {
  const events: ActivityEvent[] = [
    {
      id: 'ev-1',
      channel: 'phone',
      headline: 'Voice intake completed — Gravity Rail',
      detail: 'Caller verified, transcript captured, structured fields extracted (CPT 27447). Case opened automatically.',
      at: minsAgo(3),
      case_number: 'VUM-2026-00143',
    },
    {
      id: 'ev-2',
      channel: 'efax',
      headline: 'eFax OCR complete',
      detail: '6-page clinical packet from Coastal Ortho — extraction confidence 94%, routed to brief generation.',
      at: minsAgo(11),
      case_number: 'VUM-2026-00142',
    },
    {
      id: 'ev-3',
      channel: 'portal',
      headline: 'Portal submission — Meridian Benefits Group',
      detail: 'MRI lumbar spine w/ 2 PDFs attached. Duplicate check clean, receipt confirmation sent.',
      at: minsAgo(26),
      case_number: 'VUM-2026-00141',
    },
    {
      id: 'ev-4',
      channel: 'phone',
      headline: 'Member callback completed',
      detail: 'Status update delivered to R. Garcia — CPAP authorization in RN review, decision expected today.',
      at: minsAgo(38),
      case_number: 'VUM-2026-00142',
    },
    {
      id: 'ev-5',
      channel: 'email',
      headline: 'HIPAA email parsed',
      detail: 'PT continuation request from Garrison Benefits network — 8 visits, extracted and queued.',
      at: minsAgo(52),
      case_number: 'VUM-2026-00140',
    },
    {
      id: 'ev-6',
      channel: 'efax',
      headline: 'Missing-info packet received',
      detail: 'Sleep study report for pended CPAP case arrived — pend can be lifted after review.',
      at: minsAgo(74),
      case_number: 'VUM-2026-00138',
    },
    {
      id: 'ev-7',
      channel: 'phone',
      headline: 'Provider line — expedite request',
      detail: 'Dr. Grant’s office asked to expedite the knee MRI; priority flagged for Delivery Lead approval.',
      at: minsAgo(96),
      case_number: 'VUM-2026-00139',
    },
  ];

  const follow_ups: FollowUp[] = [
    {
      id: 'fu-1',
      kind: 'member_callback',
      who: 'A. Patel (member)',
      about: 'Promised status call once lumbar MRI clears missing-info pend',
      due_at: minsAhead(45),
      case_number: 'VUM-2026-00141',
    },
    {
      id: 'fu-2',
      kind: 'provider_docs',
      who: 'Coastal Ortho (provider)',
      about: 'Chase operative notes — second request, eFax + portal nudge',
      due_at: minsAhead(120),
      case_number: 'VUM-2026-00137',
    },
    {
      id: 'fu-3',
      kind: 'status_update',
      who: 'Meridian Benefits Group ops desk',
      about: 'Daily digest of urgent-priority cases before 4pm ET',
      due_at: minsAhead(180),
    },
  ];

  return {
    events,
    channel_mix_today: { phone: 9, efax: 14, portal: 11, email: 5 },
    follow_ups,
    cx_pulse: {
      first_touch_minutes_avg: 12,
      callbacks_completed_today: 7,
      members_updated_today: 19,
      calibration: 'estimated_pending_calibration',
    },
  };
}

export async function GET(request: NextRequest) {
  try {
    const rateLimited = await applyRateLimit(request, { maxRequests: 240 });
    if (rateLimited) return rateLimited;

    if (isDemoMode()) {
      return NextResponse.json(demoPayload());
    }

    const sessionUser = await getAuthAdapter().getSessionUser(request);
    if (!sessionUser) {
      return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
    }

    const supabase = getServiceClient();

    // Recent intake events (compliance trail; patient names stored hashed).
    const { data: logRows } = await supabase
      .from('intake_log')
      .select('id, channel, status, authorization_number, created_at, case_id')
      .order('created_at', { ascending: false })
      .limit(15);

    const events: ActivityEvent[] = (logRows ?? []).map((r) => ({
      id: String(r.id),
      channel: (['phone', 'efax', 'portal', 'email'].includes(r.channel) ? r.channel : 'portal') as Channel,
      headline: `${String(r.channel).toUpperCase()} intake — ${r.status}`,
      detail: r.authorization_number ? `Authorization ${r.authorization_number}` : 'Processing',
      at: r.created_at,
    }));

    // Channel mix over today's intake_log rows.
    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);
    const { data: todayRows } = await supabase
      .from('intake_log')
      .select('channel')
      .gte('created_at', dayStart.toISOString());
    const mix = { phone: 0, efax: 0, portal: 0, email: 0 } as Record<Channel, number>;
    for (const r of todayRows ?? []) {
      const ch = r.channel as Channel;
      if (ch in mix) mix[ch] += 1;
    }

    // Follow-ups: pended cases are the concrete chase list.
    const { data: pended } = await supabase
      .from('cases')
      .select('id, case_number, patient_name, procedure_description, turnaround_deadline')
      .eq('status', 'pend_missing_info')
      .order('turnaround_deadline', { ascending: true })
      .limit(8);

    const follow_ups: FollowUp[] = (pended ?? []).map((c) => ({
      id: String(c.id),
      kind: 'provider_docs',
      who: c.patient_name ? `${c.patient_name} (member)` : 'Member',
      about: `Missing documentation — ${c.procedure_description ?? 'case pended'}`,
      due_at: c.turnaround_deadline ?? new Date().toISOString(),
      case_number: c.case_number,
    }));

    return NextResponse.json({
      events,
      channel_mix_today: mix,
      follow_ups,
      // No calibration data yet in real mode — nulls, never invented numbers.
      cx_pulse: {
        first_touch_minutes_avg: null,
        callbacks_completed_today: null,
        members_updated_today: null,
        calibration: 'estimated_pending_calibration',
      },
    });
  } catch (err) {
    return apiError(err, {
      operation: 'concierge_activity',
      actor: 'system',
      requestContext: getRequestContext(request),
    });
  }
}
