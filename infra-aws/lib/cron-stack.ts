import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as nodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';
import * as path from 'node:path';

export interface CronStackProps extends cdk.StackProps {
  envName: string;
  albDnsName: string;
}

/**
 * EventBridge schedules replacing Vercel Cron.
 *
 * Each scheduled job runs a small Lambda that POSTs to the ALB at
 * /api/cron/* with Authorization: Bearer ${CRON_SECRET}. Same pattern
 * Vercel Cron uses today - the route handlers don't need to change.
 *
 * Cron jobs (mirrors vercel.json at repo root):
 *   - rate(1 minute) -> /api/cron/efax-process
 *
 * CRON_SECRET is stored in Secrets Manager, created here. The Fargate
 * task will need to read the same secret to validate the header - we
 * surface the secret ARN in the output so ComputeStack v3 can wire it
 * into the task definition.
 */
export class CronStack extends cdk.Stack {
  public readonly cronSecret: secretsmanager.Secret;

  constructor(scope: Construct, id: string, props: CronStackProps) {
    super(scope, id, props);

    const { envName } = props;

    // ── Cron shared secret ──────────────────────────────────────────────
    this.cronSecret = new secretsmanager.Secret(this, 'CronSecret', {
      secretName: `vantaum-${envName}-cron-secret`,
      description: 'Bearer token for /api/cron/* endpoints',
      generateSecretString: {
        passwordLength: 64,
        excludePunctuation: true,
      },
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // ── Invocation Lambda ───────────────────────────────────────────────
    const efaxTargetUrl = `http://${props.albDnsName}/api/cron/efax-process`;
    const efaxCronFn = new nodejs.NodejsFunction(this, 'EfaxCronFn', {
      functionName: `vantaum-${envName}-cron-efax`,
      entry: path.join(__dirname, 'lambdas', 'cron', 'invoke-cron.ts'),
      runtime: lambda.Runtime.NODEJS_22_X,
      architecture: lambda.Architecture.ARM_64,
      handler: 'handler',
      timeout: cdk.Duration.seconds(60),
      logRetention: logs.RetentionDays.ONE_MONTH,
      environment: {
        CRON_TARGET_URL: efaxTargetUrl,
        CRON_SECRET_ARN: this.cronSecret.secretArn,
      },
    });
    this.cronSecret.grantRead(efaxCronFn);

    // ── EventBridge rule: every minute ─────────────────────────────────
    new events.Rule(this, 'EfaxCronRule', {
      ruleName: `vantaum-${envName}-cron-efax`,
      description: 'Invoke /api/cron/efax-process every minute',
      schedule: events.Schedule.rate(cdk.Duration.minutes(1)),
      targets: [new targets.LambdaFunction(efaxCronFn)],
    });

    // ── Outputs ─────────────────────────────────────────────────────────
    new cdk.CfnOutput(this, 'CronSecretArn', {
      value: this.cronSecret.secretArn,
      exportName: `vantaum-${envName}-cron-secret-arn`,
    });
    new cdk.CfnOutput(this, 'EfaxCronFunctionName', {
      value: efaxCronFn.functionName,
      exportName: `vantaum-${envName}-cron-efax-fn`,
    });
  }
}
