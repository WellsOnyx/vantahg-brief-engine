import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';
import { isDemoMode } from '@/lib/demo-mode';
import { requireRole } from '@/lib/auth-guard';
import { applyRateLimit } from '@/lib/rate-limit-middleware';
import { apiError } from '@/lib/api-error';
import { getRequestContext } from '@/lib/security';
import { isAwsAuthEnabled, isAwsDbEnabled } from '@/lib/runtime-backend';

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
    const awsPath = isAwsAuthEnabled() || isAwsDbEnabled();

    // RDS user_profiles has email. Supabase-original does not — hybrid
    // still joins auth.users via auth.admin.listUsers. Never call
    // supabase.auth on the AWS path: the pg shim throws on .auth.
    const { data: profiles, error: profilesErr } = await supabase
      .from('user_profiles')
      .select(awsPath ? 'id, name, role, created_at, email' : 'id, name, role, created_at')
      .order('created_at', { ascending: false });

    if (profilesErr) {
      return apiError(profilesErr, {
        operation: 'list_team',
        actor: authResult.user.email,
        requestContext: getRequestContext(request),
      });
    }

    let usersById = new Map<string, { email: string | null }>();
    if (!awsPath) {
      try {
        const { data: adminData } = await supabase.auth.admin.listUsers();
        if (adminData?.users) {
          usersById = new Map(adminData.users.map((u) => [u.id, { email: u.email ?? null }]));
        }
      } catch {
        // Auth admin can fail in some Supabase configs — fall through with
        // empty emails rather than failing the whole list.
      }
    }

    const team = (profiles ?? []).map((p) => ({
      id: p.id,
      name: p.name,
      role: p.role,
      created_at: p.created_at,
      email:
        ('email' in p && typeof p.email === 'string' ? p.email : null) ??
        usersById.get(p.id)?.email ??
        null,
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
