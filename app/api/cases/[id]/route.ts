import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';
import { logAuditEvent } from '@/lib/audit';
import { isDemoMode, getDemoCase } from '@/lib/demo-mode';
import { requireAuth } from '@/lib/auth-guard';
import { applyRateLimit } from '@/lib/rate-limit-middleware';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await requireAuth(request);
    if (authResult instanceof NextResponse) return authResult;
    const rateLimited = await applyRateLimit(request, { maxRequests: 200 });
    if (rateLimited) return rateLimited;
    const { id } = await params;

    if (isDemoMode()) {
      const demoCase = getDemoCase(id);
      if (!demoCase) {
        return NextResponse.json({ error: 'Case not found' }, { status: 404 });
      }
      return NextResponse.json(demoCase);
    }

    const supabase = getServiceClient();

    const { data, error } = await supabase
      .from('cases')
      .select('*, reviewer:reviewers(*), client:clients(*)')
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json({ error: 'Case not found' }, { status: 404 });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (err) {
    console.error('Error fetching case:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await requireAuth(request);
    if (authResult instanceof NextResponse) return authResult;
    const rateLimited = await applyRateLimit(request, { maxRequests: 30 });
    if (rateLimited) return rateLimited;

    const { id } = await params;
    const supabase = getServiceClient();
    const body = await request.json();

    const updates: Record<string, unknown> = { ...body };

    // When a determination is set, record the timestamp
    if (body.determination) {
      updates.determination_at = new Date().toISOString();
    }

    // When a reviewer is assigned, move status to in_review
    if (body.assigned_reviewer_id) {
      updates.status = 'in_review';
    }

    const { data, error } = await supabase
      .from('cases')
      .update(updates)
      .eq('id', id)
      .select('*, reviewer:reviewers(*), client:clients(*)')
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json({ error: 'Case not found' }, { status: 404 });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Log audit events based on what changed
    const actor = body.updated_by || 'system';

    if (body.status) {
      await logAuditEvent(id, 'status_changed', actor, {
        new_status: body.status,
      });
    }

    if (body.assigned_reviewer_id) {
      await logAuditEvent(id, 'reviewer_assigned', actor, {
        reviewer_id: body.assigned_reviewer_id,
      });
    }

    if (body.determination) {
      await logAuditEvent(id, 'determination_made', actor, {
        determination: body.determination,
        rationale: body.determination_rationale || null,
      });
    }

    return NextResponse.json(data);
  } catch (err) {
    console.error('Error updating case:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
