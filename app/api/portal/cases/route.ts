import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';
import { isDemoMode, getDemoCases } from '@/lib/demo-mode';
import { applyRateLimit } from '@/lib/rate-limit-middleware';
import { apiError } from '@/lib/api-error';
import { getRequestContext } from '@/lib/security';

export const dynamic = 'force-dynamic';

/**
 * GET /api/portal/cases
 *
 * Public-facing portal API. Returns case status to providers without
 * requiring authentication — provider offices look up cases by case number
 * or authorization number after submitting via fax/email/API.
 *
 * SECURITY:
 * - Patient name masked to first initial + asterisks ("S***").
 * - Member ID masked to last-4 only ("***1234").
 * - Provider name dropped — combining patient + provider is a re-identification
 *   risk on a public endpoint. Specialty is retained for context.
 * - Rate-limited more aggressively than internal endpoints.
 *
 * This is an unauthenticated endpoint. Authenticated client-tenant
 * dashboards live at /api/client/my-cases (RLS-enforced).
 */

interface RawCase {
  id: string;
  case_number: string;
  status: string;
  priority: string;
  patient_name: string | null;
  patient_member_id: string | null;
  procedure_codes: string[] | null;
  procedure_description: string | null;
  created_at: string;
  turnaround_deadline: string | null;
  determination: string | null;
  determination_rationale: string | null;
  determination_at: string | null;
  review_type: string | null;
  authorization_number: string | null;
  peer_to_peer_status?: string | null;
  service_category: string | null;
  requesting_provider: string | null;
  requesting_provider_specialty?: string | null;
  payer_name: string | null;
}

function maskName(name: string | null): string {
  if (!name || name.length === 0) return 'REDACTED';
  return `${name.charAt(0)}***`;
}

function maskMemberId(id: string | null): string {
  if (!id || id.length < 4) return 'REDACTED';
  return `***${id.slice(-4)}`;
}

function maskForPortal(c: RawCase) {
  return {
    id: c.id,
    case_number: c.case_number,
    status: c.status,
    priority: c.priority,
    patient_name: maskName(c.patient_name),
    patient_member_id: maskMemberId(c.patient_member_id),
    procedure_codes: c.procedure_codes,
    procedure_description: c.procedure_description,
    created_at: c.created_at,
    turnaround_deadline: c.turnaround_deadline,
    determination: c.determination,
    determination_rationale: c.determination_rationale,
    determination_at: c.determination_at,
    review_type: c.review_type,
    authorization_number: c.authorization_number,
    peer_to_peer_status: c.peer_to_peer_status ?? null,
    service_category: c.service_category,
    // Provider name intentionally NOT returned. Specialty is the most a public
    // lookup needs to confirm the right case is being viewed.
    requesting_provider_specialty: c.requesting_provider_specialty ?? null,
    payer_name: c.payer_name,
  };
}

export async function GET(request: NextRequest) {
  try {
    const rateLimited = await applyRateLimit(request, { maxRequests: 60 });
    if (rateLimited) return rateLimited;

    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search');

    if (isDemoMode()) {
      const cases = getDemoCases({ search });
      return NextResponse.json(cases.map((c) => maskForPortal(c as unknown as RawCase)));
    }

    const supabase = getServiceClient();

    let query = supabase
      .from('cases')
      .select(
        // Pulls requesting_provider_specialty so we can return it; the full
        // provider name is read but never sent to the client.
        'id, case_number, status, priority, patient_name, patient_member_id, procedure_codes, procedure_description, created_at, turnaround_deadline, determination, determination_rationale, determination_at, review_type, authorization_number, peer_to_peer_status, service_category, requesting_provider, requesting_provider_specialty, payer_name'
      )
      .order('created_at', { ascending: false })
      .limit(100);

    if (search) {
      query = query.or(
        `case_number.ilike.%${search}%,patient_name.ilike.%${search}%,patient_member_id.ilike.%${search}%,authorization_number.ilike.%${search}%`
      );
    }

    const { data, error } = await query;

    if (error) {
      return apiError(error, {
        operation: 'portal_cases_list',
        actor: 'public',
        requestContext: getRequestContext(request),
      });
    }

    return NextResponse.json((data ?? []).map((c) => maskForPortal(c as RawCase)));
  } catch (err) {
    return apiError(err, {
      operation: 'portal_cases_list',
      actor: 'public',
      requestContext: getRequestContext(request),
    });
  }
}
