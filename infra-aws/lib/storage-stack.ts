import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';

export interface StorageStackProps extends cdk.StackProps {
  envName: string;
}

/**
 * S3 buckets replacing Supabase Storage.
 *
 * One bucket per logical storage namespace, matching `LogicalBucket` in
 * lib/adapters/storage/types.ts:
 *   - vantaum-${env}-signup-contracts  (private, KMS, versioned)
 *   - vantaum-${env}-efax-documents    (private, KMS, versioned, PHI)
 *   - vantaum-${env}-public-assets     (CloudFront origin, public-read off but readable via OAI)
 *
 * All buckets:
 *   - SSE-KMS with a per-env CMK (rotation enabled).
 *   - blockPublicAccess: BLOCK_ALL.
 *   - versioned: true (recovers from accidental deletes; required for HIPAA).
 *   - lifecycle: transition to IA after 90 days, expire noncurrent versions after 365.
 *   - server access logging into a separate log bucket.
 *
 * IAM:
 *   - The Fargate task role gets s3:GetObject + PutObject + DeleteObject
 *     scoped to these bucket ARNs only.
 *
 * Cross-region replication off for V1 to control cost. Add when SLA requires it.
 *
 * Backfill from Supabase:
 *   - aws s3 sync from a temp EC2 with Supabase service-role credentials.
 *   - Storage paths can be 1:1 copied; the adapter uses the same path
 *     scheme. Verify object metadata (Content-Type) survives the sync.
 */
export class StorageStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: StorageStackProps) {
    super(scope, id, props);
    // TODO: KMS key (alias: alias/vantaum-${env}-storage)
    // TODO: log bucket (separate, cheaper class)
    // TODO: signup-contracts bucket
    // TODO: efax-documents bucket
    // TODO: public-assets bucket
    // TODO: export bucket ARNs via cdk.CfnOutput so ComputeStack can reference
  }
}
