import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';
import { requireAuth } from '@/lib/auth-guard';
import { applyRateLimit } from '@/lib/rate-limit-middleware';
import { isDemoMode, getDemoStaff } from '@/lib/demo-mode';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const authResult = await requireAuth(request);
    if (authResult instanceof NextResponse) return authResult;

    const { searchParams } = new URL(request.url);
    const role = searchParams.get('role');

    if (isDemoMode()) {
      return NextResponse.json(getDemoStaff(role ?? undefined));
    }

    const supabase = getServiceClient();
    let query = supabase.from('staff').select('*').order('name');

    if (role) {
      query = query.eq('role', role);
    }

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json(data);
  } catch (err) {
    console.error('Staff GET error:', err);
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
      return NextResponse.json({ error: 'Cannot create staff in demo mode' }, { status: 400 });
    }

    const supabase = getServiceClient();
    const body = await request.json();

    const { data, error } = await supabase
      .from('staff')
      .insert(body)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json(data, { status: 201 });
  } catch (err) {
    console.error('Staff POST error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
