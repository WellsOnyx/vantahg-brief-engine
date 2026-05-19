import type { StorageAdapter } from './types';
import { SupabaseStorageAdapter } from './supabase';

/**
 * Storage adapter factory.
 *
 * Selection priority:
 *   1. ENABLE_AWS_STORAGE=true → S3StorageAdapter (lazy-loaded only when flag is on)
 *   2. Default → SupabaseStorageAdapter (current production)
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

// Synchronous version that always returns the Supabase adapter.
// Used by legacy call sites and tests that have not been updated yet.
// When ENABLE_AWS_STORAGE is true in production, those paths should be migrated to the async version.
export function getStorageAdapterSync(): StorageAdapter {
  if (override) return override;
  if (cached) return cached;
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
