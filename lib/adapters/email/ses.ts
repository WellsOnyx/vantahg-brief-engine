import type { EmailAdapter, SendEmailParams, SendEmailResult, SendEmailError } from './types';

/**
 * AWS SES implementation of the EmailAdapter.
 *
 * STATUS: stubbed for Cole.
 *
 * Two ways to use SES:
 *   1. Via the existing SMTP adapter — just point SMTP_HOST at the SES
 *      SMTP endpoint and use SES SMTP credentials. No code changes needed.
 *      Recommended for the initial migration.
 *   2. Via the SES SDK (this adapter) — for native bounce tracking,
 *      suppression list management, configuration sets, and sandbox vs.
 *      production sending limits.
 *
 * If you go with the SDK path:
 *   - npm install @aws-sdk/client-sesv2
 *   - Use SendEmailCommand (sesv2) with EmailContent.Simple
 *   - Set FromEmailAddress = env SES_FROM_ADDRESS (must be verified)
 *   - Add a ConfigurationSetName so bounces/complaints go to your SNS topic
 *
 * Bounce + complaint handling:
 *   - In SES, attach an SNS topic to bounces and complaints
 *   - Subscribe a Lambda that writes suppressions to DynamoDB
 *   - This adapter should check suppression before each send and return
 *     `{ ok: false, code: 'suppressed' }` for known bad addresses
 *
 * Region: pick a region that's both verified-for-SES and close to your
 * RDS region — us-east-1 if you have no other constraint.
 */

const NOT_IMPLEMENTED = (op: string) =>
  new Error(
    `SesEmailAdapter.${op} is not implemented yet. See lib/adapters/email/ses.ts for the migration plan. The SMTP adapter handles SES via its SMTP endpoint without code changes if you prefer that path.`,
  );

export class SesEmailAdapter implements EmailAdapter {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async send(_params: SendEmailParams): Promise<SendEmailResult | SendEmailError> {
    throw NOT_IMPLEMENTED('send');
  }
}
