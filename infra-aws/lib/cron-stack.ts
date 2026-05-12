import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';

export interface CronStackProps extends cdk.StackProps {
  envName: string;
}

/**
 * EventBridge schedules replacing Vercel Cron.
 *
 * Each Vercel Cron entry maps to an EventBridge rule whose target is a
 * tiny invocation Lambda that POSTs to the existing /api/cron/* route on
 * the Fargate ALB with the Authorization: Bearer ${CRON_SECRET} header.
 *
 * Why a Lambda instead of an HTTPS target:
 *   - EventBridge HTTPS targets require API destinations + connections
 *     which are clumsy for our header-auth pattern.
 *   - A 50-line Lambda gives us auth header injection, retry policy,
 *     and a CloudWatch log line per invocation for free.
 *
 * Existing cron jobs (read from vercel.json at the repo root):
 *   - /api/cron/efax-process — every minute. Most critical.
 *   - (add others as they appear in vercel.json)
 *
 * Schedules in CDK:
 *   - rate(1 minute) for the efax worker.
 *   - cron(0 9 * * ? *) UTC for daily reports if/when we add them.
 *
 * Invocation Lambda env:
 *   - CRON_TARGET_URL = ALB DNS + path
 *   - CRON_SECRET via Secrets Manager
 *
 * Failure handling:
 *   - DLQ for missed invocations (SQS).
 *   - CloudWatch alarm on schedule failures + Lambda errors.
 */
export class CronStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: CronStackProps) {
    super(scope, id, props);
    // TODO: invocation Lambda (Node 22) with the POST-with-bearer logic
    // TODO: EventBridge rule for /api/cron/efax-process (rate 1 minute)
    // TODO: DLQ (SQS) + CloudWatch alarm
    // TODO: parse other cron entries from app's vercel.json at infra-build time
  }
}
