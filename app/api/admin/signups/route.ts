import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';
import { isDemoMode } from '@/lib/demo-mode';
import { requireRole } from '@/lib/auth-guard';
import { applyRateLimit } from '@/lib/rate-limit-middleware';
import { apiError } from '@/lib/api-error';
import { getRequestContext } from '@/lib/security';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/signups
 *
 * Admin-only list of signup_requests rows. Optional ?status= filter
 * for the status pills on /admin/signups. Returns the full row shape
 * (admins are authorized to see all fields, including primary contact
 * info and deal economics).
 */
export async function GET(request: NextRequest) {
  try {
    const authResult = await requireRole(request, ['admin', 'ceo', 'slt', 'builder']);
    if (authResult instanceof NextResponse) return authResult;
    const rateLimited = await applyRateLimit(request, { maxRequests: 200 });
    if (rateLimited) return rateLimited;

    if (isDemoMode()) {
      // Return a couple of plausible demo rows so the page is renderable
      // without hitting a real database.
      const now = new Date();
      return NextResponse.json([
        {
          id: 'demo-signup-1',
          created_at: new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString(),
          updated_at: new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString(),
          status: 'pending_review',
          legal_name: 'Acme Benefit Administrators, LLC',
          dba: 'Acme TPA',
          entity_state: 'Delaware',
          street_address: '500 Plan Way',
          city: 'Wilmington', state: 'DE', zip: '19801',
          primary_contact_name: 'Jane Operations',
          primary_contact_title: 'VP of Operations',
          primary_contact_email: 'jane@acme.example',
          primary_contact_phone: '(555) 123-4567',
          signer_name: 'Charles Acme',
          signer_title: 'CEO',
          signer_email: 'charles@acme.example',
          estimated_members: 38000,
          pepm_rate_cents: null,
          expected_weekly_auths: 140,
          existing_tpa_system: 'Trizetto',
          notes: 'Strong interest in concierge model; wants 30-day pilot first.',
          reviewed_by: null, reviewed_at: null, rejection_reason: null,
          contract_storage_path: null, contract_uploaded_at: null, contract_uploaded_by: null,
          client_id: null, approved_at: null, approved_by: null,
        },
        {
          id: 'demo-signup-2',
          created_at: new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000).toISOString(),
          updated_at: new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000).toISOString(),
          status: 'live',
          legal_name: 'Sunrise Health Partners',
          dba: null, entity_state: 'Florida',
          street_address: null, city: 'Miami', state: 'FL', zip: null,
          primary_contact_name: 'Marco Sunrise',
          primary_contact_title: 'Director of UM',
          primary_contact_email: 'marco@sunrisehp.example',
          primary_contact_phone: null,
          signer_name: null, signer_title: null, signer_email: null,
          estimated_members: 12000,
          pepm_rate_cents: 240,
          expected_weekly_auths: 45,
          existing_tpa_system: 'Eldorado',
          notes: null,
          reviewed_by: 'jonah@wellsonyx.com',
          reviewed_at: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString(),
          rejection_reason: null,
          contract_storage_path: 'contracts/sunrise-signed-msa.pdf',
          contract_uploaded_at: new Date(now.getTime() - 1.5 * 24 * 60 * 60 * 1000).toISOString(),
          contract_uploaded_by: 'jonah@wellsonyx.com',
          client_id: 'demo-client-sunrise',
          approved_at: new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000).toISOString(),
          approved_by: 'jonah@wellsonyx.com',
        },
      ], { headers: { 'X-Demo-Mode': 'true' } });
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');

    const supabase = getServiceClient();
    let query = supabase
      .from('signup_requests')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200);
    if (status) query = query.eq('status', status);

    const { data, error } = await query;
    if (error) {
      return apiError(error, {
        operation: 'list_signups',
        actor: authResult.user.email,
        requestContext: getRequestContext(request),
      });
    }

    return NextResponse.json(data ?? []);
  } catch (err) {
    return apiError(err, {
      operation: 'list_signups',
      actor: 'system',
      requestContext: getRequestContext(request),
    });
  }
}
