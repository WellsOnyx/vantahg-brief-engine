import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getServiceClient } from '@/lib/supabase';
import { isDemoMode } from '@/lib/demo-mode';
import { requireRole } from '@/lib/auth-guard';
import { applyRateLimit } from '@/lib/rate-limit-middleware';
import { logAuditEvent } from '@/lib/audit';
import { apiError } from '@/lib/api-error';
import { getRequestContext } from '@/lib/security';
import { getHelloSignConfig, isRealHelloSignEnabled } from '@/lib/env';
import { SignatureRequestApi } from '@dropbox/sign';

export const dynamic = 'force-dynamic';

const BodySchema = z.object({
  reason: z.string().min(1).max(200).optional(),
});

/**
 * POST /api/admin/contracts/[id]/void
 *
 * Cancels the in-flight signature request and marks the contract void.
 * Used when a TPA wants to renegotiate, when wrong info was on the
 * original contract, etc.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const authResult = await requireRole(request, ['admin', 'ceo', 'slt']);
    if (authResult instanceof NextResponse) return authResult;
    const rateLimited = await applyRateLimit(request, { maxRequests: 20 });
    if (rateLimited) return rateLimited;

    const { id } = await params;
    const raw = await request.json().catch(() => ({}));
    const parsed = BodySchema.safeParse(raw);
    const reason = parsed.success ? (parsed.data.reason ?? 'Admin-initiated cancel') : 'Admin-initiated cancel';

    if (isDemoMode()) {
      return NextResponse.json({ success: true, demo: true }, { headers: { 'X-Demo-Mode': 'true' } });
    }

    const supabase = getServiceClient();
    const { data: contract, error } = await supabase
      .from('contracts')
      .select('id, status, hellosign_signature_request_id')
      .eq('id', id)
      .single();

    if (error || !contract) {
      return NextResponse.json({ error: 'Contract not found' }, { status: 404 });
    }

    if (contract.status === 'signed') {
      return NextResponse.json({ error: 'Cannot void an already-signed contract' }, { status: 409 });
    }
    if (contract.status === 'void') {
      return NextResponse.json({ error: 'Already void' }, { status: 409 });
    }

    // Cancel on Dropbox Sign if real mode + we have an envelope.
    if (isRealHelloSignEnabled() && contract.hellosign_signature_request_id) {
      const config = getHelloSignConfig();
      const api = new SignatureRequestApi();
      api.username = config.apiKey;
      try {
        await api.signatureRequestCancel(contract.hellosign_signature_request_id);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        // Best-effort - even if the cancel fails, mark our row void so
        // ops UX doesn't get stuck. Log it loudly.
        await logAuditEvent(null, 'security:contract_void_cancel_failed', authResult.user.email, {
          contract_id: id,
          error_message: msg.slice(0, 200),
        }, getRequestContext(request));
      }
    }

    const now = new Date().toISOString();
    const { error: updErr } = await supabase
      .from('contracts')
      .update({ status: 'void', voided_at: now, void_reason: reason })
      .eq('id', id);

    if (updErr) {
      return apiError(updErr, {
        operation: 'contract_void_update',
        actor: authResult.user.email,
        requestContext: getRequestContext(request),
      });
    }

    await logAuditEvent(null, 'contract_voided', authResult.user.email, {
      contract_id: id,
      reason,
    }, getRequestContext(request));

    return NextResponse.json({ success: true });
  } catch (err) {
    return apiError(err, {
      operation: 'contract_void',
      actor: 'system',
      requestContext: getRequestContext(request),
    });
  }
}
