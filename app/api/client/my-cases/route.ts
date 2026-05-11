import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { requireAuth } from '@/lib/auth-guard';
import { applyRateLimit } from '@/lib/rate-limit-middleware';
import { isDemoMode, getDemoCases } from '@/lib/demo-mode';
import { apiError } from '@/lib/api-error';
import { getRequestContext } from '@/lib/security';

export const dynamic = 'force-dynamic';

/**
 * GET /api/client/my-cases
 *
 * Authenticated "My Cases" feed for a logged-in client (TPA / health plan).
 *
 * Tenant isolation is enforced by Supabase RLS — this route deliberately
 * uses the cookie-authenticated session client, NOT the service role client
 * which bypasses RLS. The policy in supabase/migrations/001_auth_rls.sql:
 *
 *   "Clients can read their own cases"
 *     using (
 *       get_user_role() = 'client'
 *       and client_id in (
 *         select id from clients where contact_email = auth.jwt()->>'email'
 *       )
 *     )
 *
 * means: the database returns only rows whose `client_id` resolves to a
 * client record whose `contact_email` matches the user's auth email. The
 * route doesn't need to add a WHERE clause — even if it didn't, RLS would
 * still filter.
 *
 * Returns the case fields a client UI actually needs to render a "My Cases"
 * dashboard. Patient PHI is included here because the user IS authorized to
 * see it (their own cases); the masking on /api/portal/cases is the
 * public-facing endpoint, not this one.
 */
export async function GET(request: NextRequest) {
  try {
    const authResult = await requireAuth(request);
    if (authResult instanceof NextResponse) return authResult;

    if (authResult.user.role !== 'client') {
      return NextResponse.json(
        { error: 'Forbidden — client role required' },
        { status: 403 },
      );
    }

    const rateLimited = await applyRateLimit(request, { maxRequests: 60 });
    if (rateLimited) return rateLimited;

    if (isDemoMode()) {
      // Demo: return all demo cases (the mock user is admin in demo). This
      // lets operators preview the client UI without setting up a real TPA.
      const cases = getDemoCases({});
      return NextResponse.json(cases);
    }

    const supabase = await createServerClient();

    // RLS enforces the tenant filter. We still SELECT only the fields the UI
    // needs — projection is independent of authorization.
    const { data, error } = await supabase
      .from('cases')
      .select(
        'id, case_number, status, priority, patient_name, patient_member_id, procedure_codes, procedure_description, created_at, turnaround_deadline, determination, determination_at, review_type, authorization_number, service_category, ai_brief_generated_at',
      )
      .order('created_at', { ascending: false })
      .limit(200);

    if (error) {
      return apiError(error, {
        operation: 'client_my_cases',
        actor: authResult.user.email,
        requestContext: getRequestContext(request),
      });
    }

    return NextResponse.json(data ?? []);
  } catch (err) {
    return apiError(err, {
      operation: 'client_my_cases',
      actor: 'system',
      requestContext: getRequestContext(request),
    });
  }
}
