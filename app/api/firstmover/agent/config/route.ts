import { NextRequest, NextResponse } from 'next/server';
import { applyRateLimit } from '@/lib/rate-limit-middleware';
import { getAgentConfigBundle, PROMPT_VERSION } from '@/lib/firstmover/agent-prompt';
import { isOverflowActive, getOverflowMode, setManualOverflow } from '@/lib/firstmover/overflow';

export const dynamic = 'force-dynamic';

/**
 * GET /api/firstmover/agent/config
 *   Returns the agent's system prompt, tool specs, and endpoint
 *   wiring. The Gravity Rails admin pastes this into a workflow.
 *
 * POST /api/firstmover/agent/config
 *   { manual_overflow: boolean | null }
 *   Flips the manual overflow toggle. Admin-only via Bearer API key.
 */
export async function GET(request: NextRequest) {
  const rateLimited = await applyRateLimit(request, { maxRequests: 60 });
  if (rateLimited) return rateLimited;

  const overflow = isOverflowActive();
  return NextResponse.json({
    ...getAgentConfigBundle(),
    overflow: {
      mode: getOverflowMode(),
      active: overflow.active,
      reason: overflow.reason,
    },
    gravity_rails: {
      configured: !!(process.env.GRAVITY_RAIL_API_KEY && process.env.GRAVITY_RAIL_WORKSPACE_ID),
      workspace_id: process.env.GRAVITY_RAIL_WORKSPACE_ID || null,
    },
    api_key_set: !!process.env.VANTAHG_API_KEY,
    prompt_version: PROMPT_VERSION,
  });
}

export async function POST(request: NextRequest) {
  const rateLimited = await applyRateLimit(request, { maxRequests: 30 });
  if (rateLimited) return rateLimited;

  const expected = process.env.VANTAHG_API_KEY;
  if (expected) {
    const auth = request.headers.get('authorization') || '';
    const provided = auth.replace(/^Bearer\s+/i, '');
    if (provided !== expected) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  let body: { manual_overflow?: boolean | null };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (body.manual_overflow === undefined) {
    return NextResponse.json({ error: 'manual_overflow is required' }, { status: 400 });
  }
  setManualOverflow(body.manual_overflow);
  const next = isOverflowActive();
  return NextResponse.json({ overflow: { mode: getOverflowMode(), active: next.active, reason: next.reason } });
}
