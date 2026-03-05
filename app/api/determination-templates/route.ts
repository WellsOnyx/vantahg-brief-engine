import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-guard';
import { applyRateLimit } from '@/lib/rate-limit-middleware';
import { isDemoMode, getDemoDeterminationTemplates } from '@/lib/demo-mode';
import { getServiceClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const authResult = await requireAuth(request);
    if (authResult instanceof NextResponse) return authResult;

    const { searchParams } = new URL(request.url);
    const clientId = searchParams.get('client_id') ?? undefined;

    if (isDemoMode()) {
      return NextResponse.json(getDemoDeterminationTemplates(clientId));
    }

    const supabase = getServiceClient();
    let query = supabase.from('determination_templates').select('*').eq('is_active', true);

    if (clientId) {
      query = query.or(`client_id.eq.${clientId},client_id.is.null`);
    }

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json(data);
  } catch (err) {
    console.error('Templates GET error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAuth(request);
    if (authResult instanceof NextResponse) return authResult;
    const rateLimited = await applyRateLimit(request, { maxRequests: 30 });
    if (rateLimited) return rateLimited;

    if (isDemoMode()) {
      return NextResponse.json({ error: 'Cannot create templates in demo mode' }, { status: 400 });
    }

    const supabase = getServiceClient();
    const body = await request.json();

    const { data, error } = await supabase
      .from('determination_templates')
      .insert(body)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json(data, { status: 201 });
  } catch (err) {
    console.error('Templates POST error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
