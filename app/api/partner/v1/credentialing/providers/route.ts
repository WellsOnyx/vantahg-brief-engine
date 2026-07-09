import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getServiceClient } from '@/lib/supabase';
import { isDemoMode } from '@/lib/demo-mode';
import { logAuditEvent } from '@/lib/audit';
import { applyRateLimit } from '@/lib/rate-limit-middleware';
import { authenticatePartner, hasScope } from '@/lib/partner/auth';
import { intakePersistenceGuard } from '@/lib/intake/persistence-guard';
import { openVerificationItems } from '@/lib/credentialing/psv';
import { nextCycleDueAt } from '@/lib/credentialing/config';
import { apiError } from '@/lib/api-error';
import { getRequestContext } from '@/lib/security';

export const dynamic = 'force-dynamic';

/**
 * Partner API v1 — credentialing intake (service line 5, Phase 1).
 *
 *   POST /api/partner/v1/credentialing/providers
 *
 * Submits a provider for credentialing (or re-credentialing). Same
 * contract discipline as case submission: partner key = tenant binding,
 * REQUIRED Idempotency-Key claimed in the intake_submissions ledger
 * BEFORE anything is created, schema errors are path-only.
 *
 * On accept: provider row upserted (client_id + NPI unique), a
 * credentialing cycle opened (CRED-<seq>), and one verification_item
 * seeded per applicable NCQA element (see lib/credentialing/config.ts) —
 * PSV starts immediately. 409 if the provider already has an active cycle.
 *
 * Provider PII discipline = PHI discipline: nothing in URLs or logs;
 * audit rows carry ids and counts, never demographics.
 */

const API_VERSION = 'v1';

const submitSchema = z.object({
  npi: z.string().regex(/^\d{10}$/, 'npi must be 10 digits'),
  first_name: z.string().min(1),
  last_name: z.string().min(1),
  credential: z.string().optional(), // MD, DO, NP, PA, ...
  specialties: z.array(z.string()).optional(),
  caqh_provider_id: z.string().optional(),
  email: z.string().email().optional(),
  license_states: z.array(z.string().length(2)).min(1, 'at least one license state'),
  cycle_type: z.enum(['initial', 'recredential']).default('initial'),
});

function err(status: number, code: string, message: string, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ error: { code, message, ...extra }, api_version: API_VERSION }, { status });
}

export async function POST(request: NextRequest) {
  try {
    const rateLimited = await applyRateLimit(request, { maxRequests: 120 });
    if (rateLimited) return rateLimited;

    const partner = await authenticatePartner(request);
    if (!partner) return err(401, 'unauthorized', 'Missing or invalid X-API-Key.');
    if (!hasScope(partner, 'submit')) return err(403, 'forbidden', 'Key lacks the submit scope.');

    const idempotencyKey = request.headers.get('idempotency-key')?.trim();
    if (!idempotencyKey || idempotencyKey.length < 8 || idempotencyKey.length > 128 || !/^[A-Za-z0-9._:-]+$/.test(idempotencyKey)) {
      return err(400, 'idempotency_key_required',
        'Send an Idempotency-Key header: 8-128 chars of [A-Za-z0-9._:-], retry-stable, never provider PII.');
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
        api_version: API_VERSION,
        demo: true,
        credentialing_case_id: `cred-demo-${idempotencyKey.slice(0, 12)}`,
        client_reference: idempotencyKey,
        status: 'psv_in_progress',
        received_at: new Date().toISOString(),
      }, { status: 202 });
    }

    const supabase = getServiceClient();

    // Idempotency claim FIRST — same ledger, same guarantee.
    const ledgerId = `cred:${partner.client_id}:${idempotencyKey}`;
    const { error: claimError } = await supabase
      .from('intake_submissions')
      .insert({ submission_id: ledgerId, channel: 'api', contract_version: API_VERSION, status: 'processing' })
      .select('submission_id')
      .single();

    if (claimError) {
      const isConflict = (claimError as { code?: string }).code === '23505' ||
        /duplicate key|unique constraint/i.test(claimError.message ?? '');
      if (!isConflict) {
        return apiError(claimError, {
          operation: 'credentialing_submit_claim', actor: partner.name,
          requestContext: getRequestContext(request), clientMessage: 'Failed to record submission',
        });
      }
      const { data: existing } = await supabase
        .from('intake_submissions')
        .select('case_id, status, first_seen_at')
        .eq('submission_id', ledgerId)
        .maybeSingle();
      return NextResponse.json({
        api_version: API_VERSION,
        idempotent: true,
        credentialing_case_id: existing?.case_id ?? null,
        client_reference: idempotencyKey,
        status: existing?.status ?? 'processing',
        received_at: existing?.first_seen_at ?? new Date().toISOString(),
      }, { status: 200 });
    }

    const releaseClaim = () =>
      supabase.from('intake_submissions').delete().eq('submission_id', ledgerId);

    // Upsert the provider (tenant + NPI unique).
    const { data: existingProvider } = await supabase
      .from('providers')
      .select('id')
      .eq('client_id', partner.client_id)
      .eq('npi', body.npi)
      .maybeSingle();

    let providerId = existingProvider?.id as string | undefined;
    if (!providerId) {
      const { data: created, error: provErr } = await supabase
        .from('providers')
        .insert({
          client_id: partner.client_id,
          npi: body.npi,
          first_name: body.first_name,
          last_name: body.last_name,
          credential: body.credential ?? null,
          specialties: body.specialties ?? [],
          caqh_provider_id: body.caqh_provider_id ?? null,
          email: body.email ?? null,
          license_states: body.license_states,
        })
        .select('id')
        .single();
      if (provErr || !created) {
        await releaseClaim();
        return apiError(provErr, {
          operation: 'credentialing_provider_insert', actor: partner.name,
          requestContext: getRequestContext(request), clientMessage: 'Failed to create provider',
        });
      }
      providerId = created.id as string;
    }

    // Open the cycle. The partial unique index (one ACTIVE cycle per
    // provider) turns a duplicate open into a 409, not a second cycle.
    const { data: seqVal } = await supabase.rpc('next_case_seq');
    const credNumber = `CRED-${String(seqVal ?? Date.now()).padStart(6, '0').slice(-8)}`;
    const { data: credCase, error: caseErr } = await supabase
      .from('credentialing_cases')
      .insert({
        credentialing_number: credNumber,
        provider_id: providerId,
        client_id: partner.client_id,
        cycle_type: body.cycle_type,
        status: 'intake',
        external_reference: idempotencyKey,
        cycle_due_at: nextCycleDueAt(),
      })
      .select('id, credentialing_number')
      .single();

    if (caseErr || !credCase) {
      await releaseClaim();
      const activeConflict = (caseErr as { code?: string } | null)?.code === '23505' ||
        /duplicate key|unique constraint/i.test(caseErr?.message ?? '');
      if (activeConflict) {
        return err(409, 'active_cycle_exists',
          'This provider already has an active credentialing cycle on this account.');
      }
      return apiError(caseErr, {
        operation: 'credentialing_case_insert', actor: partner.name,
        requestContext: getRequestContext(request), clientMessage: 'Failed to open credentialing cycle',
      });
    }

    const caseId = credCase.id as string;
    await supabase.from('intake_submissions')
      .update({ status: 'case_created', case_id: caseId, resolved_at: new Date().toISOString() })
      .eq('submission_id', ledgerId);

    // Seed + kick off PSV (idempotent per element).
    const { seeded } = await openVerificationItems(caseId, providerId, {
      credential: body.credential,
      specialties: body.specialties,
    });

    await logAuditEvent(caseId, 'credentialing_cycle_opened', partner.name, {
      partner_key_id: partner.key_id,
      provider_id: providerId,
      cycle_type: body.cycle_type,
      psv_items: seeded,
      client_reference: idempotencyKey,
    });

    return NextResponse.json({
      api_version: API_VERSION,
      idempotent: false,
      credentialing_case_id: caseId,
      credentialing_number: credCase.credentialing_number,
      provider_id: providerId,
      client_reference: idempotencyKey,
      status: seeded > 0 ? 'psv_in_progress' : 'intake',
      psv_items_opened: seeded,
      received_at: new Date().toISOString(),
    }, { status: 202 });
  } catch (e) {
    return apiError(e, { operation: 'credentialing_submit', actor: 'partner-api', requestContext: getRequestContext(request) });
  }
}
