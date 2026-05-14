import type { EmailAdapter, SendEmailParams, SendEmailResult, SendEmailError } from './types';

/**
 * Generic SMTP implementation via nodemailer.
 *
 * Works with any SMTP server — Supabase auth-mail SMTP, SendGrid, SES
 * via SMTP endpoint, etc. Configuration comes from SMTP_* env vars:
 *
 *   SMTP_HOST
 *   SMTP_PORT (default 587)
 *   SMTP_USER
 *   SMTP_PASS
 *   SMTP_FROM (default 'VantaUM <noreply@vantaum.com>')
 *
 * If host/user/pass are absent the adapter logs the message and returns
 * success — useful for local dev without an SMTP server.
 */

export class SmtpEmailAdapter implements EmailAdapter {
  async send(params: SendEmailParams): Promise<SendEmailResult | SendEmailError> {
    const smtpHost = process.env.SMTP_HOST;
    const smtpPort = process.env.SMTP_PORT;
    const smtpUser = process.env.SMTP_USER;
    const smtpPass = process.env.SMTP_PASS;
    const smtpFrom =
      params.from ?? process.env.SMTP_FROM ?? 'VantaUM <noreply@vantaum.com>';

    if (!smtpHost || !smtpUser || !smtpPass) {
      // No SMTP configured — log and return ok so the caller's happy
      // path keeps working in dev. Production should always have these.
      console.log(`[EMAIL STUB] To: ${params.to} | Subject: ${params.subject}`);
      return { ok: true, messageId: `stub-${Date.now()}` };
    }

    try {
      const nodemailer = await import('nodemailer');
      const transporter = nodemailer.createTransport({
        host: smtpHost,
        port: parseInt(smtpPort || '587', 10),
        secure: (smtpPort || '587') === '465',
        auth: { user: smtpUser, pass: smtpPass },
      });
      const info = await transporter.sendMail({
        from: smtpFrom,
        to: params.to,
        subject: params.subject,
        text: params.text,
        html: params.html ?? defaultHtml(params.subject, params.text),
        attachments: params.attachments?.map((a) => ({
          filename: a.filename,
          content: a.content,
          contentType: a.contentType ?? 'application/octet-stream',
        })),
      });
      return { ok: true, messageId: info.messageId ?? `smtp-${Date.now()}` };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const lower = msg.toLowerCase();
      const code: SendEmailError['code'] =
        lower.includes('invalid recipient') || lower.includes('no such user') ? 'invalid_recipient' :
        lower.includes('suppressed') ? 'suppressed' :
        lower.includes('rate') ? 'rate_limited' :
        lower.includes('timeout') || lower.includes('econn') ? 'transient' :
        'unknown';
      return { ok: false, code, message: msg };
    }
  }
}

function defaultHtml(subject: string, text: string): string {
  const escaped = text.replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]!));
  return `<!doctype html><html><body style="font-family:system-ui,sans-serif;color:#0c2340;line-height:1.5;">
    <div style="max-width:560px;margin:32px auto;padding:24px;">
      <h2 style="margin:0 0 16px 0;color:#0c2340;">${subject}</h2>
      <pre style="white-space:pre-wrap;font-family:inherit;font-size:14px;">${escaped}</pre>
    </div></body></html>`;
}
