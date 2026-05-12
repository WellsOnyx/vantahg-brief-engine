import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';

export interface ComputeStackProps extends cdk.StackProps {
  envName: string;
}

/**
 * Fargate service hosting the Next.js app, replacing Vercel.
 *
 * Why Fargate instead of Lambda:
 *   - Long-running, warm processes for the eFax cron worker that's
 *     poll-and-claim style. Lambda cold starts and concurrency caps
 *     are annoying for that workload.
 *   - Simpler image-based deploys (Vercel-like flow with ECR + CodeDeploy).
 *
 * Build:
 *   - Next.js produces a standalone output when `output: 'standalone'`
 *     is set in next.config (already implicit at build time for Vercel;
 *     verify before Cole's deploy).
 *   - Multi-stage Dockerfile at repo root:
 *       Stage 1: node:22-alpine + npm ci + next build (standalone)
 *       Stage 2: node:22-alpine + copy /app/.next/standalone + /public
 *   - Final image ~150MB.
 *
 * Resources:
 *   - VPC: reuse the one DatabaseStack created.
 *   - Cluster: one shared per environment.
 *   - Service: 2+ tasks behind an ALB. CPU 1024 / Memory 2048 to start.
 *   - Auto-scaling on CPU + ALB request count.
 *   - ALB:
 *       - HTTPS listener with ACM cert for vantaum.com (validated via Route53).
 *       - HTTP redirect to HTTPS.
 *       - Health check at /api/health.
 *   - ECR repo with lifecycle keeping last 30 images.
 *
 * Env vars / secrets:
 *   - DATABASE_URL from DatabaseStack secret.
 *   - SES_FROM_ADDRESS from EmailStack output.
 *   - COGNITO_USER_POOL_ID + COGNITO_CLIENT_ID from AuthStack.
 *   - All ENABLE_AWS_* flags set to "true" so adapters pick the AWS impl.
 *   - HELLOSIGN_API_KEY etc. pulled from Secrets Manager.
 *
 * DNS cutover:
 *   - Pre-cutover: ALB DNS points at the running service, smoke-tested
 *     via a temporary hostname like vantaum-aws.wellsonyx.com.
 *   - Cutover: change vantaum.com A record from Vercel to the ALB.
 *   - Rollback: change back. Vercel deploy stays running for 30 days.
 */
export class ComputeStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: ComputeStackProps) {
    super(scope, id, props);
    // TODO: ECR repo
    // TODO: VPC import or shared
    // TODO: ALB + HTTPS listener + ACM cert
    // TODO: Fargate cluster + task definition + service
    // TODO: auto-scaling policy
    // TODO: CloudWatch log group + retention
    // TODO: Route53 record (manual cutover; create record but leave swap to the operator)
  }
}
