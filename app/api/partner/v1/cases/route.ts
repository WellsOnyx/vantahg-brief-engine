import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getServiceClient } from '@/lib/supabase';
import { isDemoMode } from '@/lib/demo-mode';
import { logAuditEvent } from '@/lib/audit';
import { applyRateLimit } from '@/lib/rate-limit-middleware';
import { authenticatePartner, hasScope } from '@/lib/partner/auth';
import {
  generateAuthorizationNumber,
  logIntakeEvent,
  hashPatientName,
  sendReceiptConfirmation,
} from '@/lib/intake/confirmation';
import { computeSubmissionFingerprint, findDuplicateCase } from '@/lib/intake/efax/storage';
import { dispatchFinalization } from '@/lib/intake/brief-queue';
import { intakePersistenceGuard } from '@/lib/intake/persistence-guard';
import { apiError } from '@/lib/api-error';
import { getRequestContext } from '@/lib/security';

export const dynamic = 'force-dynamic';

/**
 * Partner API v1 — case submission + polling list (docs/PARTNER_API.md).
 *
 *   POST /api/partner/v1/cases   submit a case (scope: submit)
 *   GET  /api/partner/v1/cases   list cases changed since ?since= (scope: read)
 *
 * Tenant binding comes from the API key — a partner can only ever create
 * and see cases on its own client_id, regardless of anything in the body.
 *
 * Idempotency: the `Idempotency-Key` header is REQUIRED on POST and is
 * claimed in the intake_submissions ledger (primary key) BEFORE case
 * creation — a retry with the same key returns the original case with 200
 * and `idempotent: true`; two concurrent identical requests can never both
 * create a case. The key is also stored as cases.external_reference so
 * every read and webhook event echoes the partner's own reference.
 */

const PARTNER_API_VERSION = 'v1';

const CASE_TYPES = ['um', 'medical_review', 'payer_idr', 'iro', 'ire'] as const;
const REVIEW_TYPES = [
  'prior_auth', 'medical_necessity', 'concurrent', 'retrospective',
  'peer_to_peer', 'appeal', 'second_level_review',
] as const;
const PRIORITIES = ['standard', 'urgent', 'expedited'] as const;

const submitSchema = z.object({
  patient_name: z.string().min(1),
  patient_dob: z.string().optional(),
  patient_member_id: z.string().optional(),
  procedure_codes: z.array(z.string().min(1)).min(1),
  diagnosis_codes: z.array(z.string()).optional(),
  procedure_description: z.string().optional(),
  clinical_summary: z.string().optional(),
  case_type: z.enum(CASE_TYPES).default('um'),
  review_type: z.enum(REVIEW_TYPES).default('prior_auth'),
  priority: z.enum(PRIORITIES).default('standard'),
  service_category: z.string().optional(),
  requesting_provider: z.string().optional(),
  requesting_provider_npi: z.string().optional(),
  facility_name: z.string().optional(),
  facility_type: z.string().optional(),
  payer_name: z.string().optional(),
  turnaround_deadline: z.string().datetime({ offset: true }).optional(),
  document_urls: z.array(z.string().url()).optional(),
});

function err(status: number, code: string, message: string, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ error: { code, message, ...extra }, api_version: PARTNER_API_VERSION }, { status });
}

// ---------------------------------------------------------------------------
// POST — submit a case
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  try {
    const rateLimited = await applyRateLimit(request, { maxRequests: 240 });
    if (rateLimited) return rateLimited;

    const partner = await authenticatePartner(request);
    if (!partner) return err(401, 'unauthorized', 'Missing or invalid X-API-Key.');
    if (!hasScope(partner, 'submit')) return err(403, 'forbidden', 'Key lacks the submit scope.');

    const idempotencyKey = request.headers.get('idempotency-key')?.trim();
    if (!idempotencyKey || idempotencyKey.length < 8 || idempotencyKey.length > 128 || !/^[A-Za-z0-9._:-]+$/.test(idempotencyKey)) {
      return err(400, 'idempotency_key_required',
        'Send an Idempotency-Key header: 8-128 chars of [A-Za-z0-9._:-], unique per logical submission, retry-stable. Never PHI.');
    }

    let bodyJson: unknown;
    try {
      bodyJson = await request.json();
    } catch {
      return err(400, 'schema_invalid', 'Body is not valid JSON.');
    }
    const parsed = submitSchema.safeParse(bodyJson);
    if (!parsed.success) {
      return err(400, 'schema_invalid', 'Payload failed schema validation.', {
        errors: parsed.error.issues.map((i) => ({ path: i.path.join('.') || '(root)', message: i.message })),
      });
    }
    const body = parsed.data;

    const guard = intakePersistenceGuard();
    if (guard) return guard;

    if (isDemoMode()) {
      return NextResponse.json({
        api_version: PARTNER_API_VERSION,
        demo: true,
        idempotent: false,
        case_id: `partner-demo-${idempotencyKey.slice(0, 12)}`,
        client_reference: idempotencyKey,
        status: 'intake',
        received_at: new Date().toISOString(),
      }, { status: 202 });
    }

    const supabase = getServiceClient();

    // Idempotency claim FIRST — the ledger PK guarantees no double-create.
    const ledgerId = `partner:${partner.client_id}:${idempotencyKey}`;
    const { error: claimError } = await supabase
      .from('intake_submissions')
      .insert({ submission_id: ledgerId, channel: 'api', contract_version: PARTNER_API_VERSION, status: 'processing' })
      .select('submission_id')
      .single();

    if (claimError) {
      const isConflict = (claimError as { code?: string }).code === '23505' ||
        /duplicate key|unique constraint/i.test(claimError.message ?? '');
      if (!isConflict) {
        return apiError(claimError, {
          operation: 'partner_submit_claim', actor: partner.name,
          requestContext: getRequestContext(request), clientMessage: 'Failed to record submission',
        });
      }
      const { data: existing } = await supabase
        .from('intake_submissions')
        .select('case_id, status, first_seen_at')
        .eq('submission_id', ledgerId)
        .maybeSingle();
      return NextResponse.json({
        api_version: PARTNER_API_VERSION,
        idempotent: true,
        case_id: existing?.case_id ?? null,
        client_reference: idempotencyKey,
        status: existing?.status ?? 'processing',
        received_at: existing?.first_seen_at ?? new Date().toISOString(),
      }, { status: 200 });
    }

    const resolve = (status: string, caseId: string | null) =>
      supabase.from('intake_submissions')
        .update({ status, case_id: caseId, resolved_at: new Date().toISOString() })
        .eq('submission_id', ledgerId);

    // Content-level dedup (24h window, cross-channel) — secondary net.
    const fingerprint = computeSubmissionFingerprint({
      patient_name: body.patient_name,
      patient_dob: body.patient_dob ?? null,
      patient_member_id: body.patient_member_id ?? null,
      procedure_codes: body.procedure_codes,
      from_number: null,
    });
    if (fingerprint) {
      const dup = await findDuplicateCase(fingerprint);
      if (dup) {
        await resolve('duplicate', dup.case_id);
        return err(409, 'duplicate_content',
          'A case matching this content already exists (24h window). Original attached.', {
            case_id: dup.case_id, case_number: dup.case_number,
          });
      }
    }

    const authNumber = await generateAuthorizationNumber();
    const { data: newCase, error: caseError } = await supabase
      .from('cases')
      .insert({
        case_number: `VUM-API-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`,
        status: 'intake',
        case_type: body.case_type,
        review_type: body.review_type,
        priority: body.priority,
        service_category: body.service_category || 'other',
        patient_name: body.patient_name,
        patient_dob: body.patient_dob ?? null,
        patient_member_id: body.patient_member_id ?? null,
        requesting_provider: body.requesting_provider ?? null,
        requesting_provider_npi: body.requesting_provider_npi ?? null,
        procedure_codes: body.procedure_codes,
        diagnosis_codes: body.diagnosis_codes ?? [],
        procedure_description: body.procedure_description ?? null,
        clinical_info: body.clinical_summary ?? null,
        facility_name: body.facility_name ?? null,
        facility_type: body.facility_type ?? null,
        payer_name: body.payer_name ?? null,
        turnaround_deadline: body.turnaround_deadline ?? null,
        client_id: partner.client_id, // tenant binding from the KEY, never the body
        external_reference: idempotencyKey,
        intake_channel: 'api',
        authorization_number: authNumber,
        intake_received_at: new Date().toISOString(),
        submitted_documents: body.document_urls ?? [],
        vertical: 'medical',
        submission_fingerprint: fingerprint,
      })
      .select('id, case_number')
      .single();

    if (caseError || !newCase) {
      // Release the claim so the partner's retry (same key) can succeed.
      await supabase.from('intake_submissions').delete().eq('submission_id', ledgerId);
      return apiError(caseError, {
        operation: 'partner_submit_insert', actor: partner.name,
        requestContext: getRequestContext(request), clientMessage: 'Failed to create case',
      });
    }

    const caseId = newCase.id as string;
    await resolve('case_created', caseId);

    await logIntakeEvent({
      channel: 'api',
      source_identifier: partner.name,
      authorization_number: authNumber,
      case_id: caseId,
      patient_name_hash: hashPatientName(body.patient_name),
      status: 'case_created',
      rejection_reason: null,
      metadata: { partner_key_id: partner.key_id, client_reference: idempotencyKey, case_type: body.case_type },
      processed_at: new Date().toISOString(),
      processed_by: 'partner-api',
    });
    await logAuditEvent(caseId, 'partner_case_submitted', partner.name, {
      partner_key_id: partner.key_id,
      client_reference: idempotencyKey,
      case_type: body.case_type,
      review_type: body.review_type,
    });

    sendReceiptConfirmation({ caseId, authorizationNumber: authNumber, channel: 'api' }).catch(() => {});

    await dispatchFinalization(caseId, { channel: 'api', actor: 'partner-api' });

    return NextResponse.json({
      api_version: PARTNER_API_VERSION,
      idempotent: false,
      case_id: caseId,
      case_number: newCase.case_number,
      client_reference: idempotencyKey,
      authorization_number: authNumber,
      status: 'intake',
      received_at: new Date().toISOString(),
    }, { status: 202 });
  } catch (e) {
    return apiError(e, { operation: 'partner_submit', actor: 'partner-api', requestContext: getRequestContext(request) });
  }
}

// ---------------------------------------------------------------------------
// GET — poll for changed cases (tenant-scoped)
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest) {
  try {
    const rateLimited = await applyRateLimit(request, { maxRequests: 240 });
    if (rateLimited) return rateLimited;

    const partner = await authenticatePartner(request);
    if (!partner) return err(401, 'unauthorized', 'Missing or invalid X-API-Key.');
    if (!hasScope(partner, 'read')) return err(403, 'forbidden', 'Key lacks the read scope.');

    if (isDemoMode()) {
      return NextResponse.json({ api_version: PARTNER_API_VERSION, demo: true, cases: [] });
    }

    const since = request.nextUrl.searchParams.get('since');
    const limit = Math.min(Number(request.nextUrl.searchParams.get('limit') ?? 100) || 100, 500);

    const supabase = getServiceClient();
    let query = supabase
      .from('cases')
      .select('id, case_number, external_reference, status, case_type, review_type, priority, determination, determination_at, created_at, updated_at')
      .eq('client_id', partner.client_id)
      .order('updated_at', { ascending: false })
      .limit(limit);
    if (since) query = query.gte('updated_at', since);

    const { data, error } = await query;
    if (error) {
      return apiError(error, { operation: 'partner_list', actor: partner.name, requestContext: getRequestContext(request) });
    }

    return NextResponse.json({
      api_version: PARTNER_API_VERSION,
      cases: (data ?? []).map((c) => ({
        case_id: c.id,
        case_number: c.case_number,
        client_reference: c.external_reference ?? null,
        status: c.status,
        case_type: c.case_type,
        review_type: c.review_type,
        priority: c.priority,
        determination: c.determination ?? null,
        determination_at: c.determination_at ?? null,
        created_at: c.created_at,
        updated_at: c.updated_at,
      })),
    });
  } catch (e) {
    return apiError(e, { operation: 'partner_list', actor: 'partner-api', requestContext: getRequestContext(request) });
  }
}
