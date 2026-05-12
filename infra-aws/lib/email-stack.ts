import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';

export interface EmailStackProps extends cdk.StackProps {
  envName: string;
}

/**
 * SES configuration replacing Supabase project SMTP + nodemailer.
 *
 * Contents:
 *   - SES Configuration Set "vantaum-${env}" with engagement metrics
 *     enabled and a dedicated IP pool (request from AWS support
 *     when crossing 100K emails/month).
 *   - SES Event Destination → SNS topic "vantaum-${env}-email-events"
 *     receiving Bounce + Complaint events.
 *   - SNS topic subscribed by a Lambda that writes the offending address
 *     into a "suppressions" DynamoDB table.
 *   - DynamoDB table "vantaum-${env}-email-suppressions" keyed by email.
 *   - IAM role for the Fargate task allowing SendEmail with this
 *     configuration set only.
 *
 * Domain setup (manual, not in this stack):
 *   - Verify vantaum.com in SES (DKIM, SPF, DMARC).
 *   - Move SES out of sandbox (AWS support ticket, 24-48h).
 *
 * Suppression check:
 *   - The SES email adapter (lib/adapters/email/ses.ts) should query
 *     the suppressions table before sending and short-circuit with
 *     code='suppressed' if the address is on the list.
 *
 * Path-of-least-resistance alternative:
 *   - You can use SES via its SMTP endpoint with the existing
 *     SmtpEmailAdapter. Just configure SMTP_HOST + SMTP_USER +
 *     SMTP_PASS to the SES SMTP credentials. No code changes, no
 *     custom adapter, but no native bounce/suppression handling.
 *   - This is the recommended FIRST step. Stand up SES, swap SMTP env,
 *     verify email works. Then build the SDK adapter later for
 *     bounce tracking.
 */
export class EmailStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: EmailStackProps) {
    super(scope, id, props);
    // TODO: SES configuration set
    // TODO: SNS topic for bounces + complaints
    // TODO: DynamoDB suppressions table
    // TODO: Lambda subscriber that writes to suppressions on bounce/complaint
    // TODO: IAM role allowing ses:SendEmail with the configuration set
  }
}
