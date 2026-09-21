import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';
import { requireAuth } from '@/lib/auth-guard';
import { applyRateLimit } from '@/lib/rate-limit-middleware';
import { isDemoMode, getDemoStaff } from '@/lib/demo-mode';
import { isGravityRailApiConfigured } from '@/lib/gravity-rails';
import { GravityRailProvisioner } from '@/lib/gravity-rails/provisioner';
import type { Staff } from '@/lib/types';

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

    // Best-effort GR workspace when the server key is present. A failed
    // create does not invent ws-* ids and does not roll back the staff row.
    let staff = data;
    if (isGravityRailApiConfigured() && data && typeof data === 'object' && 'id' in data && data.id) {
      try {
        const row = data as Staff;
        const provisioner = new GravityRailProvisioner();
        const result = await provisioner.provisionForStaff(row);
        await provisioner.persistToStaff(row.id, result, {
          from: (table: string) => ({
            update: (patch: Record<string, unknown>) => ({
              eq: (col: string, val: string) => supabase.from(table).update(patch).eq(col, val),
            }),
          }),
        });
        staff = {
          ...row,
          gr_workspace_id: result.workspaceId,
          gr_workflow_id: result.workflowId,
          gr_provisioned_at: result.provisionedAt,
        };
      } catch (err) {
        const kind = err instanceof Error ? err.name : 'error';
        console.error('[gravity-rails] staff provision skipped', kind);
      }
    }

    return NextResponse.json(staff, { status: 201 });
  } catch (err) {
    console.error('Staff POST error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
