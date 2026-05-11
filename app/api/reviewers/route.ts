import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';
import { isDemoMode, getDemoReviewers } from '@/lib/demo-mode';
import { requireRole } from '@/lib/auth-guard';
import { applyRateLimit } from '@/lib/rate-limit-middleware';
import { apiError } from '@/lib/api-error';
import { getRequestContext } from '@/lib/security';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const authResult = await requireRole(request, ['admin']);
    if (authResult instanceof NextResponse) return authResult;
    const rateLimited = await applyRateLimit(request, { maxRequests: 200 });
    if (rateLimited) return rateLimited;

    // Optional tenant scope: when set, return only reviewers approved for
    // this client (reviewers.client_ids array contains the value). Empty
    // or absent → return everyone (the tenant selector "All" path).
    const clientId = new URL(request.url).searchParams.get('client_id');

    if (isDemoMode()) {
      const all = getDemoReviewers();
      const filtered = clientId
        ? all.filter((r) => Array.isArray(r.client_ids) && r.client_ids.includes(clientId))
        : all;
      return NextResponse.json(filtered);
    }

    const supabase = getServiceClient();

    let query = supabase
      .from('reviewers')
      .select('*')
      .order('name', { ascending: true });

    if (clientId) {
      // Postgres array `@>` (contains) — returns rows whose client_ids
      // array includes the requested client_id.
      query = query.contains('client_ids', [clientId]);
    }

    const { data, error } = await query;

    if (error) {
      return apiError(error, {
        operation: 'list_reviewers',
        actor: authResult.user.email,
        requestContext: getRequestContext(request),
      });
    }

    return NextResponse.json(data);
  } catch (err) {
    return apiError(err, {
      operation: 'list_reviewers',
      actor: 'system',
      requestContext: getRequestContext(request),
    });
  }
}

export async function POST(request: NextRequest) {
  try {
    const authResult = await requireRole(request, ['admin']);
    if (authResult instanceof NextResponse) return authResult;
    const rateLimited = await applyRateLimit(request, { maxRequests: 30 });
    if (rateLimited) return rateLimited;

    const supabase = getServiceClient();
    const body = await request.json();

    const { data, error } = await supabase
      .from('reviewers')
      .insert(body)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data, { status: 201 });
  } catch (err) {
    console.error('Error creating reviewer:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
