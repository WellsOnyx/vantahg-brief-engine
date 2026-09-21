import { NextRequest, NextResponse } from 'next/server';
import { logAuditEvent } from '@/lib/audit';
import { applyRateLimit } from '@/lib/rate-limit-middleware';
import { generateAuthorizationNumber, logIntakeEvent, hashPatientName } from '@/lib/intake/confirmation';
import { apiError } from '@/lib/api-error';
import { getRequestContext } from '@/lib/security';
import { firstSignatureHeader, verifyBodyHmacSha256 } from '@/lib/intake/hmac';
import { ingestToCaseSpine, mapUnknownToIntake } from '@/lib/intake/spine-ingest';

export const dynamic = 'force-dynamic';

function configuredApiKeys(): string[] {
  const fromList = (process.env.EXTERNAL_API_KEYS || '')
    .split(',')
    .map((k) => k.trim())
    .filter(Boolean);
  const legacy = process.env.VANTAHG_API_KEY?.trim();
  return legacy ? [...fromList, legacy] : fromList;
}

/**
 * POST /api/external/submit
 *
 * Programmatic intake. HMAC-SHA256 of the raw body with EXTERNAL_API_SECRET
 * when that slot is set. Creates a case on the Phase 1 spine immediately
 * (tokenized intake only — no raw member name/DOB on the spine object).
 *
 * Headers: x-api-key (when EXTERNAL_API_KEYS / VANTAHG_API_KEY are set)
 *          x-signature | x-webhook-signature (when EXTERNAL_API_SECRET is set)
 */
export async function POST(request: NextRequest) {
  try {
    const rateLimited = await applyRateLimit(request, { maxRequests: 200 });
    if (rateLimited) return rateLimited;

    const apiKey = request.headers.get('x-api-key');
    const rawBody = await request.text();
    const signature = firstSignatureHeader(request.headers, [
      'x-signature',
      'x-webhook-signature',
    ]);

    const validKeys = configuredApiKeys();
    if (validKeys.length > 0) {
      if (!apiKey) {
        await logAuditEvent(null, 'security:external_submit_no_api_key', 'system');
        return NextResponse.json({ error: 'x-api-key header required' }, { status: 401 });
      }
      if (!validKeys.includes(apiKey)) {
        await logAuditEvent(null, 'security:external_submit_invalid_key', 'system', {
          api_key_prefix: apiKey.substring(0, 8),
        });
        return NextResponse.json({ error: 'Invalid API key' }, { status: 401 });
      }
    }

    const verify = verifyBodyHmacSha256({
      rawBody,
      signature,
      secret: process.env.EXTERNAL_API_SECRET,
    });
    if (!verify.valid) {
      await logAuditEvent(null, 'security:external_submit_invalid_signature', 'system', {
        reason: verify.reason ?? 'unknown',
      });
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }

    let body: Record<string, unknown>;
    try {
      body = rawBody ? (JSON.parse(rawBody) as Record<string, unknown>) : {};
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const mapped = mapUnknownToIntake(body);
    const hasService = Boolean(mapped.intake.service_or_rx);
    const hasMember = Boolean(mapped.intake.member_ref);
    if (!hasService || !hasMember) {
      return NextResponse.json(
        {
          error:
            'Missing required fields: member_ref (or patient_member_id / patient_name) and service_or_rx (or procedure_codes)',
        },
        { status: 400 },
      );
    }

    const validPriorities = ['standard', 'urgent', 'expedited'];
    if (body.priority && !validPriorities.includes(String(body.priority))) {
      return NextResponse.json(
        { error: `priority must be one of: ${validPriorities.join(', ')}` },
        { status: 400 },
      );
    }

    const validReviewTypes = [
      'prior_auth',
      'first_level_appeal',
      'medical_necessity',
      'concurrent',
      'retrospective',
      'peer_to_peer',
      'appeal',
      'second_level_review',
    ];
    if (body.review_type && !validReviewTypes.includes(String(body.review_type))) {
      return NextResponse.json(
        { error: `review_type must be one of: ${validReviewTypes.join(', ')}` },
        { status: 400 },
      );
    }

    const authNumber = await generateAuthorizationNumber();
    const memberLabel = mapped.intake.member_ref ?? 'synth';

    await logIntakeEvent({
      channel: 'api',
      source_identifier: apiKey ? `key:${apiKey.substring(0, 8)}...` : 'demo',
      authorization_number: authNumber,
      case_id: null,
      patient_name_hash: hashPatientName(memberLabel),
      status: 'processing',
      rejection_reason: null,
      metadata: { api_key_prefix: apiKey?.substring(0, 8) ?? null, path: 'case_spine' },
      processed_at: null,
      processed_by: null,
    });

    const ingested = await ingestToCaseSpine({
      source: 'external_api',
      client_id: mapped.client_id,
      intake: mapped.intake,
      type: mapped.type,
      parent_case_id: mapped.parent_case_id,
      priority: mapped.priority,
      packet_storage_keys: Array.isArray(body.packet_storage_keys)
        ? body.packet_storage_keys.map(String)
        : undefined,
      actor: apiKey ? `key:${apiKey.substring(0, 8)}` : 'intake:external_api',
    });

    await logIntakeEvent({
      channel: 'api',
      source_identifier: apiKey ? `key:${apiKey.substring(0, 8)}...` : 'demo',
      authorization_number: authNumber,
      case_id: ingested.case.case_id,
      patient_name_hash: hashPatientName(memberLabel),
      status: 'case_created',
      rejection_reason: null,
      metadata: { path: 'case_spine' },
      processed_at: ingested.spine_created_at,
      processed_by: 'system',
    });

    await logAuditEvent(ingested.case.case_id, 'case_created_via_api', 'system', {
      authorization_number: authNumber,
      api_key_prefix: apiKey?.substring(0, 8),
      state: ingested.case.state,
      sla_clock: ingested.case.sla_clock,
      elapsed_ms: ingested.elapsed_ms,
    });

    return NextResponse.json(
      {
        success: true,
        source: 'external_api',
        case_id: ingested.case.case_id,
        case_number: ingested.case.case_number,
        authorization_number: authNumber,
        status: ingested.case.state,
        state: ingested.case.state,
        sla_clock: ingested.case.sla_clock,
        elapsed_ms: ingested.elapsed_ms,
        webhook_received_at: ingested.webhook_received_at,
        spine_created_at: ingested.spine_created_at,
        evaluations: ingested.evaluations,
      },
      { status: 201 },
    );
  } catch (err) {
    return apiError(err, {
      operation: 'external_submit',
      actor: 'system',
      requestContext: getRequestContext(request),
    });
  }
}
