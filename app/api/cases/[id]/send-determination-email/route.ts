/**
 * POST /api/cases/[id]/send-determination-email
 *
 * Renders the determination-letter PDF and emails it as an attachment to
 * the TPA client's contact_email. Admin / reviewer / concierge action —
 * the determination must already be made before this endpoint succeeds.
 *
 * Idempotent: a case in 'delivered' status returns
 * { ok: true, already_delivered: true } without re-sending. The 'delivered'
 * status doubles as the marker so this ships without an RDS migration.
 *
 * Body (all optional):
 *   { recipient?: string }  // override the case's client.contact_email
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireRole, INTERNAL_STAFF_ROLES } from '@/lib/auth-guard';
import { applyRateLimit } from '@/lib/rate-limit-middleware';
import { deliverDeterminationLetter } from '@/lib/notifications/determination-delivery';
import { isDemoMode } from '@/lib/demo-mode';

export const dynamic = 'force-dynamic';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const rateLimited = await applyRateLimit(request, { maxRequests: 30 });
  if (rateLimited) return rateLimited;

  const authResult = await requireRole(request, [...INTERNAL_STAFF_ROLES]);
  if (authResult instanceof NextResponse) return authResult;

  const { id } = await params;

  let recipientOverride: string | undefined;
  try {
    const body = (await request.json().catch(() => ({}))) as { recipient?: unknown };
    if (typeof body.recipient === 'string' && body.recipient.trim().length > 0) {
      recipientOverride = body.recipient.trim();
    }
  } catch {
    // body parsing is best-effort; absent body is fine
  }

  const result = await deliverDeterminationLetter(id, {
    actor: authResult.user.email,
    recipientOverride,
  });

  if (!result.ok) {
    const status =
      result.code === 'case_not_found' ? 404 :
      result.code === 'no_determination' ? 400 :
      result.code === 'no_recipient' ? 400 :
      500;
    return NextResponse.json(result, { status });
  }

  const headers: HeadersInit | undefined = isDemoMode()
    ? { 'X-Demo-Mode': 'true' }
    : undefined;

  return NextResponse.json(result, { headers });
}
