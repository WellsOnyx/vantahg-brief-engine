import { NextRequest, NextResponse } from 'next/server';
import { createHmac, timingSafeEqual } from 'crypto';
import { applyRateLimit } from '@/lib/rate-limit-middleware';
import { logAuditEvent } from '@/lib/audit';
import { validateIntake, type IntakeServiceType } from '@/lib/firstmover/required-fields';
import { checkEligibility } from '@/lib/firstmover/eligibility';
import { getServiceClient, hasSupabaseConfig } from '@/lib/supabase';
import { isDemoMode } from '@/lib/demo-mode';
import { PROMPT_VERSION } from '@/lib/firstmover/agent-prompt';

export const dynamic = 'force-dynamic';

/**
 * POST /api/firstmover/agent/webhook
 *
 * Gravity Rails webhook receiver. Fires when an agent-driven conversation
 * completes (chat / voice / SMS / email). The payload should include:
 *   - chat_id / conversation_id
 *   - status (completed | escalated | abandoned)
 *   - structured_data: { client_id, service_type, payload }
 *   - transcript: optional text/array
 *
 * We verify the HMAC signature, log receipt, run the captured intake
 * through the same gates a human concierge runs (required fields +
 * eligibility), and either create the case or escalate.
 *
 * Always returns 200 once the signature is valid so GR doesn't retry —
 * we record problems in our audit log and surface them in the admin UI.
 */
export async function POST(request: NextRequest) {
  const rateLimited = await applyRateLimit(request, { maxRequests: 240 });
  if (rateLimited) return rateLimited;

  const rawBody = await request.text();
  const signatureHeader =
    request.headers.get('x-gr-signature') ||
    request.headers.get('x-gravityrail-signature') ||
    request.headers.get('x-webhook-signature') ||
    '';

  // HMAC verification (skipped in demo mode and when secret isn't set,
  // so dev environments work, but PHI-bearing prod must set the secret)
  const secret = process.env.GRAVITY_RAIL_WEBHOOK_SECRET;
  if (secret && !isDemoMode()) {
    const valid = verifySignature(rawBody, signatureHeader, secret);
    if (!valid) {
      await logAuditEvent(
        null,
        'firstmover_agent_webhook_rejected',
        'firstmover_ai_agent',
        { reason: 'invalid_signature' }
      );
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }
  }

  let body: GRWebhookPayload;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const conversation_id =
    body.conversation_id || body.chat_id || body.session_id || `gr-${Date.now()}`;
  const status = body.status || 'completed';

  // Always log receipt — even if we can't act on it
  await logAuditEvent(
    null,
    'firstmover_agent_webhook_received',
    'firstmover_ai_agent',
    {
      conversation_id,
      status,
      channel: body.channel || null,
      has_structured_data: !!body.structured_data,
      prompt_version: body.prompt_version || PROMPT_VERSION,
    }
  );

  // No structured data → log and exit. The conversation may have been
  // abandoned, escalated by the agent, or simply informational.
  if (!body.structured_data) {
    return NextResponse.json({
      received: true,
      conversation_id,
      action: 'logged_only',
      reason: status === 'escalated'
        ? 'Conversation escalated by agent — human pickup required.'
        : 'No structured intake data on payload.',
    });
  }

  const { client_id, service_type, payload } = body.structured_data;

  if (!client_id || !service_type || !payload) {
    return NextResponse.json({
      received: true,
      conversation_id,
      action: 'incomplete_structured_data',
      missing_keys: [
        !client_id && 'client_id',
        !service_type && 'service_type',
        !payload && 'payload',
      ].filter(Boolean),
    });
  }

  const ALLOWED_TYPES: IntakeServiceType[] = [
    'outpatient', 'medication', 'home_health', 'therapy', 'inpatient', 'dme',
  ];
  if (!ALLOWED_TYPES.includes(service_type)) {
    return NextResponse.json({
      received: true,
      conversation_id,
      action: 'invalid_service_type',
      service_type,
    });
  }

  // Gate 1: required fields
  const validation = validateIntake(payload, service_type);
  if (!validation.valid) {
    await logAuditEvent(
      null,
      'firstmover_agent_webhook_validation_failed',
      'firstmover_ai_agent',
      { conversation_id, missing: validation.missing }
    );
    return NextResponse.json({
      received: true,
      conversation_id,
      action: 'validation_failed',
      missing: validation.missing,
    });
  }

  // Gate 2: eligibility
  const eligibility = await checkEligibility({
    client_id,
    member_id: String(payload.member_id),
    date_of_service: payload.date_of_service ? String(payload.date_of_service) : undefined,
  });
  if (eligibility.status !== 'green') {
    await logAuditEvent(
      null,
      'firstmover_agent_webhook_eligibility_red',
      'firstmover_ai_agent',
      { conversation_id, eligibility }
    );
    return NextResponse.json({
      received: true,
      conversation_id,
      action: 'eligibility_red',
      eligibility,
    });
  }

  // Create the case (mirrors /api/firstmover/agent/intake)
  const isInpatient = service_type === 'inpatient';
  const procedureCodes = service_type === 'dme'
    ? (payload.dme_items as Array<{ code: string }> | undefined)?.map((i) => i.code).filter(Boolean) || []
    : (payload.procedure_codes as string[] | undefined) || [];

  if (isDemoMode() || !hasSupabaseConfig()) {
    const case_id = `demo-gr-webhook-${Date.now()}`;
    const reference = `VUM-AI-${service_type.toUpperCase().slice(0, 3)}-${Math.floor(Math.random() * 9000 + 1000)}`;
    await logAuditEvent(
      case_id,
      'firstmover_agent_intake_opened',
      'firstmover_ai_agent',
      {
        conversation_id,
        service_type,
        via: 'webhook',
        prompt_version: body.prompt_version || PROMPT_VERSION,
      }
    );
    return NextResponse.json({
      received: true,
      conversation_id,
      action: 'case_created',
      case_id,
      case_number: reference,
    });
  }

  const supabase = getServiceClient();
  const prefix = `VUM-AI-${service_type.toUpperCase().slice(0, 3)}`;
  const { count } = await supabase
    .from('cases')
    .select('*', { count: 'exact', head: true })
    .ilike('case_number', `${prefix}-%`);
  const nextNumber = ((count ?? 0) + 1).toString().padStart(4, '0');
  const case_number = `${prefix}-${nextNumber}`;

  const { data: created, error } = await supabase
    .from('cases')
    .insert({
      status: 'intake' as const,
      priority: payload.expedited ? 'expedited' : 'standard',
      intake_channel: 'ai_agent',
      intake_service_type: service_type,
      facility_type: isInpatient ? 'inpatient' : 'outpatient',
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
    })
    .select('id, case_number')
    .single();

  if (error || !created) {
    await logAuditEvent(
      null,
      'firstmover_agent_webhook_db_error',
      'firstmover_ai_agent',
      { conversation_id, error: error?.message }
    );
    return NextResponse.json({
      received: true,
      conversation_id,
      action: 'db_error',
      error: error?.message,
    });
  }

  await logAuditEvent(
    created.id,
    'firstmover_agent_intake_opened',
    'firstmover_ai_agent',
    {
      conversation_id,
      service_type,
      via: 'webhook',
      prompt_version: body.prompt_version || PROMPT_VERSION,
    }
  );

  return NextResponse.json({
    received: true,
    conversation_id,
    action: 'case_created',
    case_id: created.id,
    case_number: created.case_number,
  });
}

// ── Helpers ──────────────────────────────────────────────────────────────

interface GRWebhookPayload {
  conversation_id?: string;
  chat_id?: string;
  session_id?: string;
  status?: string;
  channel?: string;
  prompt_version?: string;
  transcript?: unknown;
  structured_data?: {
    client_id?: string;
    service_type?: IntakeServiceType;
    payload?: Record<string, unknown>;
  };
}

/**
 * Verify HMAC-SHA256 signature header. Accepts both `sha256=<hex>` and
 * raw hex formats. Constant-time comparison.
 */
export function verifySignature(rawBody: string, signatureHeader: string, secret: string): boolean {
  if (!signatureHeader) return false;
  const computed = createHmac('sha256', secret).update(rawBody).digest('hex');
  const provided = signatureHeader.replace(/^sha256=/i, '').trim().toLowerCase();
  if (provided.length !== computed.length) return false;
  try {
    return timingSafeEqual(Buffer.from(provided, 'hex'), Buffer.from(computed, 'hex'));
  } catch {
    return false;
  }
}
