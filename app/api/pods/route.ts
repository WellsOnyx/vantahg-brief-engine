import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';
import { requireAuth } from '@/lib/auth-guard';
import { applyRateLimit } from '@/lib/rate-limit-middleware';
import { isDemoMode, getDemoPods } from '@/lib/demo-mode';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const authResult = await requireAuth(request);
    if (authResult instanceof NextResponse) return authResult;

    if (isDemoMode()) {
      return NextResponse.json(getDemoPods());
    }

    const supabase = getServiceClient();
    const { data, error } = await supabase.from('pods').select('*').order('name');

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json(data);
  } catch (err) {
    console.error('Pods GET error:', err);
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
      return NextResponse.json({ error: 'Cannot create pods in demo mode' }, { status: 400 });
    }

    const supabase = getServiceClient();
    const body = await request.json();

    const { data, error } = await supabase.from('pods').insert(body).select().single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json(data, { status: 201 });
  } catch (err) {
    console.error('Pods POST error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
