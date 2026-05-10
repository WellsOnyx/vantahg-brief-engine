import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient, hasSupabaseConfig } from '@/lib/supabase';
import { isDemoMode } from '@/lib/demo-mode';
import { applyRateLimit } from '@/lib/rate-limit-middleware';
import { validateIntake, type IntakeServiceType } from '@/lib/firstmover/required-fields';
import { checkEligibility } from '@/lib/firstmover/eligibility';
import { logAuditEvent } from '@/lib/audit';
import { isOverflowActive } from '@/lib/firstmover/overflow';
import { PROMPT_VERSION } from '@/lib/firstmover/agent-prompt';

export const dynamic = 'force-dynamic';

const ALLOWED_SERVICE_TYPES: IntakeServiceType[] = [
  'outpatient', 'medication', 'home_health', 'therapy', 'inpatient', 'dme',
];

/**
 * Agent-driven intake submission. This endpoint is meant to be called
 * by the Gravity Rails workflow (or any LLM agent runner) once the
 * agent has gathered all required fields and confirmed eligibility.
 *
 * Differences from the human concierge endpoint at /api/firstmover/intake:
 *   - actor_type='agent' on audit entries
 *   - intake_channel='ai_agent'
 *   - Records the prompt version so we can correlate decisions back to
 *     the agent definition that produced them
 *
 * Auth: Bearer ${VANTAHG_API_KEY} (same as the public external/submit
 * endpoint). The GR agent runs server-side under our control.
 */
export async function POST(request: NextRequest) {
  const rateLimited = await applyRateLimit(request, { maxRequests: 120 });
  if (rateLimited) return rateLimited;

  // Bearer token check — the GR agent must authenticate
  const expected = process.env.VANTAHG_API_KEY;
  if (expected) {
    const auth = request.headers.get('authorization') || '';
    const provided = auth.replace(/^Bearer\s+/i, '');
    if (provided !== expected) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  let body: {
    client_id?: string;
    service_type?: IntakeServiceType;
    payload?: Record<string, unknown>;
    conversation_id?: string;
    prompt_version?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { client_id, service_type, payload, conversation_id } = body;
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

  // Required fields — agent should have caught this, but enforce server-side
  const validation = validateIntake(payload, service_type);
  if (!validation.valid) {
    return NextResponse.json(
      {
        error: 'Required fields missing — agent should re-prompt and resubmit.',
        missing: validation.missing,
      },
      { status: 422 }
    );
  }

  // Eligibility — agent should have caught red, but enforce server-side
  const eligibility = await checkEligibility({
    client_id,
    member_id: String(payload.member_id),
    date_of_service: payload.date_of_service ? String(payload.date_of_service) : undefined,
  });
  if (eligibility.status !== 'green') {
    return NextResponse.json(
      {
        error: 'Eligibility hard stop — agent should escalate to human.',
        eligibility,
      },
      { status: 409 }
    );
  }

  // Demo mode: stub case
  if (isDemoMode() || !hasSupabaseConfig()) {
    const case_id = `demo-agent-${Date.now()}`;
    const reference = `VUM-AI-${service_type.toUpperCase().slice(0, 3)}-${Math.floor(Math.random() * 9000 + 1000)}`;
    await logAuditEvent(
      case_id,
      'firstmover_agent_intake_opened',
      'firstmover_ai_agent',
      {
        service_type,
        eligibility_source: eligibility.source_file_version,
        prompt_version: body.prompt_version || PROMPT_VERSION,
        conversation_id: conversation_id || null,
        overflow: isOverflowActive(),
      }
    );
    return NextResponse.json({
      case_id,
      case_number: reference,
      status: 'intake',
      eligibility,
      message: `Case opened by AI agent (demo). Reference: ${reference}.`,
    });
  }

  const supabase = getServiceClient();
  const isInpatient = service_type === 'inpatient';
  const procedureCodes = service_type === 'dme'
    ? (payload.dme_items as Array<{ code: string }> | undefined)?.map((i) => i.code).filter(Boolean) || []
    : (payload.procedure_codes as string[] | undefined) || [];

  const prefix = `VUM-AI-${service_type.toUpperCase().slice(0, 3)}`;
  const { count } = await supabase
    .from('cases')
    .select('*', { count: 'exact', head: true })
    .ilike('case_number', `${prefix}-%`);

  const nextNumber = ((count ?? 0) + 1).toString().padStart(4, '0');
  const case_number = `${prefix}-${nextNumber}`;

  const caseRow = {
    status: 'intake' as const,
    priority: payload.expedited ? 'expedited' as const : 'standard' as const,
    intake_channel: 'ai_agent',
    intake_service_type: service_type,
    facility_type: isInpatient ? 'inpatient' as const : 'outpatient' as const,
    patient_name: String(payload.member_name || ''),
    patient_dob: payload.member_dob || null,
    patient_member_id: String(payload.member_id || ''),
    servicing_provider: payload.servicing_provider ? String(payload.servicing_provider) : null,
    servicing_provider_npi: payload.servicing_provider_npi ? String(payload.servicing_provider_npi) : null,
    facility_name: payload.facility_name ? String(payload.facility_name) : null,
    procedure_description: String(payload.procedure_description || ''),
    procedure_codes: procedureCodes,
    review_type: isInpatient ? 'concurrent' : 'prior_auth',
    client_id,
    submitted_documents: [] as string[],
    case_number,
  };

  const { data: created, error } = await supabase
    .from('cases')
    .insert(caseRow)
    .select('id, case_number')
    .single();

  if (error || !created) {
    return NextResponse.json({ error: error?.message || 'Failed to create case' }, { status: 500 });
  }

  await logAuditEvent(
    created.id,
    'firstmover_agent_intake_opened',
    'firstmover_ai_agent',
    {
      service_type,
      eligibility_source: eligibility.source_file_version,
      prompt_version: body.prompt_version || PROMPT_VERSION,
      conversation_id: conversation_id || null,
      overflow: isOverflowActive(),
    }
  );

  return NextResponse.json({
    case_id: created.id,
    case_number: created.case_number,
    status: 'intake',
    eligibility,
    message: `Case opened by AI agent. Reference: ${created.case_number}.`,
  });
}
