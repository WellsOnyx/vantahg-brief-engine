/**
 * Email adapter interface.
 *
 * Smaller than storage/auth because the existing nodemailer-based
 * implementation is already portable: it speaks SMTP, and AWS SES
 * exposes an SMTP endpoint as a drop-in replacement. The adapter exists
 * primarily so Cole can swap in the native SES SDK if he wants:
 *   - delivery + bounce tracking via SNS topics
 *   - suppression list management
 *   - sandbox-vs-production sending limits
 *
 * Two implementations:
 *   - lib/adapters/email/smtp.ts     (nodemailer; current production)
 *   - lib/adapters/email/ses.ts      (AWS SES native SDK; stubbed)
 *
 * For the migration: if Cole moves to SES via the existing SMTP path,
 * he only needs to swap env vars. If he wants the SDK features, he
 * fills in ses.ts and flips ENABLE_AWS_EMAIL=true.
 */

export interface SendEmailParams {
  to: string;
  subject: string;
  /** Plain-text fallback. */
  text: string;
  /** Optional rich HTML. If absent, the adapter generates a basic version from text. */
  html?: string;
  /** Optional From override. Defaults to env-configured address. */
  from?: string;
  /** Optional file attachments (PDFs, etc.). Adapter implementations
   *  are responsible for encoding on the wire (base64 for SMTP, raw
   *  bytes for SES sendRawEmail, etc.). */
  attachments?: EmailAttachment[];
}

export interface EmailAttachment {
  /** File name as it appears in the recipient's mail client. */
  filename: string;
  /** Raw bytes. Adapters encode as the transport requires. */
  content: Buffer;
  /** MIME type, e.g. 'application/pdf'. Defaults to 'application/octet-stream'. */
  contentType?: string;
}

export interface SendEmailResult {
  ok: true;
  /** Provider-specific message id for audit. */
  messageId: string;
}

export interface SendEmailError {
  ok: false;
  code: 'invalid_recipient' | 'suppressed' | 'rate_limited' | 'transient' | 'unknown';
  message: string;
}

export interface EmailAdapter {
  send(params: SendEmailParams): Promise<SendEmailResult | SendEmailError>;
}
