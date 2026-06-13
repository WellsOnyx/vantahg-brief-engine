import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';
import { getAuthAdapter } from '@/lib/adapters/auth';
import { isDemoMode } from '@/lib/demo-mode';
import { applyRateLimit } from '@/lib/rate-limit-middleware';
import { logAuditEvent } from '@/lib/audit';
import { getRequestContext } from '@/lib/security';

export const dynamic = 'force-dynamic';

/**
 * POST /api/concierge/touchpoints
 *
 * Log a relationship touch on a case — typically the first outbound
 * callback a new intake ping asks for. Logging a first-contact
 * touchpoint closes the ping in /api/concierge/pings.
 *
 * Body: { case_id, outcome, channel?, notes?, is_first_contact? }
 */

const VALID_OUTCOMES = [
  'reached',
  'voicemail',
  'no_answer',
  'left_message',
  'scheduled_callback',
  'email_sent',
];
const VALID_CHANNELS = ['phone', 'email', 'efax', 'portal_message'];

export async function POST(request: NextRequest) {
  try {
    const rateLimited = await applyRateLimit(request, { maxRequests: 120 });
    if (rateLimited) return rateLimited;

    const body = await request.json().catch(() => null);
    if (!body?.case_id || typeof body.case_id !== 'string') {
      return NextResponse.json({ error: 'case_id is required' }, { status: 400 });
    }
    if (!body.outcome || !VALID_OUTCOMES.includes(body.outcome)) {
      return NextResponse.json(
        { error: `outcome must be one of: ${VALID_OUTCOMES.join(', ')}` },
        { status: 400 }
      );
    }
    const channel = body.channel ?? 'phone';
    if (!VALID_CHANNELS.includes(channel)) {
      return NextResponse.json(
        { error: `channel must be one of: ${VALID_CHANNELS.join(', ')}` },
        { status: 400 }
      );
    }
    const isFirstContact = body.is_first_contact !== false;

    if (isDemoMode()) {
      return NextResponse.json(
        {
          logged: true,
          demo: true,
          touchpoint: {
            id: `demo-tp-${body.case_id}`,
            case_id: body.case_id,
            outcome: body.outcome,
            channel,
            is_first_contact: isFirstContact,
          },
        },
        { status: 201, headers: { 'X-Demo-Mode': 'true' } }
      );
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

    // Tenant guard: the case must belong to one of this concierge's clients.
    const { data: caseRow } = await supabase
      .from('cases')
      .select('id, client_id')
      .eq('id', body.case_id)
      .maybeSingle();
    if (!caseRow || !(concierge.client_ids ?? []).includes(caseRow.client_id)) {
      // Same shape for "missing" and "not yours" — don't leak existence.
      return NextResponse.json({ error: 'Case not found' }, { status: 404 });
    }

    const { data: touchpoint, error: insertErr } = await supabase
      .from('concierge_touchpoints')
      .insert({
        case_id: body.case_id,
        concierge_id: concierge.id,
        direction: 'outbound',
        channel,
        outcome: body.outcome,
        notes: typeof body.notes === 'string' && body.notes.trim() ? body.notes.trim() : null,
        is_first_contact: isFirstContact,
      })
      .select()
      .single();
    if (insertErr) {
      return NextResponse.json({ error: insertErr.message }, { status: 500 });
    }

    // PHI-safe: outcome + channel only, never notes (free text may carry PHI).
    await logAuditEvent(
      body.case_id,
      'concierge_touchpoint_logged',
      sessionUser.email ?? sessionUser.id,
      { outcome: body.outcome, channel, is_first_contact: isFirstContact },
      getRequestContext(request)
    );

    return NextResponse.json({ logged: true, touchpoint }, { status: 201 });
  } catch (err) {
    console.error('Concierge touchpoint POST error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
