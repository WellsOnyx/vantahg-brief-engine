#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { StorageStack } from '../lib/storage-stack';
import { DatabaseStack } from '../lib/database-stack';
import { AuthStack } from '../lib/auth-stack';
import { EmailStack } from '../lib/email-stack';
import { ComputeStack } from '../lib/compute-stack';
import { CronStack } from '../lib/cron-stack';
import { BuildStack } from '../lib/build-stack';

/**
 * CDK app entrypoint.
 *
 * One stack-set per environment (dev / staging / prod). Each environment
 * gets its own AWS account or at minimum its own region prefix so blast
 * radius is contained.
 *
 * Deploy order (Cole's playbook). Compute now takes live refs from
 * Database + Storage + Email so the task role can reach RDS / S3 / SES:
 *
 *   1. DatabaseStack       → VPC, RDS, Secrets Manager
 *   2. StorageStack        → S3 + KMS
 *   3. EmailStack          → SES config set + suppressions table
 *   4. AuthStack           → Cognito + Lambdas (deployed, not app-cutover)
 *   5. ComputeStack        → Fargate + ALB + bastion
 *   6. CronStack           → EventBridge → ALB
 *   7. BuildStack          → optional; requires VANTAUM_GITHUB_CONNECTION_ARN
 *
 * Adding `appName` to the stack id makes it easy to namespace per-env
 * and per-product in the same account during early staging.
 */

const app = new cdk.App();

const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION ?? 'us-east-1',
};

const envName = process.env.VANTAUM_ENV ?? 'prod';
const appName = `vantaum-${envName}`;

// App-wide tags so every resource we create is identifiable as ours.
// Defensive: makes it trivial to filter "vantaum stuff" vs anyone else's
// resources in the same account.
cdk.Tags.of(app).add('Project', 'vantaum');
cdk.Tags.of(app).add('Environment', envName);
cdk.Tags.of(app).add('ManagedBy', 'cdk-vantaum-infra');

const databaseStack = new DatabaseStack(app, `${appName}-database`, { env, envName });
const storageStack = new StorageStack(app, `${appName}-storage`, { env, envName });
const emailStack = new EmailStack(app, `${appName}-email`, { env, envName });

// AuthStack needs SES details for the magic-link Lambdas.
new AuthStack(app, `${appName}-auth`, {
  env,
  envName,
  appUrl: process.env.APP_URL ?? 'https://app.vantaum.com',
  sesConfigSet: emailStack.configSet.configurationSetName,
  sesFromAddress: process.env.SES_FROM_ADDRESS ?? 'noreply@vantaum.com',
});

// ComputeStack depends on DatabaseStack (needs VPC, db secret, db SG).
// CDK auto-orders deploys based on stack references.
const computeStack = new ComputeStack(app, `${appName}-compute`, {
  env,
  envName,
  vpc: databaseStack.vpc,
  dbSecret: databaseStack.database.secret!,
  dbSecurityGroup: databaseStack.dbSecurityGroup,
  storageKmsKey: storageStack.storageKmsKey,
  signupContractsBucket: storageStack.signupContractsBucket,
  efaxDocumentsBucket: storageStack.efaxDocumentsBucket,
  publicAssetsBucket: storageStack.publicAssetsBucket,
  sesConfigurationSet: emailStack.configSet.configurationSetName,
});

// CronStack POSTs to the ALB on a schedule.
new CronStack(app, `${appName}-cron`, {
  env,
  envName,
  albDnsName: computeStack.loadBalancer.loadBalancerDnsName,
});

// BuildStack is optional. Synth / database-only deploys must not require
// a CodeConnections ARN. Set VANTAUM_GITHUB_CONNECTION_ARN to include it.
if (process.env.VANTAUM_GITHUB_CONNECTION_ARN) {
  new BuildStack(app, `${appName}-build`, {
    env,
    envName,
    appRepositoryName: `${appName}-app`,
    githubOwner: 'WellsOnyx',
    githubRepo: 'vantahg-brief-engine',
    defaultBranch: process.env.VANTAUM_BUILD_DEFAULT_BRANCH ?? 'main',
    githubConnectionArn: process.env.VANTAUM_GITHUB_CONNECTION_ARN,
  });
}
