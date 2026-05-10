import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient, hasSupabaseConfig } from '@/lib/supabase';
import { isDemoMode } from '@/lib/demo-mode';
import { applyRateLimit } from '@/lib/rate-limit-middleware';
import { validateIntake, type IntakeServiceType } from '@/lib/founders/required-fields';
import { checkEligibility } from '@/lib/founders/eligibility';
import { logAuditEvent } from '@/lib/audit';

export const dynamic = 'force-dynamic';

const ALLOWED_SERVICE_TYPES: IntakeServiceType[] = [
  'outpatient', 'medication', 'home_health', 'therapy', 'inpatient', 'dme',
];

/**
 * Founders concierge intake submission.
 *
 * Enforces Santana's hard rule: no case is opened (no SLA clock) unless
 *   1. all required fields for the service type are present, AND
 *   2. eligibility lookup returns green.
 *
 * Returns 422 with the missing-fields list when (1) fails, 409 when (2)
 * fails. The concierge UI renders these to the caller.
 */
export async function POST(request: NextRequest) {
  const rateLimited = await applyRateLimit(request, { maxRequests: 60 });
  if (rateLimited) return rateLimited;

  let body: {
    client_id?: string;
    service_type?: IntakeServiceType;
    payload?: Record<string, unknown>;
    intake_channel?: string;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { client_id, service_type, payload, intake_channel = 'csr_manual' } = body;

  if (!client_id || !service_type || !payload) {
    return NextResponse.json(
      { error: 'client_id, service_type, and payload are required' },
      { status: 400 }
    );
  }
  if (!ALLOWED_SERVICE_TYPES.includes(service_type)) {
    return NextResponse.json(
      { error: `Invalid service_type. Must be one of: ${ALLOWED_SERVICE_TYPES.join(', ')}` },
      { status: 400 }
    );
  }

  // Gate 1: required fields
  const validation = validateIntake(payload, service_type);
  if (!validation.valid) {
    return NextResponse.json(
      {
        error: 'Required fields missing — case not opened, SLA clock not started.',
        missing: validation.missing,
        next_action: 'Ask caller to call back with the missing data.',
      },
      { status: 422 }
    );
  }

  // Gate 2: eligibility
  const eligibility = await checkEligibility({
    client_id,
    member_id: String(payload.member_id),
    date_of_service: payload.date_of_service ? String(payload.date_of_service) : undefined,
  });
  if (eligibility.status !== 'green') {
    return NextResponse.json(
      {
        error: 'Eligibility hard stop — case not opened.',
        eligibility,
      },
      { status: 409 }
    );
  }

  // Real-PHI gate: enforce Founders' synthetic-only posture until BAA is signed
  if (process.env.FOUNDERS_ALLOW_PHI === 'true' && !isDemoMode() && !hasSupabaseConfig()) {
    return NextResponse.json(
      { error: 'Server misconfigured: FOUNDERS_ALLOW_PHI=true but Supabase not configured.' },
      { status: 500 }
    );
  }

  // Build the case row
  const isInpatient = service_type === 'inpatient';
  const isExpedited = !!payload.expedited;
  const reviewType = isInpatient ? 'concurrent' : 'prior_auth';
  const priority = isExpedited ? 'expedited' : 'standard';

  const procedureDescription = String(payload.procedure_description || '');
  const procedureCodes = service_type === 'dme'
    ? (payload.dme_items as Array<{ code: string }> | undefined)?.map((i) => i.code).filter(Boolean) || []
    : (payload.procedure_codes as string[] | undefined) || [];

  const caseRow = {
    status: 'intake' as const,
    priority,
    intake_channel,
    intake_service_type: service_type,
    facility_type: isInpatient ? 'inpatient' as const : 'outpatient' as const,
    patient_name: String(payload.member_name || ''),
    patient_dob: payload.member_dob || null,
    patient_member_id: String(payload.member_id || ''),
    servicing_provider: payload.servicing_provider ? String(payload.servicing_provider) : null,
    servicing_provider_npi: payload.servicing_provider_npi ? String(payload.servicing_provider_npi) : null,
    facility_name: payload.facility_name ? String(payload.facility_name) : null,
    procedure_description: procedureDescription,
    procedure_codes: procedureCodes,
    review_type: reviewType,
    client_id,
    submitted_documents: [] as string[],
  };

  // Demo mode: don't persist; return synthetic case_id so the UX flow works
  if (isDemoMode() || !hasSupabaseConfig()) {
    const case_id = `demo-founders-${Date.now()}`;
    const reference = `VUM-${(service_type).toUpperCase().slice(0, 3)}-${Math.floor(Math.random() * 9000 + 1000)}`;
    return NextResponse.json({
      case_id,
      case_number: reference,
      status: 'intake',
      eligibility,
      message: `Case opened in demo mode. Reference: ${reference}.`,
    });
  }

  const supabase = getServiceClient();
  const prefix = `VUM-${service_type.toUpperCase().slice(0, 3)}`;
  const { count } = await supabase
    .from('cases')
    .select('*', { count: 'exact', head: true })
    .ilike('case_number', `${prefix}-%`);

  const nextNumber = ((count ?? 0) + 1).toString().padStart(4, '0');
  const case_number = `${prefix}-${nextNumber}`;

  const { data: created, error } = await supabase
    .from('cases')
    .insert({ ...caseRow, case_number })
    .select('id, case_number')
    .single();

  if (error || !created) {
    return NextResponse.json(
      { error: error?.message || 'Failed to create case' },
      { status: 500 }
    );
  }

  await logAuditEvent(
    created.id,
    'founders_intake_opened',
    'founders_concierge',
    {
      service_type,
      intake_channel,
      eligibility_source: eligibility.source_file_version,
    }
  );

  return NextResponse.json({
    case_id: created.id,
    case_number: created.case_number,
    status: 'intake',
    eligibility,
    message: `Case opened. Reference: ${created.case_number}.`,
  });
}
