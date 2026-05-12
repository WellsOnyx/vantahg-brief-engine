import type { StorageAdapter } from './types';
import { SupabaseStorageAdapter } from './supabase';
import { S3StorageAdapter } from './s3';

/**
 * Storage adapter factory.
 *
 * Selection priority:
 *   1. ENABLE_AWS_STORAGE=true → S3StorageAdapter (Cole's migration target)
 *   2. Default → SupabaseStorageAdapter (current production)
 *
 * Memoized per-process so callers get a single instance. Tests can
 * override via setStorageAdapter().
 */

let cached: StorageAdapter | null = null;
let override: StorageAdapter | null = null;

export function getStorageAdapter(): StorageAdapter {
  if (override) return override;
  if (cached) return cached;
  const useAws = process.env.ENABLE_AWS_STORAGE === 'true';
  cached = useAws ? new S3StorageAdapter() : new SupabaseStorageAdapter();
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
