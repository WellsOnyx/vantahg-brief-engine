import { NextRequest, NextResponse } from 'next/server';
import { applyRateLimit } from '@/lib/rate-limit-middleware';
import { logAuditEvent } from '@/lib/audit';
import { PROMPT_VERSION } from '@/lib/firstmover/agent-prompt';

export const dynamic = 'force-dynamic';

const ALLOWED_REASONS = new Set([
  'eligibility_red',
  'expedited_request',
  'inpatient_late_notification',
  'peer_to_peer_or_appeal',
  'caller_distress',
  'repeated_missing_field',
  'uncertain',
  'other',
]);

/**
 * Agent escalation handoff. The GR agent calls this when it can't (or
 * shouldn't) complete intake itself. Records an audit entry and
 * (in the future) routes a notification to the on-call human concierge.
 *
 * For v1, this is a logged event — the human follow-up loop is wired in
 * a follow-up: notification dispatch, ticket creation, GR call-transfer.
 */
export async function POST(request: NextRequest) {
  const rateLimited = await applyRateLimit(request, { maxRequests: 120 });
  if (rateLimited) return rateLimited;

  const expected = process.env.VANTAHG_API_KEY;
  if (expected) {
    const auth = request.headers.get('authorization') || '';
    const provided = auth.replace(/^Bearer\s+/i, '');
    if (provided !== expected) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  let body: {
    reason?: string;
    notes?: string;
    partial_payload?: Record<string, unknown>;
    conversation_id?: string;
    prompt_version?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { reason, notes, partial_payload, conversation_id } = body;
  if (!reason || !ALLOWED_REASONS.has(reason)) {
    return NextResponse.json(
      { error: `reason is required and must be one of: ${[...ALLOWED_REASONS].join(', ')}` },
      { status: 400 }
    );
  }

  const ticket_id = `esc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  await logAuditEvent(
    null,
    'firstmover_agent_escalated',
    'firstmover_ai_agent',
    {
      ticket_id,
      reason,
      notes: notes || null,
      partial_payload: partial_payload || null,
      conversation_id: conversation_id || null,
      prompt_version: body.prompt_version || PROMPT_VERSION,
    }
  );

  return NextResponse.json({
    ticket_id,
    handoff: {
      next_step: 'A human concierge will pick up the conversation. Stay on the line.',
      // TODO: dispatch a notification (email / SMS / GR call-transfer) to the on-call.
    },
  });
}
