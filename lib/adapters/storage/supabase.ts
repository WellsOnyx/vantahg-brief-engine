import type { SupabaseClient } from '@supabase/supabase-js';
import { getServiceClient } from '@/lib/supabase';
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
 * Supabase Storage implementation of the StorageAdapter.
 *
 * Logical buckets map 1:1 to Supabase Storage bucket names — Supabase
 * conventions are already what the rest of the codebase uses.
 *
 * Error mapping: Supabase returns errors with stringly-typed `message`
 * fields, so we pattern-match on substrings to derive our stable codes.
 * This is best-effort; unknown errors fall through to 'unknown'.
 */

function mapUploadError(message: string): UploadError['code'] {
  const m = message.toLowerCase();
  if (m.includes('already exists') || m.includes('duplicate')) return 'duplicate';
  if (m.includes('too large') || m.includes('payload too large')) return 'too_large';
  if (m.includes('forbidden') || m.includes('not authorized')) return 'forbidden';
  if (m.includes('timeout') || m.includes('econn')) return 'transient';
  return 'unknown';
}

function mapDownloadError(message: string): DownloadError['code'] {
  const m = message.toLowerCase();
  if (m.includes('not found') || m.includes('does not exist')) return 'not_found';
  if (m.includes('forbidden') || m.includes('not authorized')) return 'forbidden';
  if (m.includes('timeout') || m.includes('econn')) return 'transient';
  return 'unknown';
}

export class SupabaseStorageAdapter implements StorageAdapter {
  private readonly _client: SupabaseClient | null;

  constructor(client?: SupabaseClient) {
    // Lazy: hold the optional injected client. The real one is fetched
    // on first use via getServiceClient() so constructing the adapter
    // doesn't require Supabase env vars to be set (helps tests + cold
    // Vercel routes that never actually hit storage).
    this._client = client ?? null;
  }

  private get client(): SupabaseClient {
    return this._client ?? getServiceClient();
  }

  async upload(
    bucket: LogicalBucket,
    path: string,
    bytes: Buffer,
    options: { contentType: string; upsert?: boolean },
  ): Promise<UploadResult | UploadError> {
    const { error } = await this.client.storage
      .from(bucket)
      .upload(path, bytes, {
        contentType: options.contentType,
        upsert: options.upsert ?? false,
      });
    if (error) {
      return { ok: false, code: mapUploadError(error.message), message: error.message };
    }
    return { ok: true, path, bytes: bytes.byteLength };
  }

  async download(bucket: LogicalBucket, path: string): Promise<DownloadResult | DownloadError> {
    const { data, error } = await this.client.storage.from(bucket).download(path);
    if (error || !data) {
      return {
        ok: false,
        code: error ? mapDownloadError(error.message) : 'not_found',
        message: error?.message ?? 'Empty blob',
      };
    }
    const bytes = Buffer.from(await data.arrayBuffer());
    // Blob.type is unreliable in Node — fall back to a sane default for
    // the only file format we currently store programmatically.
    const contentType = data.type || 'application/octet-stream';
    return { ok: true, bytes, contentType };
  }

  async signedUrl(
    bucket: LogicalBucket,
    path: string,
    ttlSeconds: number,
  ): Promise<SignedUrlResult | SignedUrlError> {
    const { data, error } = await this.client.storage
      .from(bucket)
      .createSignedUrl(path, ttlSeconds);
    if (error || !data?.signedUrl) {
      return {
        ok: false,
        code: error?.message?.toLowerCase().includes('not found') ? 'not_found' : 'unknown',
        message: error?.message ?? 'No signed URL returned',
      };
    }
    return {
      ok: true,
      url: data.signedUrl,
      expiresAt: new Date(Date.now() + ttlSeconds * 1000),
    };
  }

  async remove(bucket: LogicalBucket, path: string): Promise<RemoveResult> {
    const { error } = await this.client.storage.from(bucket).remove([path]);
    if (error) {
      return { ok: false, message: error.message };
    }
    return { ok: true };
  }
}
