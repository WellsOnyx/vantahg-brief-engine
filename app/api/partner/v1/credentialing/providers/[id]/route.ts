import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';
import { isDemoMode } from '@/lib/demo-mode';
import { applyRateLimit } from '@/lib/rate-limit-middleware';
import { authenticatePartner, hasScope } from '@/lib/partner/auth';
import { apiError } from '@/lib/api-error';
import { getRequestContext } from '@/lib/security';

export const dynamic = 'force-dynamic';

/**
 * Partner API v1 — credentialing status read (Phase 1).
 *
 *   GET /api/partner/v1/credentialing/providers/{id}
 *
 * `{id}` accepts the credentialing case uuid OR the partner's own
 * Idempotency-Key (external_reference). Tenant wall identical to the case
 * read: lookup always filtered by the key's client_id, identical 404s.
 *
 * Returns the cycle status, the per-element verification state (the
 * committee file's skeleton), and the decision once the committee renders
 * it. Element detail is normalized status only — no raw source responses,
 * no provider demographics beyond what the partner submitted.
 */

const API_VERSION = 'v1';

function err(status: number, code: string, message: string) {
  return NextResponse.json({ error: { code, message }, api_version: API_VERSION }, { status });
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const rateLimited = await applyRateLimit(request, { maxRequests: 240 });
    if (rateLimited) return rateLimited;

    const partner = await authenticatePartner(request);
    if (!partner) return err(401, 'unauthorized', 'Missing or invalid X-API-Key.');
    if (!hasScope(partner, 'read')) return err(403, 'forbidden', 'Key lacks the read scope.');

    const { id } = await params;

    if (isDemoMode()) {
      return NextResponse.json({
        api_version: API_VERSION,
        demo: true,
        credentialing_case_id: id,
        status: 'psv_in_progress',
        verification: [
          { element: 'identity', status: 'verified' },
          { element: 'licensure', status: 'in_progress' },
          { element: 'sanctions_exclusions', status: 'verified' },
        ],
        decision: null,
      });
    }

    const supabase = getServiceClient();
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

    const { data: c } = await supabase
      .from('credentialing_cases')
      .select('id, credentialing_number, provider_id, cycle_type, status, decision, decided_at, external_reference, cycle_due_at, created_at, updated_at')
      .eq('client_id', partner.client_id) // tenant wall
      .eq(isUuid ? 'id' : 'external_reference', id)
      .maybeSingle();

    if (!c) return err(404, 'not_found', 'No credentialing case with that identifier on this account.');

    const { data: items } = await supabase
      .from('verification_items')
      .select('element, source, status, verified_at')
      .eq('case_id', c.id);

    return NextResponse.json({
      api_version: API_VERSION,
      credentialing_case_id: c.id,
      credentialing_number: c.credentialing_number,
      client_reference: c.external_reference ?? null,
      cycle_type: c.cycle_type,
      status: c.status,
      cycle_due_at: c.cycle_due_at ?? null,
      verification: (items ?? []).map((i) => ({
        element: i.element,
        source: i.source,
        status: i.status,
        verified_at: i.verified_at ?? null,
      })),
      decision: c.decision
        ? { outcome: c.decision, decided_at: c.decided_at ?? null }
        : null,
      created_at: c.created_at,
      updated_at: c.updated_at,
    });
  } catch (e) {
    return apiError(e, { operation: 'credentialing_read', actor: 'partner-api', requestContext: getRequestContext(request) });
  }
}
