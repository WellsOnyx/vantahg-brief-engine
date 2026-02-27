import { NextRequest, NextResponse } from 'next/server';
import { verifyWebhookSignature } from '@/lib/webhook-verify';
import { logAuditEvent } from '@/lib/audit';
import { applyRateLimit } from '@/lib/rate-limit-middleware';
import { getRequestContext } from '@/lib/security';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const rateLimited = await applyRateLimit(request, { maxRequests: 100 });
    if (rateLimited) return rateLimited;

    const body = await request.text();
    const signature = request.headers.get('x-webhook-signature') || '';
    const secret = process.env.WEBHOOK_SECRET || '';

    // Verify HMAC signature when secret is configured
    if (secret) {
      const valid = await verifyWebhookSignature(body, signature, secret);
      if (!valid) {
        const ctx = getRequestContext(request);
        await logAuditEvent(null, 'security:webhook_auth_failed', 'webhook', {
          ip: ctx.ip,
          reason: 'invalid_signature',
        }, ctx);
        return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
      }
    }

    const payload = JSON.parse(body);

    // Log webhook receipt
    await logAuditEvent(null, 'webhook_received', 'webhook', {
      event_type: payload.event || 'unknown',
    });

    return NextResponse.json({ message: 'webhook received' }, { status: 200 });
  } catch (err) {
    console.error('Error processing webhook:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
