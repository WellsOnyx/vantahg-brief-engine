#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { StorageStack } from '../lib/storage-stack';
import { DatabaseStack } from '../lib/database-stack';
import { AuthStack } from '../lib/auth-stack';
import { EmailStack } from '../lib/email-stack';
import { ComputeStack } from '../lib/compute-stack';
import { CronStack } from '../lib/cron-stack';

/**
 * CDK app entrypoint.
 *
 * One stack-set per environment (dev / staging / prod). Each environment
 * gets its own AWS account or at minimum its own region prefix so blast
 * radius is contained.
 *
 * The stacks are independent (no cross-stack refs) so Cole can deploy
 * them piecewise during the migration:
 *
 *   1. DatabaseStack       → RDS, run migrations, validate read parity
 *   2. StorageStack        → S3 buckets, backfill from Supabase
 *   3. EmailStack          → SES + DynamoDB, point SMTP_HOST at SES endpoint
 *   4. AuthStack           → Cognito + Lambdas (the big one)
 *   5. ComputeStack        → Fargate + ALB, DNS cutover from Vercel
 *   6. CronStack           → EventBridge, point at the new ALB
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

new DatabaseStack(app, `${appName}-database`, { env, envName });
new StorageStack(app, `${appName}-storage`, { env, envName });
new EmailStack(app, `${appName}-email`, { env, envName });
new AuthStack(app, `${appName}-auth`, { env, envName });
new ComputeStack(app, `${appName}-compute`, { env, envName });
// CronStack omitted from the deploy until ComputeStack v2 ships a
// running Fargate service for the cron Lambda to invoke. The class
// exists so the migration plan stays intact.
void CronStack;
