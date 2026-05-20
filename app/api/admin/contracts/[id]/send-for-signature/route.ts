import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';
import { isDemoMode } from '@/lib/demo-mode';
import { requireRole } from '@/lib/auth-guard';
import { applyRateLimit } from '@/lib/rate-limit-middleware';
import { logAuditEvent } from '@/lib/audit';
import { apiError } from '@/lib/api-error';
import { getRequestContext } from '@/lib/security';
import { sendForSignature } from '@/lib/contracts/hellosign-client';
import { getStorageAdapter } from '@/lib/adapters/storage';

export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/contracts/[id]/send-for-signature
 *
 * Sends a previously-generated contract PDF to Dropbox Sign (HelloSign)
 * for signature. Two signers in order: TPA signer first, VantaUM
 * signer (Jonathan Arias) second. Stores the returned envelope id on
 * the contract row.
 *
 * Idempotent on already-sent contracts: returns 409 with the existing
 * envelope id so the UI can re-render state without creating a duplicate
 * Dropbox Sign request.
 *
 * Admin-only. Demo-mode returns a deterministic stub envelope id.
 */

// Hard-coded counter-signer for V1. When we onboard additional VantaUM
// authorized signers we'll pull this from a config table.
const VANTAUM_SIGNER_NAME = 'Jonathan Arias';
const VANTAUM_SIGNER_EMAIL = 'jonathan@wellsonyx.com';

const LOGICAL_BUCKET = 'signup-contracts' as const;

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
      return NextResponse.json({
        success: true,
        demo: true,
        message: 'Sent for signature (demo mode — no real envelope created).',
        signature_request_id: `demo-sig-${id}`,
        status: 'sent',
      }, { headers: { 'X-Demo-Mode': 'true' } });
    }

    const supabase = getServiceClient();

    // Load the contract row joined with its signup_request so we have
    // signer info without a second round-trip.
    const { data: contract, error: readErr } = await supabase
      .from('contracts')
      .select('*, signup_requests!contracts_signup_id_fkey(*)')
      .eq('id', id)
      .single();

    if (readErr) {
      if (readErr.code === 'PGRST116') {
        return NextResponse.json({ error: 'Contract not found' }, { status: 404 });
      }
      return apiError(readErr, {
        operation: 'send_for_signature_read_contract',
        actor: authResult.user.email,
        requestContext: getRequestContext(request),
      });
    }

    // Idempotency guard — don't send a second request for an already-sent
    // contract. Caller can call /void first if they want to resend.
    if (contract.status === 'sent' || contract.status === 'partially_signed' || contract.status === 'signed') {
      return NextResponse.json(
        {
          error: `Contract already in '${contract.status}' state.`,
          signature_request_id: contract.hellosign_signature_request_id,
          status: contract.status,
        },
        { status: 409 },
      );
    }

    if (contract.status !== 'generated') {
      return NextResponse.json(
        { error: `Cannot send a contract in '${contract.status}' state. Generate it first.` },
        { status: 400 },
      );
    }

    if (!contract.rendered_pdf_path) {
      return NextResponse.json(
        { error: 'Contract has no rendered PDF. Re-generate it first.' },
        { status: 400 },
      );
    }

    const signup = contract.signup_requests;
    if (!signup) {
      return NextResponse.json(
        { error: 'Contract is not linked to a signup_request — cannot resolve signer.' },
        { status: 400 },
      );
    }

    // TPA signer is the one captured on the signup form. Fall back to the
    // primary contact only if signer fields are blank — the admin should
    // have filled in the signer block before sending.
    const tpaSignerName = signup.signer_name || signup.primary_contact_name;
    const tpaSignerEmail = signup.signer_email || signup.primary_contact_email;
    if (!tpaSignerName || !tpaSignerEmail) {
      return NextResponse.json(
        { error: 'TPA signer name and email are required on the signup_request before sending.' },
        { status: 400 },
      );
    }

    // Download the rendered PDF from storage (via adapter for Supabase/S3 dual-mode).
    const storage = await getStorageAdapter();
    const dlResult = await storage.download(LOGICAL_BUCKET, contract.rendered_pdf_path);
    if (!dlResult.ok) {
      return apiError(new Error(`PDF download failed: ${dlResult.message}`), {
        operation: 'send_for_signature_download_pdf',
        actor: authResult.user.email,
        requestContext: getRequestContext(request),
      });
    }
    const pdfBuffer = dlResult.bytes;

    // Send to Dropbox Sign (or stub in demo mode — the wrapper handles that).
    let envelope: { signatureRequestId: string; demo: boolean };
    try {
      envelope = await sendForSignature({
        title: `VantaUM MSA + BAA — ${signup.legal_name}`,
        message:
          `Please review and sign the VantaUM Master Services Agreement and ` +
          `Business Associate Agreement for ${signup.legal_name}. ` +
          `Once you sign, Jonathan Arias will counter-sign and you'll receive ` +
          `a copy of the fully-executed document.`,
        signers: [
          { role: 'tpa_signer', name: tpaSignerName, email: tpaSignerEmail, order: 1 },
          { role: 'vantaum_signer', name: VANTAUM_SIGNER_NAME, email: VANTAUM_SIGNER_EMAIL, order: 2 },
        ],
        pdfBuffer,
        fileName: `vantaum-msa-baa-${signup.legal_name.replace(/[^a-zA-Z0-9]/g, '-')}.pdf`,
        contractId: contract.id,
      });
    } catch (err) {
      return apiError(err, {
        operation: 'send_for_signature_api_call',
        actor: authResult.user.email,
        requestContext: getRequestContext(request),
      });
    }

    // Persist envelope id and bump status.
    const now = new Date().toISOString();
    const { data: updated, error: updateErr } = await supabase
      .from('contracts')
      .update({
        status: 'sent',
        hellosign_signature_request_id: envelope.signatureRequestId,
        sent_at: now,
      })
      .eq('id', id)
      .select('*')
      .single();

    if (updateErr) {
      // The envelope was created in Dropbox Sign but we couldn't persist
      // the link. Log loudly so support can manually reconcile via the
      // Dropbox Sign dashboard.
      await logAuditEvent(
        null,
        'security:contract_envelope_unpersisted',
        authResult.user.email,
        {
          contract_id: id,
          signature_request_id: envelope.signatureRequestId,
          demo: envelope.demo,
          error_code: updateErr.code ?? null,
        },
        getRequestContext(request),
      );
      return apiError(updateErr, {
        operation: 'send_for_signature_persist_envelope',
        actor: authResult.user.email,
        requestContext: getRequestContext(request),
      });
    }

    await logAuditEvent(
      null,
      'contract_sent_for_signature',
      authResult.user.email,
      {
        contract_id: id,
        signup_id: signup.id,
        signature_request_id: envelope.signatureRequestId,
        demo: envelope.demo,
        tpa_signer_email: tpaSignerEmail,
        vantaum_signer_email: VANTAUM_SIGNER_EMAIL,
      },
      getRequestContext(request),
    );

    // Item 17: Fire-and-forget email to TPA signer (basic notification)
    // In production this should use a proper template + the email adapter
    if (!envelope.demo) {
      import('@/lib/adapters/email').then(({ getEmailAdapter }) => {
        const email = getEmailAdapter();
        email.send({
          to: tpaSignerEmail,
          subject: `Action Required: Sign your VantaUM MSA + BAA`,
          text: `Please sign the VantaUM Master Services Agreement for ${signup.legal_name}. Link: ${process.env.NEXT_PUBLIC_APP_URL || 'https://app.vantaum.com'}/login`,
        }).catch(() => {});
      });
    }

    return NextResponse.json({
      success: true,
      contract: updated,
      signature_request_id: envelope.signatureRequestId,
      demo: envelope.demo,
    });
  } catch (err) {
    return apiError(err, {
      operation: 'send_for_signature',
      actor: 'system',
      requestContext: getRequestContext(request),
    });
  }
}
