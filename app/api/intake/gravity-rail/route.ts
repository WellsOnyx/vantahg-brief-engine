/**
 * POST /api/intake/gravity-rail
 *
 * Inbound Gravity Rail webhook. HMAC over the raw body with
 * GRAVITY_RAIL_WEBHOOK_SECRET (slot only — empty in demo). Creates a
 * case on the Phase 1 spine immediately so it appears in
 * GET /api/case-spine in well under 2 minutes.
 *
 * Does not call the live Gravity Rail HTTP API. GRAVITY_RAIL_API_KEY
 * remains an outbound-client slot; this route never reads it.
 */

import { NextRequest, NextResponse } from 'next/server';
import { applyRateLimit } from '@/lib/rate-limit-middleware';
import { apiError } from '@/lib/api-error';
import { logAuditEvent } from '@/lib/audit';
import { getRequestContext } from '@/lib/security';
import { firstSignatureHeader, verifyBodyHmacSha256 } from '@/lib/intake/hmac';
import {
  flattenGravityRailPayload,
  ingestToCaseSpine,
  mapUnknownToIntake,
} from '@/lib/intake/spine-ingest';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const rateLimited = await applyRateLimit(request, { maxRequests: 120 });
    if (rateLimited) return rateLimited;

    const rawBody = await request.text();
    const signature = firstSignatureHeader(request.headers, [
      'x-gravity-rail-signature',
      'x-webhook-signature',
    ]);
    const verify = verifyBodyHmacSha256({
      rawBody,
      signature,
      secret: process.env.GRAVITY_RAIL_WEBHOOK_SECRET,
    });

    if (!verify.valid) {
      await logAuditEvent(null, 'security:gravity_rail_invalid_signature', 'system', {
        reason: verify.reason ?? 'unknown',
      });
      return NextResponse.json({ error: 'Invalid webhook signature' }, { status: 401 });
    }

    if (verify.reason === 'no_secret_configured') {
      await logAuditEvent(null, 'gravity_rail_webhook_unverified_dev', 'system', {
        reason: 'GRAVITY_RAIL_WEBHOOK_SECRET not set',
      });
    }

    let parsed: unknown;
    try {
      parsed = rawBody ? JSON.parse(rawBody) : {};
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }
    if (!parsed || typeof parsed !== 'object') {
      return NextResponse.json({ error: 'JSON body must be an object' }, { status: 400 });
    }

    const flat = flattenGravityRailPayload(parsed as Record<string, unknown>);
    const mapped = mapUnknownToIntake(flat);
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
      {
        success: true,
        source: 'gravity_rail',
        case_id: ingested.case.case_id,
        case_number: ingested.case.case_number,
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
      operation: 'gravity_rail_webhook',
      actor: 'system',
      requestContext: getRequestContext(request),
    });
  }
}
