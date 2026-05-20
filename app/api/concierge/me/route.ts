import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';
import { getAuthAdapter } from '@/lib/adapters/auth';
import { isDemoMode } from '@/lib/demo-mode';
import { applyRateLimit } from '@/lib/rate-limit-middleware';
import { apiError } from '@/lib/api-error';
import { getRequestContext } from '@/lib/security';

export const dynamic = 'force-dynamic';

/**
 * GET /api/concierge/me
 *
 * Returns the signed-in concierge's profile, lines (phone/email/fax),
 * client assignments, current week load + cap, and active queue.
 *
 * Auth: the concierge must be signed in as themselves. The handler
 * resolves their concierge row via concierges.user_id = auth.user.id.
 *
 * Demo mode: returns fixtures shaped like the real response so the
 * UI can be exercised without a DB.
 */

interface ConciergeRow {
  id: string;
  name: string;
  email: string;
  ringcentral_phone: string | null;
  ringcentral_extension: string | null;
  intake_email: string | null;
  intake_efax: string | null;
  weekly_auth_cap: number;
  delivery_lead_id: string | null;
}

interface AssignmentRow {
  client_id: string;
  practice_id: string | null;
  active: boolean;
  client: { id: string; name: string; contact_email: string | null } | null;
}

const DEMO_PROFILE = {
  id: 'demo-concierge-1',
  name: 'Alex Rivera',
  email: 'alex@vantaum.demo',
  ringcentral_phone: '(786) 490-2384',
  ringcentral_extension: null,
  intake_email: 'alex@intake.vantaum.com',
  intake_efax: '(786) 555-0182',
  weekly_auth_cap: 300,
  delivery_lead_id: 'demo-dl-1',
  active_clients: [
    { id: 'demo-c-1', name: 'Acme TPA', contact_email: 'ops@acme.test' },
    { id: 'demo-c-2', name: 'Sunrise Health Plan', contact_email: 'pat@sunrise.test' },
    { id: 'demo-c-3', name: 'Garrison Benefits', contact_email: 'kim@garrison.test' },
  ],
  weekly_load: 210,
  weekly_cap: 300,
  cases_in_queue: 14,
  cases_overdue: 1,
};

export async function GET(request: NextRequest) {
  try {
    const rateLimited = await applyRateLimit(request, { maxRequests: 120 });
    if (rateLimited) return rateLimited;

    if (isDemoMode()) {
      return NextResponse.json(DEMO_PROFILE);
    }

    // Get the signed-in user via the auth adapter (Supabase or Cognito).
    const sessionUser = await getAuthAdapter().getSessionUser(request);
    if (!sessionUser) {
      return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
    }
    const userId = sessionUser.id;

    const supabase = getServiceClient();
    const { data: concierge, error: concErr } = await supabase
      .from('concierges')
      .select('id, name, email, ringcentral_phone, ringcentral_extension, intake_email, intake_efax, weekly_auth_cap, delivery_lead_id')
      .eq('user_id', userId)
      .maybeSingle();

    if (concErr) {
      return apiError(concErr, {
        operation: 'concierge_me_lookup',
        actor: sessionUser.email ?? '(unknown)',
        requestContext: getRequestContext(request),
      });
    }

    if (!concierge) {
      return NextResponse.json(
        { error: 'No concierge record linked to this user. Contact your Delivery Lead.' },
        { status: 403 },
      );
    }

    const c = concierge as ConciergeRow;

    // Pull active client assignments + the linked client name.
    const { data: assignmentsRaw } = await supabase
      .from('client_concierge_assignments')
      .select('client_id, practice_id, active, client:clients(id, name, contact_email)')
      .eq('concierge_id', c.id)
      .eq('active', true);

    const assignments = (assignmentsRaw ?? []) as unknown as AssignmentRow[];
    const active_clients = assignments
      .map((a) => a.client)
      .filter((x): x is NonNullable<AssignmentRow['client']> => Boolean(x));

    // Load - count of active cases assigned to this concierge in the last 7 days.
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { count: weekly_load } = await supabase
      .from('cases')
      .select('id', { count: 'exact', head: true })
      .eq('assigned_concierge_id', c.id)
      .gte('created_at', sevenDaysAgo);

    // In-queue and overdue counts.
    const ACTIVE_STATUSES = ['intake', 'processing', 'brief_ready', 'lpn_review', 'rn_review', 'md_review', 'pend_missing_info'];
    const { count: cases_in_queue } = await supabase
      .from('cases')
      .select('id', { count: 'exact', head: true })
      .eq('assigned_concierge_id', c.id)
      .in('status', ACTIVE_STATUSES);

    const nowIso = new Date().toISOString();
    const { count: cases_overdue } = await supabase
      .from('cases')
      .select('id', { count: 'exact', head: true })
      .eq('assigned_concierge_id', c.id)
      .in('status', ACTIVE_STATUSES)
      .lt('turnaround_deadline', nowIso);

    return NextResponse.json({
      ...c,
      active_clients,
      weekly_load: weekly_load ?? 0,
      weekly_cap: c.weekly_auth_cap,
      cases_in_queue: cases_in_queue ?? 0,
      cases_overdue: cases_overdue ?? 0,
    });
  } catch (err) {
    return apiError(err, {
      operation: 'concierge_me',
      actor: 'system',
      requestContext: getRequestContext(request),
    });
  }
}
