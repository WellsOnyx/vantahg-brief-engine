import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';
import { createServerClient } from '@/lib/supabase-server';
import { isDemoMode } from '@/lib/demo-mode';
import { applyRateLimit } from '@/lib/rate-limit-middleware';
import { apiError } from '@/lib/api-error';
import { getRequestContext } from '@/lib/security';
import { getApprovedTpaAccess } from '@/lib/auth/tpa-access';

export const dynamic = 'force-dynamic';

/**
 * GET /api/tpa/me
 *
 * Returns the current TPA user's client tenant + the list of practices
 * in their network. Used by /portal/tpa to render the case list +
 * populate the practice dropdown on the submit form.
 *
 * Access: user_profiles.role = 'client' AND clients.contact_email = user.email.
 * (V1 simple mapping: one client per email. V2 would join via a clients_users
 * junction table.)
 */

const DEMO = {
  tpa: { id: 'demo-c-1', name: 'Acme TPA' },
  practices: [
    { id: 'demo-p-1', name: 'Suncoast Orthopedic', specialty: 'Orthopedic', estimated_weekly_auths: 35, active: true },
    { id: 'demo-p-2', name: 'Tampa Family Medicine', specialty: 'Primary Care', estimated_weekly_auths: 22, active: true },
    { id: 'demo-p-3', name: 'Bayview Cardiology', specialty: 'Cardiology', estimated_weekly_auths: 18, active: true },
  ],
  case_counts: { total: 14, active: 8, this_month: 47 },
};

export async function GET(request: NextRequest) {
  try {
    const rateLimited = await applyRateLimit(request, { maxRequests: 120 });
    if (rateLimited) return rateLimited;

    if (isDemoMode()) {
      return NextResponse.json(DEMO);
    }

    const ssr = await createServerClient();
    const { data: userData, error: userErr } = await ssr.auth.getUser();
    if (userErr || !userData?.user) {
      return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
    }
    const email = userData.user.email ?? '';
    if (!email) {
      return NextResponse.json({ error: 'No email on user' }, { status: 403 });
    }

    // Item 9: Central "approved TPA" gate (will be swapped to Cognito + RDS later)
    const access = await getApprovedTpaAccess(email, email);
    if ('status' in access) {
      return NextResponse.json({ error: access.error }, { status: access.status });
    }

    const supabase = getServiceClient();

    const { data: tpa, error: tpaErr } = await supabase
      .from('clients')
      .select('id, name')
      .eq('id', access.clientId)
      .single();

    if (tpaErr || !tpa) {
      return NextResponse.json(
        { error: 'No TPA tenant linked to this account. Contact support.' },
        { status: 403 },
      );
    }

    const { data: practices } = await supabase
      .from('practices')
      .select('id, name, specialty, estimated_weekly_auths, active')
      .eq('client_id', access.clientId)
      .eq('active', true)
      .order('name', { ascending: true });

    // Quick case counts for the dashboard. Cheap aggregates.
    const ACTIVE_STATUSES = ['intake', 'processing', 'brief_ready', 'lpn_review', 'rn_review', 'md_review', 'pend_missing_info'];
    const { count: totalCount } = await supabase
      .from('cases')
      .select('id', { count: 'exact', head: true })
      .eq('client_id', access.clientId);
    const { count: activeCount } = await supabase
      .from('cases')
      .select('id', { count: 'exact', head: true })
      .eq('client_id', access.clientId)
      .in('status', ACTIVE_STATUSES);
    const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
    const { count: monthCount } = await supabase
      .from('cases')
      .select('id', { count: 'exact', head: true })
      .eq('client_id', access.clientId)
      .gte('created_at', monthStart.toISOString());

    return NextResponse.json({
      tpa: { id: access.clientId, name: access.clientName },
      practices: practices ?? [],
      case_counts: {
        total: totalCount ?? 0,
        active: activeCount ?? 0,
        this_month: monthCount ?? 0,
      },
    });
  } catch (err) {
    return apiError(err, {
      operation: 'tpa_me',
      actor: 'system',
      requestContext: getRequestContext(request),
    });
  }
}
