import type {
  StorageAdapter,
  LogicalBucket,
  UploadResult,
  UploadError,
  DownloadResult,
  DownloadError,
  SignedUrlResult,
  SignedUrlError,
  RemoveResult,
} from './types';

/**
 * AWS S3 implementation of the StorageAdapter.
 *
 * STATUS: stubbed for Cole.
 *
 * Every method below throws with a clear "not yet implemented" message.
 * The shape is correct — fill in the SDK calls and this file is the only
 * thing that needs to change. Callers and tests don't move.
 *
 * To finish this:
 *   1. `npm install @aws-sdk/client-s3 @aws-sdk/s3-request-presigner`
 *   2. Read AWS_S3_REGION + AWS_S3_BUCKET_PREFIX from process.env.
 *      The prefix lets us map logical buckets to real bucket names —
 *      e.g. prefix "vantaum-prod-" + logical "signup-contracts" =
 *      real bucket "vantaum-prod-signup-contracts".
 *   3. In `infra-aws/` CDK stack, define one bucket per logical name,
 *      all with server-side encryption (SSE-KMS) + versioning enabled
 *      + block-public-access on.
 *   4. Credential strategy: in production we use the IAM role attached
 *      to the runtime (ECS task role / Lambda execution role). In dev,
 *      fall back to AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY.
 *
 * Error-code mapping notes (when you implement):
 *   - S3 `NoSuchKey` → download `not_found`
 *   - S3 `EntityTooLarge` → upload `too_large`
 *   - S3 `AccessDenied` → either `forbidden`
 *   - HTTP 5xx + retryable SDK error → `transient`
 *   - For upload duplicate detection: S3 has no native "fail if exists"
 *     — use If-None-Match: * on the PutObject. The SDK exposes this
 *     via the `IfNoneMatch` request parameter.
 */

const NOT_IMPLEMENTED = (op: string) =>
  new Error(
    `S3StorageAdapter.${op} is not implemented yet. See lib/adapters/storage/s3.ts for the migration checklist. The Supabase adapter is the source of truth until ENABLE_AWS_STORAGE=true is set.`,
  );

export class S3StorageAdapter implements StorageAdapter {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async upload(
    _bucket: LogicalBucket,
    _path: string,
    _bytes: Buffer,
    _options: { contentType: string; upsert?: boolean },
  ): Promise<UploadResult | UploadError> {
    throw NOT_IMPLEMENTED('upload');
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async download(_bucket: LogicalBucket, _path: string): Promise<DownloadResult | DownloadError> {
    throw NOT_IMPLEMENTED('download');
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async signedUrl(
    _bucket: LogicalBucket,
    _path: string,
    _ttlSeconds: number,
  ): Promise<SignedUrlResult | SignedUrlError> {
    throw NOT_IMPLEMENTED('signedUrl');
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async remove(_bucket: LogicalBucket, _path: string): Promise<RemoveResult> {
    throw NOT_IMPLEMENTED('remove');
  }
}
