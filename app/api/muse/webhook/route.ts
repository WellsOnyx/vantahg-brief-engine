/**
 * POST /api/muse/webhook
 *
 * Inbound Muse relationship webhook. HMAC-SHA256 over the raw body.
 * Secrets (any one is enough): MUSE_WEBHOOK_SECRET, MUSE_WEBHOOK_SECRET_SECONDARY.
 *
 * Production with every secret unset fails closed
 * (500 webhook_secret_not_configured). Dev/test with an empty secret
 * still accepts synthetic relationship payloads.
 *
 * Stores account id, contact-role label, and scheduling flags only.
 * PHI and unknown fields are refused and not stored. This route never
 * calls muse.ai and never reads MUSE_API_KEY.
 */

import { NextRequest, NextResponse } from 'next/server';
import { applyRateLimit } from '@/lib/rate-limit-middleware';
import { apiError } from '@/lib/api-error';
import { logAuditEvent } from '@/lib/audit';
import { getRequestContext } from '@/lib/security';
import { firstSignatureHeader } from '@/lib/intake/hmac';
import { getMemoryMuseStore, screenMusePayload, verifyMuseWebhook } from '@/lib/muse';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const rateLimited = await applyRateLimit(request, { maxRequests: 120 });
    if (rateLimited) return rateLimited;

    const rawBody = await request.text();
    const signature = firstSignatureHeader(request.headers, [
      'x-muse-signature',
      'x-webhook-signature',
    ]);
    const verdict = verifyMuseWebhook({ rawBody, signature });

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
      await logAuditEvent(null, 'muse_webhook_unverified_dev', 'system', {
        reason: 'webhook secret not set (synthetic/dev allow)',
      });
    }

    let parsed: unknown;
    try {
      parsed = rawBody ? JSON.parse(rawBody) : {};
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const screened = screenMusePayload(parsed);
    if (!screened.ok) {
      await logAuditEvent(null, 'security:muse_phi_rejected', 'system', {
        code: screened.code,
        field: screened.field,
      });
      const status = screened.code === 'invalid_shape' ? 400 : 422;
      const error = screened.code === 'invalid_shape' ? 'invalid_muse_payload' : 'phi_not_allowed';
      return NextResponse.json(
        { error, code: screened.code, field: screened.field },
        { status },
      );
    }

    const saved = getMemoryMuseStore().upsert(screened.record);
    await logAuditEvent(null, 'muse_touchpoint_stored', 'system', {
      touchpoint_id: saved.touchpoint.touchpoint_id,
      account_id: saved.touchpoint.account_id,
      contact_role: saved.touchpoint.contact_role,
      idempotent: saved.idempotent,
    });

    return NextResponse.json(
      {
        success: true,
        idempotent: saved.idempotent,
        stored: true,
        live_call: false,
        touchpoint_id: saved.touchpoint.touchpoint_id,
        account_id: saved.touchpoint.account_id,
        contact_role: saved.touchpoint.contact_role,
      },
      { status: saved.idempotent ? 200 : 201 },
    );
  } catch (err) {
    return apiError(err, {
      operation: 'muse_webhook',
      actor: 'system',
      requestContext: getRequestContext(request),
    });
  }
}
