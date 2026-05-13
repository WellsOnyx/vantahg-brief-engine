import { describe, it, expect } from 'vitest';
import { PgShimClient } from '@/lib/db/supabase-shim';

/**
 * SQL-generation smoke tests for the shim.
 *
 * We can't hit RDS in unit tests, so we monkey-patch the pool to capture
 * the generated SQL + params, then assert the shape. This catches the
 * common "did the query I built look right" bugs without needing a live DB.
 */

// Mock the pool module so QueryBuilder.execute() captures instead of running.
const captured: Array<{ sql: string; params: unknown[] }> = [];
let mockRows: unknown[] = [];

vi.mock('@/lib/db/pool', () => ({
  getPool: () => ({
    query: async (sql: string, params: unknown[]) => {
      captured.push({ sql, params });
      return { rows: mockRows };
    },
  }),
}));

function clearCaptures() {
  captured.length = 0;
  mockRows = [];
}

describe('PgShimClient query generation', () => {
  it('builds a basic SELECT *', async () => {
    clearCaptures();
    const c = new PgShimClient();
    await c.from('cases').select('*');
    expect(captured[0].sql).toBe('SELECT * FROM "cases"');
    expect(captured[0].params).toEqual([]);
  });

  it('applies an eq filter with a parameter', async () => {
    clearCaptures();
    mockRows = [{ id: '1' }];
    const c = new PgShimClient();
    const { data } = await c.from('cases').select('*').eq('status', 'lpn_review').single();
    expect(captured[0].sql).toBe('SELECT * FROM "cases" WHERE "status" = $1');
    expect(captured[0].params).toEqual(['lpn_review']);
    expect(data).toEqual({ id: '1' });
  });

  it('chains multiple filters with AND', async () => {
    clearCaptures();
    const c = new PgShimClient();
    await c.from('cases').select('*').eq('status', 'lpn_review').gte('created_at', '2026-01-01');
    expect(captured[0].sql).toContain('"status" = $1 AND "created_at" >= $2');
    expect(captured[0].params).toEqual(['lpn_review', '2026-01-01']);
  });

  it('handles ORDER BY with ascending false', async () => {
    clearCaptures();
    const c = new PgShimClient();
    await c.from('cases').select('*').order('created_at', { ascending: false });
    expect(captured[0].sql).toContain('ORDER BY "created_at" DESC');
  });

  it('handles LIMIT', async () => {
    clearCaptures();
    const c = new PgShimClient();
    await c.from('cases').select('*').limit(10);
    expect(captured[0].sql).toContain('LIMIT 10');
  });

  it('range maps to LIMIT + OFFSET', async () => {
    clearCaptures();
    const c = new PgShimClient();
    await c.from('cases').select('*').range(10, 19);
    expect(captured[0].sql).toContain('LIMIT 10 OFFSET 10');
  });

  it('count head:true returns a count, no data', async () => {
    clearCaptures();
    mockRows = [{ count: 42 }];
    const c = new PgShimClient();
    const result = await c.from('cases').select('id', { count: 'exact', head: true });
    expect(captured[0].sql).toContain('SELECT COUNT(*)::int AS count FROM "cases"');
    expect(result.count).toBe(42);
    expect(result.data).toBeNull();
  });

  it('single() with 0 rows returns PGRST116 error', async () => {
    clearCaptures();
    mockRows = [];
    const c = new PgShimClient();
    const result = await c.from('cases').select('*').eq('id', 'nope').single();
    expect(result.data).toBeNull();
    expect(result.error?.code).toBe('PGRST116');
  });

  it('maybeSingle() with 0 rows returns null without error', async () => {
    clearCaptures();
    mockRows = [];
    const c = new PgShimClient();
    const result = await c.from('cases').select('*').eq('id', 'nope').maybeSingle();
    expect(result.data).toBeNull();
    expect(result.error).toBeNull();
  });

  it('INSERT with .select() emits RETURNING', async () => {
    clearCaptures();
    mockRows = [{ id: 'new-1', name: 'X' }];
    const c = new PgShimClient();
    const result = await c.from('clients').insert({ name: 'X', contact_email: 'x@y.test' }).select('*').single();
    expect(captured[0].sql).toMatch(/^INSERT INTO "clients" \("name", "contact_email"\) VALUES \(\$1, \$2\) RETURNING \*$/);
    expect(captured[0].params).toEqual(['X', 'x@y.test']);
    expect(result.data).toEqual({ id: 'new-1', name: 'X' });
  });

  it('UPDATE with WHERE', async () => {
    clearCaptures();
    const c = new PgShimClient();
    await c.from('cases').update({ status: 'signed' }).eq('id', 'c1');
    expect(captured[0].sql).toBe('UPDATE "cases" SET "status" = $1 WHERE "id" = $2');
    expect(captured[0].params).toEqual(['signed', 'c1']);
  });

  it('DELETE with WHERE', async () => {
    clearCaptures();
    const c = new PgShimClient();
    await c.from('cases').delete().eq('id', 'c1');
    expect(captured[0].sql).toBe('DELETE FROM "cases" WHERE "id" = $1');
    expect(captured[0].params).toEqual(['c1']);
  });

  it('IN with non-empty array', async () => {
    clearCaptures();
    const c = new PgShimClient();
    await c.from('cases').select('*').in('status', ['lpn_review', 'rn_review', 'md_review']);
    expect(captured[0].sql).toContain('"status" IN ($1, $2, $3)');
    expect(captured[0].params).toEqual(['lpn_review', 'rn_review', 'md_review']);
  });

  it('IN with empty array becomes FALSE', async () => {
    clearCaptures();
    const c = new PgShimClient();
    await c.from('cases').select('*').in('status', []);
    expect(captured[0].sql).toContain('FALSE');
  });

  it('IS NULL', async () => {
    clearCaptures();
    const c = new PgShimClient();
    await c.from('cases').select('*').is('client_id', null);
    expect(captured[0].sql).toContain('"client_id" IS NULL');
  });

  it('ILIKE', async () => {
    clearCaptures();
    const c = new PgShimClient();
    await c.from('cases').select('*').ilike('case_number', 'VUM-2026-%');
    expect(captured[0].sql).toContain('"case_number" ILIKE $1');
    expect(captured[0].params).toEqual(['VUM-2026-%']);
  });

  it('upsert with onConflict', async () => {
    clearCaptures();
    const c = new PgShimClient();
    await c.from('clients').upsert({ id: 'c1', name: 'X' }, { onConflict: 'id' });
    expect(captured[0].sql).toContain('ON CONFLICT ("id") DO UPDATE SET "name" = EXCLUDED."name"');
  });

  it('throws helpful error on .auth access', () => {
    const c = new PgShimClient();
    expect(() => c.auth).toThrow(/AuthAdminAdapter/);
  });

  it('throws helpful error on .storage access', () => {
    const c = new PgShimClient();
    expect(() => c.storage).toThrow(/StorageAdapter/);
  });
});
