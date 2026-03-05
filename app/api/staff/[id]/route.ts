import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';
import { requireAuth } from '@/lib/auth-guard';
import { isDemoMode, getDemoStaffMember } from '@/lib/demo-mode';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const authResult = await requireAuth(request);
    if (authResult instanceof NextResponse) return authResult;

    const { id } = await params;

    if (isDemoMode()) {
      const staff = getDemoStaffMember(id);
      if (!staff) return NextResponse.json({ error: 'Staff not found' }, { status: 404 });
      return NextResponse.json(staff);
    }

    const supabase = getServiceClient();
    const { data, error } = await supabase.from('staff').select('*').eq('id', id).single();

    if (error || !data) return NextResponse.json({ error: 'Staff not found' }, { status: 404 });

    return NextResponse.json(data);
  } catch (err) {
    console.error('Staff GET error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const authResult = await requireAuth(request);
    if (authResult instanceof NextResponse) return authResult;

    const { id } = await params;

    if (isDemoMode()) {
      return NextResponse.json({ error: 'Cannot update staff in demo mode' }, { status: 400 });
    }

    const supabase = getServiceClient();
    const body = await request.json();

    const { data, error } = await supabase.from('staff').update(body).eq('id', id).select().single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json(data);
  } catch (err) {
    console.error('Staff PATCH error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
