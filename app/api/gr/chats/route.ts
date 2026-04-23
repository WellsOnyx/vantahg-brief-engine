import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-guard';
import { applyRateLimit } from '@/lib/rate-limit-middleware';
import { getGravityRailClient, GravityRailError, type CreateChatParams } from '@/lib/gravity-rails';

export const dynamic = 'force-dynamic';

/**
 * GET /api/gr/chats?wid=<workspace-uuid>&page=1&pageSize=50
 * List chats in a GR workspace.
 */
export async function GET(request: NextRequest) {
  try {
    const authResult = await requireAuth(request);
    if (authResult instanceof NextResponse) return authResult;
    const rateLimited = await applyRateLimit(request, { maxRequests: 60 });
    if (rateLimited) return rateLimited;

    const { searchParams } = request.nextUrl;
    const wid = searchParams.get('wid') ?? process.env.GRAVITY_RAIL_WORKSPACE_ID;
    if (!wid) return NextResponse.json({ error: 'wid is required' }, { status: 400 });

    const page = parseInt(searchParams.get('page') ?? '1', 10);
    const pageSize = parseInt(searchParams.get('pageSize') ?? '50', 10);

    const client = getGravityRailClient();
    const chats = await client.listChats(wid, page, pageSize);
    return NextResponse.json(chats);
  } catch (err) {
    if (err instanceof GravityRailError) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: err.status ?? 500 });
    }
    console.error('GR GET /chats error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * POST /api/gr/chats
 * Body: { wid?: string, channel?, workflowId?, title?, assistantEnabled? }
 * Create a new GR chat session (e.g. when a member starts a conversation).
 */
export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAuth(request);
    if (authResult instanceof NextResponse) return authResult;
    const rateLimited = await applyRateLimit(request, { maxRequests: 30 });
    if (rateLimited) return rateLimited;

    const body = await request.json();
    const wid: string = body.wid ?? process.env.GRAVITY_RAIL_WORKSPACE_ID;
    if (!wid) return NextResponse.json({ error: 'wid is required' }, { status: 400 });

    const params: CreateChatParams = {
      channel: body.channel ?? 'web-chat',
      workflowId: body.workflowId,
      title: body.title,
      assistantEnabled: body.assistantEnabled ?? true,
    };

    const client = getGravityRailClient();
    const chat = await client.createChat(wid, params);
    return NextResponse.json(chat, { status: 201 });
  } catch (err) {
    if (err instanceof GravityRailError) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: err.status ?? 500 });
    }
    console.error('GR POST /chats error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
