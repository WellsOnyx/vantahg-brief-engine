import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';
import { isDemoMode } from '@/lib/demo-mode';
import { requireRole } from '@/lib/auth-guard';
import { applyRateLimit } from '@/lib/rate-limit-middleware';
import { apiError } from '@/lib/api-error';
import { getRequestContext } from '@/lib/security';

export const dynamic = 'force-dynamic';

/**
 * GET /api/team
 *
 * Admin-only roster of user_profiles + their app role. Distinct from
 * /api/staff (clinical LPN/RN/admin_staff in the `staff` table).
 * This route is for managing who can log in and what they see.
 */
export async function GET(request: NextRequest) {
  try {
    const authResult = await requireRole(request, ['admin', 'ceo', 'slt']);
    if (authResult instanceof NextResponse) return authResult;
    const rateLimited = await applyRateLimit(request, { maxRequests: 200 });
    if (rateLimited) return rateLimited;

    if (isDemoMode()) {
      // Synthesize a plausible team list for demo viewers.
      return NextResponse.json([
        { id: 'demo-1', email: 'admin@vantaum.example', name: 'Demo Admin', role: 'admin', created_at: new Date().toISOString() },
        { id: 'demo-2', email: 'reviewer@vantaum.example', name: 'Demo Reviewer', role: 'reviewer', created_at: new Date().toISOString() },
        { id: 'demo-3', email: 'ceo@vantaum.example', name: 'Demo CEO', role: 'ceo', created_at: new Date().toISOString() },
        { id: 'demo-4', email: 'builder@vantaum.example', name: 'Demo Builder', role: 'builder', created_at: new Date().toISOString() },
      ]);
    }

    const supabase = getServiceClient();

    // user_profiles doesn't have email directly — it FKs to auth.users.
    // Use the service-role admin API to enumerate users + join with
    // profile rows. Falls back to profiles-only on auth admin errors.
    const { data: profiles, error: profilesErr } = await supabase
      .from('user_profiles')
      .select('id, name, role, created_at')
      .order('created_at', { ascending: false });

    if (profilesErr) {
      return apiError(profilesErr, {
        operation: 'list_team',
        actor: authResult.user.email,
        requestContext: getRequestContext(request),
      });
    }

    // Best-effort enrichment with email from auth.users via the admin API.
    let usersById = new Map<string, { email: string | null }>();
    try {
      const { data: adminData } = await supabase.auth.admin.listUsers();
      if (adminData?.users) {
        usersById = new Map(adminData.users.map((u) => [u.id, { email: u.email ?? null }]));
      }
    } catch {
      // Auth admin can fail in some Supabase configs — fall through with
      // empty emails rather than failing the whole list.
    }

    const team = (profiles ?? []).map((p) => ({
      id: p.id,
      name: p.name,
      role: p.role,
      created_at: p.created_at,
      email: usersById.get(p.id)?.email ?? null,
    }));

    return NextResponse.json(team);
  } catch (err) {
    return apiError(err, {
      operation: 'list_team',
      actor: 'system',
      requestContext: getRequestContext(request),
    });
  }
}
