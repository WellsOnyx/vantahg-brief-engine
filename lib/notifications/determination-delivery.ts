/**
 * Determination letter email delivery.
 *
 * The triage-tier "notify TPA the determination is ready" flow already
 * exists in `lib/notifications.ts` (notifyDeterminationReady) — it sends
 * a plain-text email with a link back to the determination page. This
 * module does the next step: render the formal determination letter as
 * a PDF and email it as an attachment so the TPA / member has a stable
 * artifact independent of the app being reachable.
 *
 * Idempotent: re-running against a case already in 'delivered' status
 * returns { already_delivered: true } without re-sending. Status
 * transition + message id are captured on the audit trail rather than
 * a new column so this ships without a migration (RDS migrations are
 * gated on bastion access — see STATE.md).
 *
 * Demo mode short-circuits to a fake message id; no PDF generation,
 * no email send, no DB writes.
 */

import { getServiceClient } from '@/lib/supabase';
import { isDemoMode } from '@/lib/demo-mode';
import { logAuditEvent } from '@/lib/audit';
import { generateDeterminationPdf } from '@/lib/pdf-generator';
import { getEmailAdapter } from '@/lib/adapters/email';
import type { Case } from '@/lib/types';

export interface DeliveryResult {
  ok: true;
  already_delivered?: boolean;
  messageId?: string;
  recipient_email: string;
  case_number: string;
}

export interface DeliveryError {
  ok: false;
  code:
    | 'case_not_found'
    | 'no_determination'
    | 'no_recipient'
    | 'pdf_failed'
    | 'send_failed';
  message: string;
}

interface DeliveryOptions {
  /** Email of the staff member triggering the send. Used as the audit actor. */
  actor: string;
  /** Optional override of the recipient (e.g. resend to a different address).
   *  Defaults to the case's client.contact_email. */
  recipientOverride?: string;
}

/**
 * Render the determination letter PDF and email it to the TPA client.
 * Marks the case as 'delivered' on success. Idempotent.
 */
export async function deliverDeterminationLetter(
  caseId: string,
  options: DeliveryOptions,
): Promise<DeliveryResult | DeliveryError> {
  if (isDemoMode()) {
    return {
      ok: true,
      messageId: `demo-${Date.now()}`,
      recipient_email: options.recipientOverride ?? 'demo-tpa@example.com',
      case_number: `DEMO-${caseId.slice(0, 6)}`,
    };
  }

  const supabase = getServiceClient();

  const { data, error } = await supabase
    .from('cases')
    .select('*, client:clients(name, contact_email)')
    .eq('id', caseId)
    .single();

  if (error || !data) {
    return { ok: false, code: 'case_not_found', message: error?.message ?? 'No row' };
  }

  const caseData = data as Case & {
    client?: { name?: string | null; contact_email?: string | null } | null;
  };

  if (!caseData.determination) {
    return {
      ok: false,
      code: 'no_determination',
      message: 'Case has no determination yet — nothing to deliver.',
    };
  }

  const recipient =
    options.recipientOverride ?? caseData.client?.contact_email ?? null;
  if (!recipient) {
    return {
      ok: false,
      code: 'no_recipient',
      message: 'No contact_email on the client record and no override was provided.',
    };
  }

  // Idempotency. The 'delivered' status is the marker that the letter
  // has already gone out; we surface the previous send via audit log
  // rather than restoring the message id (which would require a new
  // column + migration).
  if (caseData.status === 'delivered') {
    return {
      ok: true,
      already_delivered: true,
      recipient_email: recipient,
      case_number: caseData.case_number ?? '',
    };
  }

  let pdfBuffer: Buffer;
  try {
    pdfBuffer = await generateDeterminationPdf(caseData);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await logAuditEvent(caseId, 'determination_letter_delivery_failed', options.actor, {
      reason: 'pdf_failed',
      detail: msg,
    }).catch(() => {});
    return { ok: false, code: 'pdf_failed', message: msg };
  }

  const adapter = getEmailAdapter();
  const determination = caseData.determination ?? 'pending';
  const decisionLabel = determination.replace(/_/g, ' ').toUpperCase();
  const filename = `determination-${caseData.case_number ?? caseId}.pdf`;

  const text = [
    `Dear ${caseData.client?.name ?? 'Partner'},`,
    '',
    `Attached is the determination letter for case ${caseData.case_number}.`,
    '',
    `Determination: ${decisionLabel}`,
    `Patient: ${caseData.patient_name ?? '[redacted]'}`,
    '',
    'Please retain this PDF for your records. Appeal rights and instructions are included in the letter.',
    '',
    'VantaUM Clinical Utilization Review',
  ].join('\n');

  const sendResult = await adapter.send({
    to: recipient,
    subject: `Determination ready: ${caseData.case_number} (${decisionLabel})`,
    text,
    attachments: [
      {
        filename,
        content: pdfBuffer,
        contentType: 'application/pdf',
      },
    ],
  });

  if (!sendResult.ok) {
    await logAuditEvent(caseId, 'determination_letter_delivery_failed', options.actor, {
      reason: 'send_failed',
      code: sendResult.code,
      detail: sendResult.message,
      recipient_email_redacted: redactEmail(recipient),
    }).catch(() => {});
    return { ok: false, code: 'send_failed', message: sendResult.message };
  }

  await supabase
    .from('cases')
    .update({ status: 'delivered' })
    .eq('id', caseId);

  await logAuditEvent(caseId, 'determination_letter_delivered', options.actor, {
    case_number: caseData.case_number,
    determination,
    message_id: sendResult.messageId,
    recipient_email_redacted: redactEmail(recipient),
  }).catch(() => {});

  return {
    ok: true,
    messageId: sendResult.messageId,
    recipient_email: recipient,
    case_number: caseData.case_number ?? '',
  };
}

function redactEmail(email: string): string {
  const at = email.indexOf('@');
  if (at <= 0) return '***';
  const head = email.slice(0, Math.min(3, at));
  return `${head}***${email.slice(at)}`;
}
