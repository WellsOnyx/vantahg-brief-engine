import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-guard';
import { applyRateLimit } from '@/lib/rate-limit-middleware';
import { getGravityRailClient, GravityRailError } from '@/lib/gravity-rails';

export const dynamic = 'force-dynamic';

/** GET /api/gr/workspaces — list all GR workspaces this API key can access */
export async function GET(request: NextRequest) {
  try {
    const authResult = await requireAuth(request);
    if (authResult instanceof NextResponse) return authResult;
    const rateLimited = await applyRateLimit(request, { maxRequests: 60 });
    if (rateLimited) return rateLimited;

    const client = getGravityRailClient();
    const workspaces = await client.listWorkspaces();
    return NextResponse.json(workspaces);
  } catch (err) {
    if (err instanceof GravityRailError) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: err.status ?? 500 });
    }
    console.error('GR /workspaces error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
