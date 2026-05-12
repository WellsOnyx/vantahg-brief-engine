import * as cdk from 'aws-cdk-lib';
import * as ses from 'aws-cdk-lib/aws-ses';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import { Construct } from 'constructs';

export interface EmailStackProps extends cdk.StackProps {
  envName: string;
}

/**
 * SES configuration + bounce/complaint handling.
 *
 * V1 scope:
 *   - Configuration set "vantaum-${env}" with engagement metrics on.
 *   - SNS topic for bounces + complaints. The Fargate app can subscribe
 *     a /api/webhooks/ses route to this topic later for auto-suppression.
 *   - DynamoDB suppressions table (one row per bad address).
 *
 * NOT in this stack (manual):
 *   - Domain verification for vantaum.com (DKIM, SPF, DMARC).
 *     Reason: SES domain verification requires DNS records on the domain
 *     owner's side. We'll do that after Cloudflare/Route 53 is wired up.
 *   - Sandbox-removal request (AWS support ticket, 24-48h).
 *
 * For the initial migration you can ALSO just point SMTP_HOST at the
 * SES SMTP endpoint and use the existing SmtpEmailAdapter — no code
 * changes, no native bounce handling, but works on day one. The
 * configuration set + suppression table here is the upgrade path.
 */
export class EmailStack extends cdk.Stack {
  public readonly configSet: ses.ConfigurationSet;
  public readonly bounceTopic: sns.Topic;
  public readonly suppressionTable: dynamodb.Table;

  constructor(scope: Construct, id: string, props: EmailStackProps) {
    super(scope, id, props);

    const { envName } = props;

    // ── Configuration set ────────────────────────────────────────────────
    this.configSet = new ses.ConfigurationSet(this, 'ConfigurationSet', {
      configurationSetName: `vantaum-${envName}`,
      sendingEnabled: true,
      reputationMetrics: true,
      tlsPolicy: ses.ConfigurationSetTlsPolicy.REQUIRE,
    });

    // ── SNS topic for bounce + complaint events ──────────────────────────
    this.bounceTopic = new sns.Topic(this, 'BounceTopic', {
      topicName: `vantaum-${envName}-email-events`,
      displayName: `VantaUM ${envName} email bounces and complaints`,
    });

    // ── Suppressions table ───────────────────────────────────────────────
    // Keyed by lowercase email. The app's SES adapter checks this table
    // before sending and short-circuits with code='suppressed' if the
    // address is on the list.
    this.suppressionTable = new dynamodb.Table(this, 'SuppressionsTable', {
      tableName: `vantaum-${envName}-email-suppressions`,
      partitionKey: { name: 'email', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // ── Outputs ──────────────────────────────────────────────────────────
    new cdk.CfnOutput(this, 'ConfigurationSetName', {
      value: this.configSet.configurationSetName,
      exportName: `vantaum-${envName}-ses-config-set`,
    });
    new cdk.CfnOutput(this, 'BounceTopicArn', {
      value: this.bounceTopic.topicArn,
      exportName: `vantaum-${envName}-ses-bounce-topic-arn`,
    });
    new cdk.CfnOutput(this, 'SuppressionTableName', {
      value: this.suppressionTable.tableName,
      exportName: `vantaum-${envName}-ses-suppression-table`,
    });
  }
}
