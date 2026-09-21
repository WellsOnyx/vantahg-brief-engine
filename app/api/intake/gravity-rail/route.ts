/**
 * POST /api/intake/gravity-rail
 *
 * Inbound Gravity Rail webhook on the Phase 2 case spine.
 * HMAC-SHA256 over the raw body. Secrets (any one is enough):
 * GRAVITY_RAIL_WEBHOOK_SECRET, GR_WEBHOOK_SECRET, GR_WEBHOOK_SECRET_SECONDARY.
 *
 * Production with every secret unset fails closed
 * (500 webhook_secret_not_configured). Dev/test with an empty secret
 * still accepts synthetic payloads. This route never calls the live
 * Gravity Rail HTTP API and never reads GRAVITY_RAIL_API_KEY.
 *
 * Idempotency-Key, else chat_id, else external_id: a replay returns the
 * existing spine case (200, idempotent:true) instead of a duplicate.
 *
 * Code-complete. Not live-keyed. Not production-ready until a real
 * workspace and webhook secret exist outside this repo.
 */

import { NextRequest, NextResponse } from 'next/server';
import { applyRateLimit } from '@/lib/rate-limit-middleware';
import { apiError } from '@/lib/api-error';
import { logAuditEvent } from '@/lib/audit';
import { getRequestContext } from '@/lib/security';
import { firstSignatureHeader } from '@/lib/intake/hmac';
import {
  flattenGravityRailPayload,
  ingestToCaseSpine,
  mapUnknownToIntake,
} from '@/lib/intake/spine-ingest';
import { getCaseSpineService } from '@/lib/case-spine';
import type { CanonicalCase } from '@/lib/case-spine';
import {
  resolveGravityRailIdempotencyKey,
  verifyGravityRailWebhook,
} from '@/lib/intake/gravity-rail-loop';

export const dynamic = 'force-dynamic';

function publicCaseBody(c: CanonicalCase, idempotent: boolean, extra?: Record<string, unknown>) {
  return {
    success: true,
    idempotent,
    source: 'gravity_rail',
    case_id: c.case_id,
    case_number: c.case_number,
    state: c.state,
    sla_clock: c.sla_clock,
    ...extra,
  };
}

export async function POST(request: NextRequest) {
  try {
    const rateLimited = await applyRateLimit(request, { maxRequests: 120 });
    if (rateLimited) return rateLimited;

    const rawBody = await request.text();
    const signature = firstSignatureHeader(request.headers, [
      'x-gravity-rail-signature',
      'x-webhook-signature',
    ]);
    const verdict = verifyGravityRailWebhook({ rawBody, signature });

    if (!verdict.ok) {
      await logAuditEvent(null, verdict.auditAction, 'system', { reason: verdict.reason });
      if (verdict.status === 500) {
        return NextResponse.json({ error: 'webhook_secret_not_configured' }, { status: 500 });
      }
      return NextResponse.json(
        { error: 'Invalid webhook signature', code: verdict.reason },
        { status: 401 },
      );
    }

    if (verdict.unverifiedDev) {
      await logAuditEvent(null, 'gravity_rail_webhook_unverified_dev', 'system', {
        reason: 'webhook secret not set (synthetic/dev allow)',
      });
    }

    let parsed: unknown;
    try {
      parsed = rawBody ? JSON.parse(rawBody) : {};
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return NextResponse.json({ error: 'JSON body must be an object' }, { status: 400 });
    }

    const record = parsed as Record<string, unknown>;
    const flat = flattenGravityRailPayload(record);
    const mapped = mapUnknownToIntake(flat);
    const idempotencyKey = resolveGravityRailIdempotencyKey(request.headers, [record, flat]);
    if (idempotencyKey) {
      mapped.intake = { ...mapped.intake, external_id: idempotencyKey };
    }

    if (mapped.intake.external_id) {
      const existing = await getCaseSpineService().findCaseByExternalId(
        mapped.client_id,
        mapped.intake.external_id,
      );
      if (existing) {
        await logAuditEvent(existing.case_id, 'gravity_rail_intake_duplicate', 'system', {
          idempotency_key: mapped.intake.external_id,
        });
        return NextResponse.json(publicCaseBody(existing, true), { status: 200 });
      }
    }

    const ingested = await ingestToCaseSpine({
      source: 'gravity_rail',
      client_id: mapped.client_id,
      intake: mapped.intake,
      type: mapped.type,
      parent_case_id: mapped.parent_case_id,
      priority: mapped.priority,
      actor: 'intake:gravity_rail',
    });

    await logAuditEvent(ingested.case.case_id, 'case_created_via_gravity_rail', 'system', {
      state: ingested.case.state,
      sla_clock: ingested.case.sla_clock,
      elapsed_ms: ingested.elapsed_ms,
      r01: ingested.evaluations.find((e) => e.rule_id === 'R01')?.matched ?? false,
    });

    return NextResponse.json(
      publicCaseBody(ingested.case, false, {
        elapsed_ms: ingested.elapsed_ms,
        webhook_received_at: ingested.webhook_received_at,
        spine_created_at: ingested.spine_created_at,
        evaluations: ingested.evaluations,
      }),
      { status: 201 },
    );
  } catch (err) {
    return apiError(err, {
      operation: 'gravity_rail_webhook',
      actor: 'system',
      requestContext: getRequestContext(request),
    });
  }
}
