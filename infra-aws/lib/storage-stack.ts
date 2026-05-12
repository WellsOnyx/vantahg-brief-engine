import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as kms from 'aws-cdk-lib/aws-kms';
import { Construct } from 'constructs';

export interface StorageStackProps extends cdk.StackProps {
  envName: string;
}

/**
 * S3 buckets replacing Supabase Storage.
 *
 * Three buckets, one per logical namespace from lib/adapters/storage/types.ts:
 *   - vantaum-${env}-signup-contracts  (TPA contract PDFs)
 *   - vantaum-${env}-efax-documents    (intake PHI — strictest controls)
 *   - vantaum-${env}-public-assets     (logos, brand assets — still no public ACL,
 *                                       served via CloudFront origin access)
 *
 * All buckets:
 *   - SSE-KMS with a single per-env customer-managed key (rotation enabled)
 *   - BLOCK_ALL public access
 *   - Versioning enabled (HIPAA-best-practice; recovers from accidental deletes)
 *   - Server access logging into a separate log bucket
 *   - TLS-only (deny-non-secure-transport bucket policy)
 *   - Lifecycle: noncurrent versions expire after 365 days; current objects
 *     stay forever (PHI retention requirements are 6+ years).
 *
 * The KMS key is granted to the Fargate task role later (in ComputeStack)
 * by exporting the key ARN as a stack output and importing it there.
 *
 * Naming: every resource gets a Project=vantaum tag at the app level
 * (see bin/vantaum.ts), plus a stable Stack tag. Cole's stuff has no
 * "vantaum" prefix so collision is impossible.
 */
export class StorageStack extends cdk.Stack {
  public readonly storageKmsKey: kms.Key;
  public readonly signupContractsBucket: s3.Bucket;
  public readonly efaxDocumentsBucket: s3.Bucket;
  public readonly publicAssetsBucket: s3.Bucket;
  public readonly logBucket: s3.Bucket;

  constructor(scope: Construct, id: string, props: StorageStackProps) {
    super(scope, id, props);

    const { envName } = props;

    // ── KMS customer-managed key for all PHI storage ─────────────────────
    // One key per environment. Rotation enabled, deletion guarded by 30-day
    // window so an accidental destroy doesn't immediately wipe PHI.
    this.storageKmsKey = new kms.Key(this, 'StorageKmsKey', {
      alias: `alias/vantaum-${envName}-storage`,
      description: `VantaUM ${envName} — encryption key for all storage buckets`,
      enableKeyRotation: true,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      pendingWindow: cdk.Duration.days(30),
    });

    // ── Log bucket (cheap; receives access logs for all other buckets) ──
    // Server access logs are essential for the HIPAA audit trail. They
    // can't be encrypted with KMS (S3 limitation for log delivery), so
    // we use SSE-S3 (AES256) on the log bucket itself.
    this.logBucket = new s3.Bucket(this, 'LogBucket', {
      bucketName: `vantaum-${envName}-s3-access-logs`,
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      versioned: false,
      enforceSSL: true,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      lifecycleRules: [
        {
          // Hot for 30 days, then move to Glacier Instant Retrieval, then
          // expire after 7 years — matches HIPAA's recommended audit
          // retention period.
          transitions: [
            { storageClass: s3.StorageClass.GLACIER_INSTANT_RETRIEVAL, transitionAfter: cdk.Duration.days(30) },
          ],
          expiration: cdk.Duration.days(7 * 365),
        },
      ],
      objectOwnership: s3.ObjectOwnership.BUCKET_OWNER_PREFERRED,
    });

    // Helper to standardize bucket config across our three logical buckets.
    const phiBucket = (id: string, suffix: string): s3.Bucket =>
      new s3.Bucket(this, id, {
        bucketName: `vantaum-${envName}-${suffix}`,
        encryption: s3.BucketEncryption.KMS,
        encryptionKey: this.storageKmsKey,
        bucketKeyEnabled: true,
        blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
        versioned: true,
        enforceSSL: true,
        removalPolicy: cdk.RemovalPolicy.RETAIN,
        serverAccessLogsBucket: this.logBucket,
        serverAccessLogsPrefix: `${suffix}/`,
        lifecycleRules: [
          {
            // Old versions go away after a year, current objects stay.
            noncurrentVersionExpiration: cdk.Duration.days(365),
            abortIncompleteMultipartUploadAfter: cdk.Duration.days(7),
          },
        ],
      });

    // ── Three application buckets ────────────────────────────────────────
    this.signupContractsBucket = phiBucket('SignupContractsBucket', 'signup-contracts');
    this.efaxDocumentsBucket = phiBucket('EfaxDocumentsBucket', 'efax-documents');
    this.publicAssetsBucket = phiBucket('PublicAssetsBucket', 'public-assets');

    // ── Outputs — referenced by ComputeStack to grant the task role ──────
    new cdk.CfnOutput(this, 'StorageKmsKeyArn', {
      value: this.storageKmsKey.keyArn,
      exportName: `vantaum-${envName}-storage-kms-key-arn`,
    });
    new cdk.CfnOutput(this, 'SignupContractsBucketName', {
      value: this.signupContractsBucket.bucketName,
      exportName: `vantaum-${envName}-signup-contracts-bucket`,
    });
    new cdk.CfnOutput(this, 'EfaxDocumentsBucketName', {
      value: this.efaxDocumentsBucket.bucketName,
      exportName: `vantaum-${envName}-efax-documents-bucket`,
    });
    new cdk.CfnOutput(this, 'PublicAssetsBucketName', {
      value: this.publicAssetsBucket.bucketName,
      exportName: `vantaum-${envName}-public-assets-bucket`,
    });
  }
}
