import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';
import { isDemoMode } from '@/lib/demo-mode';
import { logAuditEvent } from '@/lib/audit';
import { applyRateLimit } from '@/lib/rate-limit-middleware';
import { authenticatePartner, hasScope } from '@/lib/partner/auth';
import { apiError } from '@/lib/api-error';
import { getRequestContext } from '@/lib/security';

export const dynamic = 'force-dynamic';

/**
 * Partner API v1 — single-case read (docs/PARTNER_API.md §4).
 *
 *   GET /api/partner/v1/cases/{id}
 *
 * `{id}` accepts either our case_id (uuid) or the partner's own
 * Idempotency-Key reference (external_reference) — partners shouldn't have
 * to store our identifiers to ask about their own case.
 *
 * Tenant wall: the lookup is ALWAYS filtered by the key's client_id. A
 * partner probing another tenant's case_id gets the same 404 as a
 * nonexistent one — the response never confirms what it protects.
 *
 * Response carries workflow status + the determination outcome when
 * decided. No clinical narrative, no brief internals — the decision and
 * its rationale summary are the partner-facing surface.
 */

const PARTNER_API_VERSION = 'v1';

function err(status: number, code: string, message: string) {
  return NextResponse.json({ error: { code, message }, api_version: PARTNER_API_VERSION }, { status });
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
        api_version: PARTNER_API_VERSION,
        demo: true,
        case_id: id,
        status: 'lpn_review',
        case_type: 'um',
        determination: null,
      });
    }

    const supabase = getServiceClient();
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

    const { data: c } = await supabase
      .from('cases')
      .select('id, case_number, external_reference, status, case_type, review_type, priority, determination, determination_rationale, determination_at, turnaround_deadline, created_at, updated_at')
      .eq('client_id', partner.client_id) // tenant wall — identical 404s outside it
      .eq(isUuid ? 'id' : 'external_reference', id)
      .maybeSingle();

    if (!c) return err(404, 'not_found', 'No case with that identifier on this account.');

    await logAuditEvent(c.id as string, 'partner_case_read', partner.name, {
      partner_key_id: partner.key_id,
    }).catch(() => {});

    return NextResponse.json({
      api_version: PARTNER_API_VERSION,
      case_id: c.id,
      case_number: c.case_number,
      client_reference: c.external_reference ?? null,
      status: c.status,
      case_type: c.case_type,
      review_type: c.review_type,
      priority: c.priority,
      turnaround_deadline: c.turnaround_deadline ?? null,
      determination: c.determination
        ? {
            decision: c.determination,
            rationale_summary: c.determination_rationale ?? null,
            decided_at: c.determination_at ?? null,
          }
        : null,
      created_at: c.created_at,
      updated_at: c.updated_at,
    });
  } catch (e) {
    return apiError(e, { operation: 'partner_case_read', actor: 'partner-api', requestContext: getRequestContext(request) });
  }
}
