/**
 * Storage adapter interface.
 *
 * Vendor-neutral surface for file storage. Two implementations:
 *   - lib/adapters/storage/supabase.ts (current production)
 *   - lib/adapters/storage/s3.ts       (AWS migration target — stubbed)
 *
 * Why an adapter at all (instead of just calling supabase.storage):
 *   - Cole's migration target is S3. Same primitives, different SDK.
 *   - Local dev and tests benefit from an in-memory implementation.
 *   - We can swap providers per-bucket (e.g. keep contracts on Supabase
 *     while moving large fax PDFs to S3 first) without touching callers.
 *
 * Design choices:
 *   - All operations are async + return discriminated success/error
 *     objects (no thrown errors for expected failure paths). Callers
 *     decide whether to abort or fall through.
 *   - Buffer in, Buffer out — no streaming yet. Files we handle are
 *     small (a few MB at most). Add a stream API if/when needed.
 *   - Signed URLs are short-lived. The provider picks the expiry
 *     algorithm; callers pass a ttlSeconds hint.
 *   - The interface is provider-agnostic, but bucket names are still
 *     vendor-specific (Supabase bucket "signup-contracts" maps to an
 *     S3 bucket like "vantaum-prod-signup-contracts"). Callers pass
 *     the *logical* bucket name; the adapter implementation knows how
 *     to resolve it to a physical resource.
 */

export type LogicalBucket = 'signup-contracts' | 'efax-documents' | 'public-assets';

export interface UploadResult {
  ok: true;
  path: string;
  bytes: number;
}

export interface UploadError {
  ok: false;
  /** Stable code so callers can branch (e.g. retry on 'transient'). */
  code: 'duplicate' | 'too_large' | 'forbidden' | 'transient' | 'unknown';
  message: string;
}

export interface DownloadResult {
  ok: true;
  bytes: Buffer;
  contentType: string;
}

export interface DownloadError {
  ok: false;
  code: 'not_found' | 'forbidden' | 'transient' | 'unknown';
  message: string;
}

export interface SignedUrlResult {
  ok: true;
  url: string;
  expiresAt: Date;
}

export interface SignedUrlError {
  ok: false;
  code: 'not_found' | 'forbidden' | 'unknown';
  message: string;
}

export interface RemoveResult {
  ok: boolean;
  /** Best-effort: providers may swallow not-found and still report ok. */
  message?: string;
}

export interface StorageAdapter {
  /**
   * Uploads `bytes` to `bucket` at `path`. Refuses to overwrite by default
   * (returns `{ ok: false, code: 'duplicate' }`) unless `upsert: true`.
   */
  upload(
    bucket: LogicalBucket,
    path: string,
    bytes: Buffer,
    options: { contentType: string; upsert?: boolean },
  ): Promise<UploadResult | UploadError>;

  /**
   * Downloads `path` from `bucket` as a Buffer. Returns 'not_found' when
   * the path doesn't exist (not a thrown error).
   */
  download(bucket: LogicalBucket, path: string): Promise<DownloadResult | DownloadError>;

  /**
   * Returns a short-lived public URL the browser can fetch directly.
   * `ttlSeconds` is a hint — providers may clamp it (Supabase max 1
   * week, S3 max 7 days for v4 signing).
   */
  signedUrl(
    bucket: LogicalBucket,
    path: string,
    ttlSeconds: number,
  ): Promise<SignedUrlResult | SignedUrlError>;

  /**
   * Removes `path` from `bucket`. Treats not-found as success.
   */
  remove(bucket: LogicalBucket, path: string): Promise<RemoveResult>;
}
