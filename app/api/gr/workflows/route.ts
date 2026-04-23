import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-guard';
import { applyRateLimit } from '@/lib/rate-limit-middleware';
import { getGravityRailClient, GravityRailError } from '@/lib/gravity-rails';

export const dynamic = 'force-dynamic';

/**
 * GET /api/gr/workflows?wid=<workspace-uuid>
 * List all workflows in a GR workspace.
 */
export async function GET(request: NextRequest) {
  try {
    const authResult = await requireAuth(request);
    if (authResult instanceof NextResponse) return authResult;
    const rateLimited = await applyRateLimit(request, { maxRequests: 60 });
    if (rateLimited) return rateLimited;

    const wid = request.nextUrl.searchParams.get('wid') ?? process.env.GRAVITY_RAIL_WORKSPACE_ID;
    if (!wid) {
      return NextResponse.json({ error: 'wid (workspace ID) is required' }, { status: 400 });
    }

    const client = getGravityRailClient();
    const workflows = await client.listWorkflows(wid);
    return NextResponse.json(workflows);
  } catch (err) {
    if (err instanceof GravityRailError) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: err.status ?? 500 });
    }
    console.error('GR /workflows error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
