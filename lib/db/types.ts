/**
 * The narrow database-client interface VantaUM actually uses.
 *
 * Both backends (real Supabase, pg shim) satisfy this. Defining it
 * explicitly lets us swap implementations without `as unknown as`
 * casting and without pulling in Supabase's 200-method type surface.
 *
 * If a caller needs a method not on this interface, that's a signal
 * to extend the interface here (and both implementations) rather than
 * casting around it.
 */

export type SbErrorCode = 'PGRST116' | 'PG_ERROR' | string;

export interface SbError {
  message: string;
  code?: SbErrorCode;
  details?: string;
  hint?: string;
}

export interface SbResult<T> {
  data: T | null;
  error: SbError | null;
  count?: number | null;
  status?: number;
  statusText?: string;
}

export interface CountOptions {
  count?: 'exact' | 'planned' | 'estimated';
  head?: boolean;
}

export interface OrderOptions {
  ascending?: boolean;
  nullsFirst?: boolean;
}

/**
 * Chainable query builder shape. Used by both the pg shim and the real
 * Supabase client (which exposes a superset of these methods).
 *
 * Each method returns `this` so calls chain; awaiting the builder runs
 * the query and yields an SbResult.
 */
export interface QueryChain<T = Record<string, unknown>> extends PromiseLike<SbResult<T>> {
  select(cols?: string, opts?: CountOptions): QueryChain<T>;
  insert(payload: Record<string, unknown> | Array<Record<string, unknown>>): QueryChain<T>;
  update(patch: Record<string, unknown>): QueryChain<T>;
  upsert(payload: Record<string, unknown> | Array<Record<string, unknown>>, opts?: { onConflict?: string }): QueryChain<T>;
  delete(): QueryChain<T>;
  eq(col: string, val: unknown): QueryChain<T>;
  neq(col: string, val: unknown): QueryChain<T>;
  gt(col: string, val: unknown): QueryChain<T>;
  gte(col: string, val: unknown): QueryChain<T>;
  lt(col: string, val: unknown): QueryChain<T>;
  lte(col: string, val: unknown): QueryChain<T>;
  in(col: string, vals: unknown[]): QueryChain<T>;
  ilike(col: string, pat: string): QueryChain<T>;
  like(col: string, pat: string): QueryChain<T>;
  is(col: string, val: null | true | false): QueryChain<T>;
  or(filter: string): QueryChain<T>;
  order(col: string, opts?: OrderOptions): QueryChain<T>;
  limit(n: number): QueryChain<T>;
  range(from: number, to: number): QueryChain<T>;
  single(): QueryChain<T>;
  maybeSingle(): QueryChain<T>;
}

/**
 * Storage upload/download/sign shape. Mirrors what the four storage
 * callers in the codebase need.
 */
export interface SbStorageBucket {
  upload(
    path: string,
    body: Buffer | Blob | ArrayBuffer | Uint8Array,
    opts?: { contentType?: string; upsert?: boolean },
  ): Promise<{ data: { path: string } | null; error: { message: string } | null }>;
  download(path: string): Promise<{ data: Blob | null; error: { message: string } | null }>;
  createSignedUrl(
    path: string,
    ttlSeconds: number,
  ): Promise<{ data: { signedUrl: string } | null; error: { message: string } | null }>;
  remove(paths: string[]): Promise<{ data: unknown[] | null; error: { message: string } | null }>;
}

export interface SbStorage {
  from(bucket: string): SbStorageBucket;
}

/**
 * Auth admin surface. The real Supabase client exposes a much larger
 * `auth` namespace; for VantaUM the AuthAdminAdapter (lib/adapters/auth)
 * is the canonical path. Server callers that want a Supabase-flavored
 * `auth.getUser()` should use createServerClient from lib/supabase-server
 * (which always returns the real Supabase SSR client - the shim's auth
 * getter intentionally throws to surface mistakes).
 */

export interface DbClient {
  from<T = Record<string, unknown>>(table: string): QueryChain<T>;
  readonly storage: SbStorage;
}
