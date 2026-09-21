/**
 * In-memory relationship store. Process-local, like the CX note store.
 *
 * Accepts only records that already passed `screenMusePayload`.
 * Nothing here is a case, a member, or a clinical packet.
 */

import { createHash } from 'crypto';
import type { MuseRelationshipRecord, MuseTouchpoint } from './types';

function storageKey(record: MuseRelationshipRecord): string {
  if (record.external_touchpoint_id) return `ext:${record.external_touchpoint_id}`;
  return `acct:${record.account_id}:${record.contact_role}`;
}

function touchpointId(key: string): string {
  return `mtp_${createHash('sha256').update(key).digest('hex').slice(0, 16)}`;
}

export interface MuseUpsertResult {
  touchpoint: MuseTouchpoint;
  idempotent: boolean;
}

export class MemoryMuseStore {
  private rows = new Map<string, MuseTouchpoint>();

  upsert(record: MuseRelationshipRecord, now: Date = new Date()): MuseUpsertResult {
    const key = storageKey(record);
    const existing = this.rows.get(key);
    if (existing) return { touchpoint: existing, idempotent: true };
    const touchpoint: MuseTouchpoint = {
      touchpoint_id: touchpointId(key),
      account_id: record.account_id,
      contact_role: record.contact_role,
      scheduling_intent: { ...record.scheduling_intent },
      received_at: now.toISOString(),
    };
    this.rows.set(key, touchpoint);
    return { touchpoint, idempotent: false };
  }

  list(accountId?: string): MuseTouchpoint[] {
    const all = [...this.rows.values()];
    const filtered = accountId ? all.filter((row) => row.account_id === accountId) : all;
    return filtered.sort((a, b) => a.received_at.localeCompare(b.received_at) || a.touchpoint_id.localeCompare(b.touchpoint_id));
  }

  clear(): void {
    this.rows.clear();
  }
}

const GLOBAL_KEY = '__vantaumMuseMemoryStore';

function museGlobal(): typeof globalThis & { [GLOBAL_KEY]?: MemoryMuseStore } {
  return globalThis as typeof globalThis & { [GLOBAL_KEY]?: MemoryMuseStore };
}

/**
 * One store per process. Next dev bundles each route separately, so a
 * module-level `let` is not shared between the webhook and the CX read.
 * globalThis is. This is still not a clinical database.
 */
export function getMemoryMuseStore(): MemoryMuseStore {
  const g = museGlobal();
  if (!g[GLOBAL_KEY]) g[GLOBAL_KEY] = new MemoryMuseStore();
  return g[GLOBAL_KEY];
}

export function resetMemoryMuseStore(): void {
  museGlobal()[GLOBAL_KEY] = new MemoryMuseStore();
}
