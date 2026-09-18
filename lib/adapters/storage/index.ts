import type { StorageAdapter } from './types';
import { SupabaseStorageAdapter } from './supabase';

/**
 * Storage adapter factory.
 *
 * Selection priority:
 *   1. ENABLE_AWS_STORAGE=true → S3StorageAdapter (lazy-loaded only when flag is on)
 *   2. Default → SupabaseStorageAdapter (cutover / Vercel path)
 *
 * The S3 adapter is dynamically imported so that Vercel (and any other
 * build that doesn't have the optional AWS SDK packages installed) never
 * tries to resolve @aws-sdk/* at build time. This was the root cause of
 * the 3+ hour string of Vercel preview failures.
 *
 * Memoized per-process.
 */

let cached: StorageAdapter | null = null;
let override: StorageAdapter | null = null;

export async function getStorageAdapter(): Promise<StorageAdapter> {
  if (override) return override;
  if (cached) return cached;

  const useAws = process.env.ENABLE_AWS_STORAGE === 'true';

  if (useAws) {
    const { S3StorageAdapter } = await import('./s3');
    cached = new S3StorageAdapter();
  } else {
    cached = new SupabaseStorageAdapter();
  }

  return cached;
}

/**
 * Sync accessor for tests / legacy call sites.
 * Refuses to silently return Supabase when ENABLE_AWS_STORAGE=true —
 * those callers must use getStorageAdapter() so S3 is actually selected.
 */
export function getStorageAdapterSync(): StorageAdapter {
  if (override) return override;
  if (cached) return cached;
  if (process.env.ENABLE_AWS_STORAGE === 'true') {
    throw new Error(
      'getStorageAdapterSync() cannot select S3. Use await getStorageAdapter() when ENABLE_AWS_STORAGE=true.',
    );
  }
  cached = new SupabaseStorageAdapter();
  return cached;
}

/**
 * Test-only seam. Replaces the cached adapter for the rest of the process.
 * Pass `null` to reset and fall back to env-based selection on next call.
 */
export function setStorageAdapter(adapter: StorageAdapter | null): void {
  override = adapter;
  if (!adapter) cached = null;
}

export type { StorageAdapter, LogicalBucket } from './types';
