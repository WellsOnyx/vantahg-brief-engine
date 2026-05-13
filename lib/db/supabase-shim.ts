import { getPool } from './pool';
import { getStorageAdapter, type LogicalBucket } from '@/lib/adapters/storage';
import type {
  DbClient,
  QueryChain,
  SbResult,
  SbStorage,
  SbStorageBucket,
  CountOptions as DbCountOptions,
  OrderOptions as DbOrderOptions,
} from './types';

/**
 * Drop-in replacement for the slice of @supabase/supabase-js the app uses.
 *
 * Why this exists: the app has ~236 `supabase.from(...)` call sites with
 * Supabase's chainable query API (.eq, .select, .order, .single, etc.).
 * Rewriting each one as raw SQL would take days. Instead this shim
 * exposes the same chainable surface but compiles to standard parameterized
 * SQL against the pg pool.
 *
 * Scope: covers the methods we actually use, in the patterns we use them.
 * Anything unsupported throws with a clear message so we catch it during
 * cutover rather than silently misbehaving.
 *
 * Supported chainable methods:
 *   .from(table)
 *   .select(cols)               — also supports nested joins like
 *                                  'col, fk:foreign_table(*)' via LEFT JOIN
 *                                  with json_agg
 *   .insert(row | rows)         — returns inserted rows when chained with
 *                                  .select()
 *   .update(patch)
 *   .upsert(row, { onConflict }) — limited; treats onConflict as a column
 *                                  list and does ON CONFLICT DO UPDATE
 *   .delete()
 *   .eq(col, val)
 *   .neq(col, val)
 *   .gt(col, val)
 *   .gte(col, val)
 *   .lt(col, val)
 *   .lte(col, val)
 *   .in(col, vals)
 *   .ilike(col, pattern)
 *   .like(col, pattern)
 *   .is(col, null)
 *   .order(col, opts)
 *   .limit(n)
 *   .range(from, to)
 *   .single()                   — expects exactly 1 row, errors otherwise
 *   .maybeSingle()              — 0 or 1 row, returns null when 0
 *   .or(filter1,filter2,...)    — combines with OR. Supports basic eq filter format.
 *
 * Errors come back as { data: null, error: { message, code? } } to match
 * supabase-js. Successful results come back as { data, error: null }.
 *
 * Limitations (deliberate, will surface as runtime errors):
 *   - .contains() (jsonb @>) not supported
 *   - .not('col', 'is', null) form not supported (use .is(col, null) + negate)
 *   - Nested-join inserts don't return joined rows
 *   - .filter() arbitrary expression not supported
 */

type Param = string | number | boolean | null | Date | string[] | number[] | Record<string, unknown> | unknown[];

interface SelectShape {
  baseCols: string;
  joins: Array<{ alias: string; table: string; cols: string }>;
}

// Re-export the canonical types under the names used throughout this file.
type CountOptions = DbCountOptions;
type OrderOptions = DbOrderOptions;

type Operation = 'select' | 'insert' | 'update' | 'upsert' | 'delete';

function parseSelect(cols: string): SelectShape {
  // Split top-level commas (not inside parens).
  const tokens: string[] = [];
  let depth = 0;
  let buf = '';
  for (const ch of cols) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) {
      tokens.push(buf.trim());
      buf = '';
    } else {
      buf += ch;
    }
  }
  if (buf.trim()) tokens.push(buf.trim());

  const baseCols: string[] = [];
  const joins: SelectShape['joins'] = [];
  for (const t of tokens) {
    const joinMatch = t.match(/^(?:([a-zA-Z_][a-zA-Z0-9_]*)\s*:\s*)?([a-zA-Z_][a-zA-Z0-9_]*)\s*\(([^)]*)\)$/);
    if (joinMatch) {
      const [, alias, table, innerCols] = joinMatch;
      joins.push({
        alias: alias ?? table,
        table,
        cols: innerCols.trim() || '*',
      });
    } else {
      baseCols.push(t);
    }
  }
  return {
    baseCols: baseCols.length === 0 ? '*' : baseCols.join(', '),
    joins,
  };
}

function quoteIdent(id: string): string {
  // Defensive: only allow word chars + dots. Supabase column names are
  // tightly controlled in this codebase so this is enough.
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(id)) {
    throw new Error(`Unsafe identifier: ${id}`);
  }
  return `"${id}"`;
}

interface Filter {
  col: string;
  op: '=' | '!=' | '>' | '>=' | '<' | '<=' | 'IN' | 'ILIKE' | 'LIKE' | 'IS NULL' | 'IS NOT NULL' | 'OR';
  value?: unknown;
}

class QueryBuilder<T = Record<string, unknown>> implements QueryChain<T> {
  private readonly table: string;
  private op: Operation = 'select';
  private selectShape: SelectShape = { baseCols: '*', joins: [] };
  private filters: Filter[] = [];
  private orderClauses: Array<{ col: string; asc: boolean; nullsFirst?: boolean }> = [];
  private limitN: number | null = null;
  private rangeFrom: number | null = null;
  private rangeTo: number | null = null;
  private singleMode: 'none' | 'single' | 'maybe' = 'none';
  private writePayload: Record<string, unknown> | Array<Record<string, unknown>> | null = null;
  private updatePatch: Record<string, unknown> | null = null;
  private upsertOnConflict: string | null = null;
  private returnInserted = false;
  private countMode: CountOptions['count'] | null = null;
  private headOnly = false;

  constructor(table: string) {
    this.table = table;
  }

  select(cols = '*', opts?: CountOptions): this {
    this.selectShape = parseSelect(cols);
    if (opts?.count) this.countMode = opts.count;
    if (opts?.head) this.headOnly = true;
    // If select is called after insert/update/upsert we want returning.
    if (this.op === 'insert' || this.op === 'update' || this.op === 'upsert') {
      this.returnInserted = true;
    }
    return this;
  }

  insert(payload: Record<string, unknown> | Array<Record<string, unknown>>): this {
    this.op = 'insert';
    this.writePayload = payload;
    return this;
  }

  update(patch: Record<string, unknown>): this {
    this.op = 'update';
    this.updatePatch = patch;
    return this;
  }

  upsert(payload: Record<string, unknown> | Array<Record<string, unknown>>, opts?: { onConflict?: string }): this {
    this.op = 'upsert';
    this.writePayload = payload;
    this.upsertOnConflict = opts?.onConflict ?? null;
    return this;
  }

  delete(): this {
    this.op = 'delete';
    return this;
  }

  eq(col: string, val: unknown): this { this.filters.push({ col, op: '=', value: val }); return this; }
  neq(col: string, val: unknown): this { this.filters.push({ col, op: '!=', value: val }); return this; }
  gt(col: string, val: unknown): this { this.filters.push({ col, op: '>', value: val }); return this; }
  gte(col: string, val: unknown): this { this.filters.push({ col, op: '>=', value: val }); return this; }
  lt(col: string, val: unknown): this { this.filters.push({ col, op: '<', value: val }); return this; }
  lte(col: string, val: unknown): this { this.filters.push({ col, op: '<=', value: val }); return this; }
  in(col: string, vals: unknown[]): this { this.filters.push({ col, op: 'IN', value: vals }); return this; }
  ilike(col: string, pat: string): this { this.filters.push({ col, op: 'ILIKE', value: pat }); return this; }
  like(col: string, pat: string): this { this.filters.push({ col, op: 'LIKE', value: pat }); return this; }
  is(col: string, val: null | true | false): this {
    if (val === null) this.filters.push({ col, op: 'IS NULL' });
    else throw new Error('.is() only supports null in this shim');
    return this;
  }
  // Supabase .or('a.eq.1,b.eq.2') style. Minimal parser.
  or(filter: string): this { this.filters.push({ col: '', op: 'OR', value: filter }); return this; }

  order(col: string, opts: OrderOptions = {}): this {
    this.orderClauses.push({
      col,
      asc: opts.ascending !== false,
      nullsFirst: opts.nullsFirst,
    });
    return this;
  }

  limit(n: number): this { this.limitN = n; return this; }
  range(from: number, to: number): this { this.rangeFrom = from; this.rangeTo = to; return this; }

  single(): this { this.singleMode = 'single'; return this; }
  maybeSingle(): this { this.singleMode = 'maybe'; return this; }

  // PromiseLike<SbResult<T>> conformance: callers `await` the builder.
  then<R1 = SbResult<T>, R2 = never>(
    onfulfilled?: ((value: SbResult<T>) => R1 | PromiseLike<R1>) | null,
    onrejected?: ((reason: unknown) => R2 | PromiseLike<R2>) | null,
  ): Promise<R1 | R2> {
    return this.execute().then(onfulfilled, onrejected);
  }

  private buildWhere(params: unknown[]): string {
    if (this.filters.length === 0) return '';
    const parts: string[] = [];
    for (const f of this.filters) {
      if (f.op === 'IS NULL') {
        parts.push(`${quoteIdent(f.col)} IS NULL`);
      } else if (f.op === 'IS NOT NULL') {
        parts.push(`${quoteIdent(f.col)} IS NOT NULL`);
      } else if (f.op === 'IN') {
        const vals = (f.value as unknown[]) ?? [];
        if (vals.length === 0) {
          // Match supabase: empty IN returns no rows
          parts.push('FALSE');
        } else {
          const placeholders: string[] = [];
          for (const v of vals) {
            params.push(v);
            placeholders.push(`$${params.length}`);
          }
          parts.push(`${quoteIdent(f.col)} IN (${placeholders.join(', ')})`);
        }
      } else if (f.op === 'OR') {
        const filter = String(f.value);
        // Parse .or('col.eq.val,col2.eq.val2')
        const orParts: string[] = [];
        for (const piece of filter.split(',')) {
          const m = piece.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\.([a-z]+)\.(.+)$/);
          if (m) {
            const [, col, op, val] = m;
            params.push(val);
            const opSql = op === 'eq' ? '=' : op === 'ilike' ? 'ILIKE' : op === 'like' ? 'LIKE' : '=';
            orParts.push(`${quoteIdent(col)} ${opSql} $${params.length}`);
          }
        }
        if (orParts.length) parts.push(`(${orParts.join(' OR ')})`);
      } else {
        params.push(f.value);
        parts.push(`${quoteIdent(f.col)} ${f.op} $${params.length}`);
      }
    }
    return parts.length ? ` WHERE ${parts.join(' AND ')}` : '';
  }

  private buildOrder(): string {
    if (this.orderClauses.length === 0) return '';
    const parts = this.orderClauses.map((o) => {
      const dir = o.asc ? 'ASC' : 'DESC';
      const nulls = o.nullsFirst === true ? ' NULLS FIRST' : o.nullsFirst === false ? ' NULLS LAST' : '';
      return `${quoteIdent(o.col)} ${dir}${nulls}`;
    });
    return ` ORDER BY ${parts.join(', ')}`;
  }

  private buildLimit(): string {
    if (this.rangeFrom !== null && this.rangeTo !== null) {
      const limit = this.rangeTo - this.rangeFrom + 1;
      return ` LIMIT ${limit} OFFSET ${this.rangeFrom}`;
    }
    if (this.limitN !== null) return ` LIMIT ${this.limitN}`;
    return '';
  }

  private buildSelectCols(): string {
    const { baseCols, joins } = this.selectShape;
    if (joins.length === 0) return baseCols;
    // For each join, LEFT JOIN the table and use row_to_json + json_agg.
    // We emit `to_jsonb(j_alias.*) AS alias` so the column comes back as
    // a nested object - matching supabase's .select('parent, child:other(*)') shape.
    const parts = [`${this.table}.${baseCols === '*' ? '*' : baseCols}`];
    for (const j of joins) {
      parts.push(`(SELECT to_jsonb(j) FROM ${quoteIdent(j.table)} j WHERE j.id = ${this.table}.${quoteIdent(j.alias + '_id')}) AS ${quoteIdent(j.alias)}`);
    }
    return parts.join(', ');
  }

  private async execute(): Promise<SbResult<T>> {
    try {
      const pool = getPool();
      const params: unknown[] = [];

      let sql = '';

      if (this.op === 'select') {
        if (this.headOnly && this.countMode) {
          sql = `SELECT COUNT(*)::int AS count FROM ${quoteIdent(this.table)}`;
          sql += this.buildWhere(params);
          const r = await pool.query(sql, params as never[]);
          return {
            data: null as unknown as T,
            error: null,
            count: r.rows[0]?.count ?? 0,
          };
        }
        sql = `SELECT ${this.buildSelectCols()} FROM ${quoteIdent(this.table)}`;
        sql += this.buildWhere(params);
        sql += this.buildOrder();
        sql += this.buildLimit();
      } else if (this.op === 'insert') {
        const rows = Array.isArray(this.writePayload) ? this.writePayload : [this.writePayload!];
        if (rows.length === 0) {
          return { data: [] as unknown as T, error: null };
        }
        const cols = Object.keys(rows[0]);
        const valuesSql: string[] = [];
        for (const r of rows) {
          const placeholders = cols.map((c) => {
            params.push((r as Record<string, unknown>)[c]);
            return `$${params.length}`;
          });
          valuesSql.push(`(${placeholders.join(', ')})`);
        }
        sql = `INSERT INTO ${quoteIdent(this.table)} (${cols.map(quoteIdent).join(', ')}) VALUES ${valuesSql.join(', ')}`;
        if (this.returnInserted) sql += ` RETURNING *`;
      } else if (this.op === 'update') {
        if (!this.updatePatch) throw new Error('update() called with no patch');
        const cols = Object.keys(this.updatePatch);
        const setSql = cols.map((c) => {
          params.push((this.updatePatch as Record<string, unknown>)[c]);
          return `${quoteIdent(c)} = $${params.length}`;
        }).join(', ');
        sql = `UPDATE ${quoteIdent(this.table)} SET ${setSql}`;
        sql += this.buildWhere(params);
        if (this.returnInserted) sql += ` RETURNING *`;
      } else if (this.op === 'upsert') {
        const rows = Array.isArray(this.writePayload) ? this.writePayload : [this.writePayload!];
        if (rows.length === 0) return { data: [] as unknown as T, error: null };
        const cols = Object.keys(rows[0]);
        const valuesSql: string[] = [];
        for (const r of rows) {
          const placeholders = cols.map((c) => {
            params.push((r as Record<string, unknown>)[c]);
            return `$${params.length}`;
          });
          valuesSql.push(`(${placeholders.join(', ')})`);
        }
        sql = `INSERT INTO ${quoteIdent(this.table)} (${cols.map(quoteIdent).join(', ')}) VALUES ${valuesSql.join(', ')}`;
        if (this.upsertOnConflict) {
          const conflictCols = this.upsertOnConflict.split(',').map((s) => quoteIdent(s.trim())).join(', ');
          const updates = cols
            .filter((c) => !this.upsertOnConflict!.split(',').map((s) => s.trim()).includes(c))
            .map((c) => `${quoteIdent(c)} = EXCLUDED.${quoteIdent(c)}`)
            .join(', ');
          sql += ` ON CONFLICT (${conflictCols}) DO ${updates ? `UPDATE SET ${updates}` : 'NOTHING'}`;
        }
        if (this.returnInserted) sql += ` RETURNING *`;
      } else if (this.op === 'delete') {
        sql = `DELETE FROM ${quoteIdent(this.table)}`;
        sql += this.buildWhere(params);
        if (this.returnInserted) sql += ` RETURNING *`;
      }

      const result = await pool.query(sql, params as never[]);
      const rows = result.rows as T[];

      if (this.singleMode === 'single') {
        if (rows.length === 0) {
          return { data: null, error: { message: 'No rows found', code: 'PGRST116' } };
        }
        if (rows.length > 1) {
          return { data: null, error: { message: 'More than one row', code: 'PGRST116' } };
        }
        return { data: rows[0], error: null };
      }
      if (this.singleMode === 'maybe') {
        return { data: (rows[0] ?? null) as T, error: null };
      }

      return {
        data: rows as unknown as T,
        error: null,
        count: this.countMode ? rows.length : undefined,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        data: null,
        error: { message: msg, code: 'PG_ERROR' },
      };
    }
  }
}

/**
 * The shim's facade. Mirrors `supabase.from('x').select(...)` ergonomics.
 *
 * Auth + storage paths are NOT in this shim - those go through the
 * AuthAdminAdapter (lib/adapters/auth) and StorageAdapter
 * (lib/adapters/storage) respectively. Callers that touch
 * `supabase.auth.*` or `supabase.storage.*` need explicit migration.
 */
export class PgShimClient implements DbClient {
  from<T = Record<string, unknown>>(table: string): QueryChain<T> {
    return new QueryBuilder<T>(table);
  }

  // Stub for callers that import supabase.auth on the server. The real
  // session lookup goes through Cognito via AuthAdminAdapter - we throw
  // clearly so missed call sites surface.
  get auth(): never {
    throw new Error(
      'pg-shim does not implement .auth.* - migrate caller to AuthAdminAdapter (lib/adapters/auth)',
    );
  }

  get storage(): SbStorage {
    return new StorageShim();
  }
}

let _shim: PgShimClient | null = null;

export function getPgShim(): PgShimClient {
  if (!_shim) _shim = new PgShimClient();
  return _shim;
}

/**
 * Storage shim that routes Supabase Storage-shaped calls
 * (.from(bucket).upload(), .download(), .createSignedUrl(), .remove())
 * through the StorageAdapter so the underlying impl can be S3 (when
 * ENABLE_AWS_STORAGE=true) or Supabase Storage otherwise.
 *
 * Returns shapes that match supabase-js for drop-in compatibility:
 *   upload          -> { data: { path }, error }
 *   download        -> { data: Blob, error }
 *   createSignedUrl -> { data: { signedUrl }, error }
 *   remove          -> { data: [], error }
 */
class StorageShim implements SbStorage {
  from(bucket: string): SbStorageBucket {
    return new StorageBucketShim(bucket as LogicalBucket);
  }
}

class StorageBucketShim implements SbStorageBucket {
  constructor(private readonly bucket: LogicalBucket) {}

  async upload(
    path: string,
    body: Buffer | Blob | ArrayBuffer | Uint8Array,
    opts?: { contentType?: string; upsert?: boolean },
  ): ReturnType<SbStorageBucket['upload']> {
    const adapter = getStorageAdapter();
    let bytes: Buffer;
    if (Buffer.isBuffer(body)) bytes = body;
    else if (body instanceof Uint8Array) bytes = Buffer.from(body);
    else if (body instanceof ArrayBuffer) bytes = Buffer.from(body);
    else if (typeof Blob !== 'undefined' && body instanceof Blob) {
      bytes = Buffer.from(await body.arrayBuffer());
    } else {
      return { data: null, error: { message: 'Unsupported upload body type' } };
    }
    const r = await adapter.upload(this.bucket, path, bytes, {
      contentType: opts?.contentType ?? 'application/octet-stream',
      upsert: opts?.upsert,
    });
    if (!r.ok) return { data: null, error: { message: r.message } };
    return { data: { path: r.path }, error: null };
  }

  async download(path: string): ReturnType<SbStorageBucket['download']> {
    const adapter = getStorageAdapter();
    const r = await adapter.download(this.bucket, path);
    if (!r.ok) return { data: null, error: { message: r.message } };
    // Return a Blob to match supabase-js. Node 22 has global Blob.
    const blob = new Blob([new Uint8Array(r.bytes)], { type: r.contentType });
    return { data: blob, error: null };
  }

  async createSignedUrl(path: string, ttlSeconds: number): ReturnType<SbStorageBucket['createSignedUrl']> {
    const adapter = getStorageAdapter();
    const r = await adapter.signedUrl(this.bucket, path, ttlSeconds);
    if (!r.ok) return { data: null, error: { message: r.message } };
    return { data: { signedUrl: r.url }, error: null };
  }

  async remove(paths: string[]): ReturnType<SbStorageBucket['remove']> {
    const adapter = getStorageAdapter();
    const errors: string[] = [];
    for (const p of paths) {
      const r = await adapter.remove(this.bucket, p);
      if (!r.ok && r.message) errors.push(r.message);
    }
    if (errors.length) return { data: null, error: { message: errors.join('; ') } };
    return { data: [], error: null };
  }
}

// Type compatibility - the rest of the codebase imports SupabaseClient
// from @supabase/supabase-js. By exporting the same name from here, we
// can swap at the import-line level in lib/supabase.ts.
export type SupabaseClient = PgShimClient;
// Re-export Param to silence unused-import lint
export type { Param };
