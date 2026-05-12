import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';

export interface CronStackProps extends cdk.StackProps {
  envName: string;
}

/**
 * EventBridge schedules replacing Vercel Cron.
 *
 * V1 (tonight): empty placeholder stack. The schedules need a working
 * Fargate service to POST to (currently no service is deployed). When
 * ComputeStack v2 lands tomorrow with the running Fargate service, this
 * stack picks up:
 *   - EventBridge rule: rate(1 minute) for /api/cron/efax-process
 *   - Invocation Lambda with the POST-with-bearer logic + CRON_SECRET
 *     pulled from Secrets Manager
 *   - DLQ + CloudWatch alarms
 *
 * Until then this is a no-op stack — exists so the CDK app file doesn't
 * reference a non-existent class.
 */
export class CronStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: CronStackProps) {
    super(scope, id, props);
    // Intentionally empty. See class comment.
  }
}
