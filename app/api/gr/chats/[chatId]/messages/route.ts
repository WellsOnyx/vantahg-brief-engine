import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-guard';
import { applyRateLimit } from '@/lib/rate-limit-middleware';
import { getGravityRailClient, GravityRailError } from '@/lib/gravity-rails';

export const dynamic = 'force-dynamic';

/**
 * GET /api/gr/chats/[chatId]/messages?wid=<workspace-uuid>
 * Fetch all messages for a chat.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ chatId: string }> },
) {
  try {
    const authResult = await requireAuth(request);
    if (authResult instanceof NextResponse) return authResult;
    const rateLimited = await applyRateLimit(request, { maxRequests: 60 });
    if (rateLimited) return rateLimited;

    const { chatId } = await params;
    const wid = request.nextUrl.searchParams.get('wid') ?? process.env.GRAVITY_RAIL_WORKSPACE_ID;
    if (!wid) return NextResponse.json({ error: 'wid is required' }, { status: 400 });

    const client = getGravityRailClient();
    const messages = await client.getMessages(wid, parseInt(chatId, 10));
    return NextResponse.json(messages);
  } catch (err) {
    if (err instanceof GravityRailError) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: err.status ?? 500 });
    }
    console.error('GR GET /chats/[chatId]/messages error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * POST /api/gr/chats/[chatId]/messages
 * Body: { wid?: string, content: string, role?: 'user' | 'assistant' }
 * Send a message in a chat. role='user' uses the user message endpoint,
 * role='assistant' uses send-assistant-message.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ chatId: string }> },
) {
  try {
    const authResult = await requireAuth(request);
    if (authResult instanceof NextResponse) return authResult;
    const rateLimited = await applyRateLimit(request, { maxRequests: 30 });
    if (rateLimited) return rateLimited;

    const { chatId } = await params;
    const body = await request.json();
    const wid: string = body.wid ?? process.env.GRAVITY_RAIL_WORKSPACE_ID;
    if (!wid) return NextResponse.json({ error: 'wid is required' }, { status: 400 });
    if (!body.content) return NextResponse.json({ error: 'content is required' }, { status: 400 });

    const client = getGravityRailClient();
    const numericChatId = parseInt(chatId, 10);

    let message;
    if (body.role === 'assistant') {
      message = await client.sendAssistantMessage(wid, numericChatId, { message: body.content });
    } else {
      message = await client.sendMessage(wid, numericChatId, { content: body.content });
    }

    return NextResponse.json(message, { status: 201 });
  } catch (err) {
    if (err instanceof GravityRailError) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: err.status ?? 500 });
    }
    console.error('GR POST /chats/[chatId]/messages error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
