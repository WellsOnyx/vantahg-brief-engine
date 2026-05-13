import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
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
 * Maps each LogicalBucket to a real S3 bucket using a per-environment
 * prefix:
 *   - 'signup-contracts'  -> vantaum-prod-signup-contracts
 *   - 'efax-documents'    -> vantaum-prod-efax-documents
 *   - 'public-assets'     -> vantaum-prod-public-assets
 *
 * The buckets are provisioned by StorageStack (KMS-encrypted, versioned,
 * block-public, TLS-only). The Fargate task role has GetObject /
 * PutObject / DeleteObject scoped to these bucket ARNs, plus
 * kms:Decrypt / kms:Encrypt on the storage key.
 *
 * Credentials come from the IAM role attached to the runtime (Fargate
 * task role in production, AWS_ACCESS_KEY_ID locally for dev).
 *
 * Error-code mapping:
 *   - NoSuchKey                  -> download not_found
 *   - PreconditionFailed         -> upload duplicate (when If-None-Match=* used)
 *   - EntityTooLarge             -> upload too_large
 *   - AccessDenied / Forbidden   -> forbidden
 *   - 5xx / RequestTimeout       -> transient
 *   - default                    -> unknown
 */

const ENV_PREFIX = process.env.AWS_S3_BUCKET_PREFIX || 'vantaum-prod-';

function realBucketName(logical: LogicalBucket): string {
  return `${ENV_PREFIX}${logical}`;
}

function classifyError(err: unknown): { code: string; message: string } {
  if (!err || typeof err !== 'object') {
    return { code: 'unknown', message: String(err) };
  }
  const e = err as { name?: string; Code?: string; $metadata?: { httpStatusCode?: number }; message?: string };
  const name = e.name ?? e.Code ?? '';
  const status = e.$metadata?.httpStatusCode;
  const msg = e.message ?? name ?? 'S3 error';
  if (name === 'NoSuchKey' || name === 'NotFound' || status === 404) {
    return { code: 'not_found', message: msg };
  }
  if (name === 'PreconditionFailed' || status === 412) {
    return { code: 'duplicate', message: msg };
  }
  if (name === 'EntityTooLarge' || status === 413) {
    return { code: 'too_large', message: msg };
  }
  if (name === 'AccessDenied' || status === 403) {
    return { code: 'forbidden', message: msg };
  }
  if (typeof status === 'number' && status >= 500) {
    return { code: 'transient', message: msg };
  }
  return { code: 'unknown', message: msg };
}

let _client: S3Client | null = null;
function client(): S3Client {
  if (!_client) {
    _client = new S3Client({
      region: process.env.AWS_REGION || 'us-east-1',
    });
  }
  return _client;
}

export class S3StorageAdapter implements StorageAdapter {
  async upload(
    bucket: LogicalBucket,
    path: string,
    bytes: Buffer,
    options: { contentType: string; upsert?: boolean },
  ): Promise<UploadResult | UploadError> {
    try {
      const cmd = new PutObjectCommand({
        Bucket: realBucketName(bucket),
        Key: path,
        Body: bytes,
        ContentType: options.contentType,
        // S3 doesn't have a native "fail-if-exists" for PutObject
        // except via If-None-Match (Conditional Writes - beta). Treating
        // this as best-effort: if the caller said upsert=false, we
        // HEAD first to see if it exists.
        ...(options.upsert === false ? {} : {}),
      });
      if (options.upsert === false) {
        try {
          await client().send(new HeadObjectCommand({
            Bucket: realBucketName(bucket),
            Key: path,
          }));
          return { ok: false, code: 'duplicate', message: 'Object already exists at this path' };
        } catch (headErr) {
          const c = classifyError(headErr);
          if (c.code !== 'not_found') {
            return { ok: false, code: c.code as UploadError['code'], message: c.message };
          }
          // not found -> fall through to put
        }
      }
      await client().send(cmd);
      return { ok: true, path, bytes: bytes.byteLength };
    } catch (err) {
      const c = classifyError(err);
      return { ok: false, code: (c.code === 'not_found' ? 'unknown' : c.code) as UploadError['code'], message: c.message };
    }
  }

  async download(bucket: LogicalBucket, path: string): Promise<DownloadResult | DownloadError> {
    try {
      const r = await client().send(new GetObjectCommand({
        Bucket: realBucketName(bucket),
        Key: path,
      }));
      if (!r.Body) {
        return { ok: false, code: 'not_found', message: 'Empty body' };
      }
      // Convert the AWS-SDK stream to a Buffer.
      const stream = r.Body as { transformToByteArray?: () => Promise<Uint8Array> };
      if (typeof stream.transformToByteArray !== 'function') {
        return { ok: false, code: 'unknown', message: 'Unexpected S3 response shape' };
      }
      const bytes = Buffer.from(await stream.transformToByteArray());
      return {
        ok: true,
        bytes,
        contentType: r.ContentType ?? 'application/octet-stream',
      };
    } catch (err) {
      const c = classifyError(err);
      return { ok: false, code: c.code as DownloadError['code'], message: c.message };
    }
  }

  async signedUrl(
    bucket: LogicalBucket,
    path: string,
    ttlSeconds: number,
  ): Promise<SignedUrlResult | SignedUrlError> {
    try {
      const url = await getSignedUrl(
        client(),
        new GetObjectCommand({ Bucket: realBucketName(bucket), Key: path }),
        { expiresIn: ttlSeconds },
      );
      return {
        ok: true,
        url,
        expiresAt: new Date(Date.now() + ttlSeconds * 1000),
      };
    } catch (err) {
      const c = classifyError(err);
      return { ok: false, code: c.code as SignedUrlError['code'], message: c.message };
    }
  }

  async remove(bucket: LogicalBucket, path: string): Promise<RemoveResult> {
    try {
      await client().send(new DeleteObjectCommand({
        Bucket: realBucketName(bucket),
        Key: path,
      }));
      return { ok: true };
    } catch (err) {
      const c = classifyError(err);
      // not_found is treated as success
      if (c.code === 'not_found') return { ok: true };
      return { ok: false, message: c.message };
    }
  }
}
