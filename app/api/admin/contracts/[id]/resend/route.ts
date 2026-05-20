import { NextRequest, NextResponse } from 'next/server';
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

/**
 * POST /api/admin/contracts/[id]/resend
 *
 * Re-sends the signature request reminder to the next pending signer.
 * Common case: TPA signer lost / deleted the original email.
 *
 * Idempotent on already-signed or void contracts (returns 409).
 * Admin-only, audit-logged.
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

    if (isDemoMode()) {
      return NextResponse.json({ success: true, demo: true, message: 'Reminder sent (demo mode).' }, { headers: { 'X-Demo-Mode': 'true' } });
    }

    const supabase = getServiceClient();
    const { data: contract, error } = await supabase
      .from('contracts')
      .select('id, status, hellosign_signature_request_id, signup_id')
      .eq('id', id)
      .single();

    if (error || !contract) {
      return NextResponse.json({ error: 'Contract not found' }, { status: 404 });
    }

    if (!contract.hellosign_signature_request_id) {
      return NextResponse.json({ error: 'No signature request exists - send for signature first.' }, { status: 400 });
    }
    if (contract.status === 'signed' || contract.status === 'void') {
      return NextResponse.json({ error: `Contract is already ${contract.status}` }, { status: 409 });
    }

    if (!isRealHelloSignEnabled()) {
      await logAuditEvent(null, 'contract_resend_reminder', authResult.user.email, {
        contract_id: id,
        demo: true,
      }, getRequestContext(request));
      return NextResponse.json({ success: true, demo: true });
    }

    const config = getHelloSignConfig();
    const api = new SignatureRequestApi();
    api.username = config.apiKey;
    try {
      await api.signatureRequestRemind(contract.hellosign_signature_request_id, {
        // Remind all pending signers
        emailAddress: '',
      });
    } catch (err) {
      // Dropbox Sign auto-throttles reminders - their API returns 4xx
      // if you remind too quickly. Surface a clean message.
      const msg = err instanceof Error ? err.message : 'Unknown error';
      return NextResponse.json({ error: `Could not send reminder: ${msg}` }, { status: 400 });
    }

    await logAuditEvent(null, 'contract_resend_reminder', authResult.user.email, {
      contract_id: id,
      signature_request_id: contract.hellosign_signature_request_id,
    }, getRequestContext(request));

    return NextResponse.json({ success: true });
  } catch (err) {
    return apiError(err, {
      operation: 'contract_resend',
      actor: 'system',
      requestContext: getRequestContext(request),
    });
  }
}
