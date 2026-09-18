import type { EmailAdapter, SendEmailParams, SendEmailResult, SendEmailError } from './types';
import { buildRawMime } from './mime';
import { redactEmail } from '@/lib/security';

/**
 * AWS SES v2 implementation of the EmailAdapter.
 *
 * Requires:
 *   - IAM permission ses:SendEmail (Fargate task role in ComputeStack)
 *   - SES_FROM_ADDRESS — verified identity (domain or email)
 *   - Optional SES_CONFIGURATION_SET — bounce/complaint metrics
 *
 * Attachments go out as SendEmail Raw (MIME). Simple content is used
 * when there are no attachments.
 *
 * Domain verification and sandbox-exit are operator steps (see
 * docs/ses-verification-runbook.md). This adapter does not invent
 * identities or credentials.
 *
 * Suppression-list lookup against the DynamoDB table provisioned by
 * EmailStack is staged — not wired here. Until that lands, SES itself
 * still honors account-level suppression.
 */

const REGION = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'us-east-1';

let cachedClient: import('@aws-sdk/client-sesv2').SESv2Client | null = null;

async function getClient(): Promise<import('@aws-sdk/client-sesv2').SESv2Client> {
  if (cachedClient) return cachedClient;
  const { SESv2Client } = await import('@aws-sdk/client-sesv2');
  cachedClient = new SESv2Client({ region: REGION });
  return cachedClient;
}

/** Test-only seam so unit tests never talk to AWS. */
export function _resetSesClientForTests(): void {
  cachedClient = null;
}

export function _setSesClientForTests(client: import('@aws-sdk/client-sesv2').SESv2Client | null): void {
  cachedClient = client;
}

function classifyError(err: unknown): SendEmailError {
  const name = err && typeof err === 'object' && 'name' in err ? String((err as { name: unknown }).name) : '';
  const msg = err instanceof Error ? err.message : String(err);
  const lower = `${name} ${msg}`.toLowerCase();
  const code: SendEmailError['code'] =
    lower.includes('messagerejected') || lower.includes('invalid') ? 'invalid_recipient' :
    lower.includes('suppressed') || lower.includes('accountsendingpaused') ? 'suppressed' :
    lower.includes('throttl') || lower.includes('limit') ? 'rate_limited' :
    lower.includes('timeout') || lower.includes('unavailable') || lower.includes('service') ? 'transient' :
    'unknown';
  return { ok: false, code, message: msg };
}

export class SesEmailAdapter implements EmailAdapter {
  async send(params: SendEmailParams): Promise<SendEmailResult | SendEmailError> {
    const from =
      params.from ??
      process.env.SES_FROM_ADDRESS ??
      process.env.SMTP_FROM ??
      '';
    if (!from) {
      return {
        ok: false,
        code: 'unknown',
        message: 'SES_FROM_ADDRESS is not set. Verify a sending identity before enabling ENABLE_AWS_EMAIL.',
      };
    }

    try {
      const { SendEmailCommand } = await import('@aws-sdk/client-sesv2');
      const client = await getClient();
      const configSet = process.env.SES_CONFIGURATION_SET;
      const hasAttachments = (params.attachments?.length ?? 0) > 0;

      const command = new SendEmailCommand({
        FromEmailAddress: from,
        Destination: { ToAddresses: [params.to] },
        ...(configSet ? { ConfigurationSetName: configSet } : {}),
        Content: hasAttachments
          ? {
              Raw: {
                Data: buildRawMime({
                  from,
                  to: params.to,
                  subject: params.subject,
                  text: params.text,
                  html: params.html,
                  attachments: params.attachments,
                }),
              },
            }
          : {
              Simple: {
                Subject: { Data: params.subject, Charset: 'UTF-8' },
                Body: {
                  Text: { Data: params.text, Charset: 'UTF-8' },
                  Html: {
                    Data:
                      params.html ??
                      `<pre style="font-family:system-ui,sans-serif;white-space:pre-wrap;">${params.text
                        .replace(/&/g, '&amp;')
                        .replace(/</g, '&lt;')
                        .replace(/>/g, '&gt;')}</pre>`,
                    Charset: 'UTF-8',
                  },
                },
              },
            },
      });

      const res = await client.send(command);
      const messageId = res.MessageId ?? `ses-${Date.now()}`;
      return { ok: true, messageId };
    } catch (err) {
      console.error(`[SES] send failed to ${redactEmail(params.to)}:`, classifyError(err).code);
      return classifyError(err);
    }
  }
}
