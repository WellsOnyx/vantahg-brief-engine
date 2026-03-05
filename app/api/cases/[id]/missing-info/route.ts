import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-guard';
import { applyRateLimit } from '@/lib/rate-limit-middleware';
import { requestMissingInfo, receiveMissingInfo, getMissingInfoRequests } from '@/lib/missing-info';

export const dynamic = 'force-dynamic';

// GET: List missing info requests for a case
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const authResult = await requireAuth(request);
    if (authResult instanceof NextResponse) return authResult;

    const { id } = await params;
    const requests = await getMissingInfoRequests(id);

    return NextResponse.json(requests);
  } catch (err) {
    console.error('Missing info GET error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST: Request missing info (pauses SLA clock)
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const authResult = await requireAuth(request);
    if (authResult instanceof NextResponse) return authResult;
    const rateLimited = await applyRateLimit(request, { maxRequests: 30 });
    if (rateLimited) return rateLimited;

    const { id } = await params;
    const body = await request.json();

    const { requested_by, requested_items, sent_to, sent_via } = body;

    if (!requested_by || !requested_items?.length || !sent_to || !sent_via) {
      return NextResponse.json(
        { error: 'requested_by, requested_items, sent_to, and sent_via are required' },
        { status: 400 },
      );
    }

    const result = await requestMissingInfo(id, requested_by, requested_items, sent_to, sent_via);

    if (!result.success) {
      return NextResponse.json({ error: result.reason }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      requestId: result.requestId,
      message: 'Missing info requested. SLA clock paused.',
    });
  } catch (err) {
    console.error('Missing info POST error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PATCH: Mark missing info as received (resumes SLA clock)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const authResult = await requireAuth(request);
    if (authResult instanceof NextResponse) return authResult;

    const { id } = await params;
    const body = await request.json();

    const { request_id, received_items, resume_to_status } = body;

    if (!request_id || !received_items?.length) {
      return NextResponse.json(
        { error: 'request_id and received_items are required' },
        { status: 400 },
      );
    }

    const result = await receiveMissingInfo(id, request_id, received_items, resume_to_status);

    if (!result.success) {
      return NextResponse.json({ error: result.reason }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: 'Missing info received. SLA clock resumed.',
    });
  } catch (err) {
    console.error('Missing info PATCH error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
