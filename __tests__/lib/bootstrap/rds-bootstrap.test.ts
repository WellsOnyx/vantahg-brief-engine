import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DbClient, SbResult } from '@/lib/db/types';
import { applyEnvFile } from '@/lib/bootstrap/env-file';
import { masterAdminBlockReason } from '@/lib/bootstrap/master-admin';
import {
  BootstrapUsageError,
  BootstrapWriteError,
  bootstrapRealClient,
  formatRealClientPlan,
  parseRealClientArgs,
  type RealClientArgs,
} from '@/lib/bootstrap/real-client';
import { describeDbTarget, resolveBootstrapDb } from '@/lib/bootstrap/target';
import { DEMO_SEED_PLAN, applyDemoSeed, formatDemoSeedDryRun } from '@/scripts/seed-demo';

const { createClient, shimClient } = vi.hoisted(() => ({
  createClient: vi.fn(() => ({ marker: 'supabase-js' })),
  shimClient: { marker: 'pg-shim' },
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: (...args: unknown[]) => createClient(...args),
}));

vi.mock('@/lib/db/supabase-shim', () => ({
  getPgShim: () => shimClient,
}));

afterEach(() => {
  vi.unstubAllEnvs();
  createClient.mockClear();
});

const SAMPLE_ARGV = [
  '--client-name', 'Acme TPA',
  '--client-type', 'tpa',
  '--contact-email', 'ops@acme.example',
  '--lpn-name', 'Pat LPN',
  '--lpn-email', 'pat@vantaum.example',
  '--rn-name', 'Sam RN',
  '--rn-email', 'sam@vantaum.example',
  '--md-name', 'Dr. Jamie Smith',
  '--md-email', 'jamie@vantaum.example',
  '--md-specialty', 'Internal Medicine',
];

function sampleArgs(extra: Partial<RealClientArgs> = {}): RealClientArgs {
  return { ...parseRealClientArgs(SAMPLE_ARGV), ...extra };
}

type Row = Record<string, unknown>;

function memoryDb(initial: Record<string, Row[]> = {}) {
  const tables: Record<string, Row[]> = {
    clients: [...(initial.clients ?? [])],
    reviewers: [...(initial.reviewers ?? [])],
    cases: [...(initial.cases ?? [])],
    efax_queue: [...(initial.efax_queue ?? [])],
    audit_log: [...(initial.audit_log ?? [])],
  };
  let seq = 1;
  const inserts: Array<{ table: string; row: Row }> = [];

  const client = {
    from(table: string) {
      const state: {
        op: 'select' | 'insert' | 'upsert';
        filters: Array<[string, unknown]>;
        payload: Row | Row[] | null;
        onConflict: string | null;
        ignoreDuplicates: boolean;
        mode: 'many' | 'single' | 'maybe';
        head: boolean;
      } = {
        op: 'select',
        filters: [],
        payload: null,
        onConflict: null,
        ignoreDuplicates: false,
        mode: 'many',
        head: false,
      };

      const chain = {
        select(_cols?: string, opts?: { head?: boolean; count?: string }) {
          if (state.op === 'select') state.op = 'select';
          if (opts?.head) state.head = true;
          return chain;
        },
        insert(payload: Row | Row[]) {
          state.op = 'insert';
          state.payload = payload;
          return chain;
        },
        upsert(payload: Row | Row[], opts?: { onConflict?: string; ignoreDuplicates?: boolean }) {
          state.op = 'upsert';
          state.payload = payload;
          state.onConflict = opts?.onConflict ?? null;
          state.ignoreDuplicates = opts?.ignoreDuplicates === true;
          return chain;
        },
        update() { return chain; },
        delete() { return chain; },
        eq(col: string, val: unknown) {
          state.filters.push([col, val]);
          return chain;
        },
        neq() { return chain; },
        gt() { return chain; },
        gte() { return chain; },
        lt() { return chain; },
        lte() { return chain; },
        in() { return chain; },
        ilike() { return chain; },
        like() { return chain; },
        is() { return chain; },
        or() { return chain; },
        order() { return chain; },
        limit() { return chain; },
        range() { return chain; },
        single() { state.mode = 'single'; return chain; },
        maybeSingle() { state.mode = 'maybe'; return chain; },
        then<TResult1 = SbResult, TResult2 = never>(
          onfulfilled?: ((value: SbResult) => TResult1 | PromiseLike<TResult1>) | null,
          onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
        ) {
          return Promise.resolve(run()).then(onfulfilled, onrejected);
        },
      };

      function rows(): Row[] {
        if (!tables[table]) tables[table] = [];
        return tables[table];
      }

      function run(): SbResult {
        if (state.head) {
          return { data: null, error: null, count: rows().length };
        }
        if (state.op === 'select') {
          const found = rows().filter((row) => state.filters.every(([col, val]) => row[col] === val));
          if (state.mode === 'maybe' || state.mode === 'single') {
            return {
              data: found[0] ?? null,
              error: state.mode === 'single' && found.length !== 1
                ? { message: 'row count', code: 'PGRST116' }
                : null,
            };
          }
          return { data: found, error: null };
        }
        const incoming = Array.isArray(state.payload) ? state.payload : [state.payload ?? {}];
        if (state.op === 'insert') {
          const stored = incoming.map((row) => {
            const copy = { id: `gen-${seq++}`, ...row };
            rows().push(copy);
            inserts.push({ table, row: copy });
            return copy;
          });
          if (state.mode === 'single') return { data: stored[0] ?? null, error: null };
          return { data: stored, error: null };
        }
        const key = state.onConflict ?? 'id';
        for (const row of incoming) {
          const idx = rows().findIndex((existing) => existing[key] === row[key]);
          if (idx >= 0) {
            if (!state.ignoreDuplicates) rows()[idx] = { ...rows()[idx], ...row };
            continue;
          }
          const copy = { ...row };
          rows().push(copy);
          inserts.push({ table, row: copy });
        }
        return { data: incoming, error: null };
      }

      return chain;
    },
  };

  return { tables, inserts, client: client as unknown as DbClient };
}

describe('bootstrap database target', () => {
  it('selects the pg shim when ENABLE_AWS_DB is true and does not require Supabase keys', async () => {
    vi.stubEnv('ENABLE_AWS_DB', 'true');
    vi.stubEnv('DATABASE_URL', 'postgres://dbuser:secret-value@db.example:5432/vantaum');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
    vi.stubEnv('SUPABASE_URL', '');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '');
    vi.stubEnv('DB_HOST', '');
    vi.stubEnv('DB_PASSWORD', '');

    const resolved = resolveBootstrapDb();
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;
    expect(resolved.kind).toBe('rds');
    expect(resolved.summary).toMatch(/pg shim/);
    expect(resolved.summary).toMatch(/Supabase JS is not used/);

    const label = describeDbTarget();
    expect(label).toBe('postgres://db.example:5432/vantaum');
    expect(label).not.toContain('secret-value');
    expect(label).not.toContain('dbuser');

    const { openBootstrapDb } = await import('@/lib/bootstrap/target');
    const opened = await openBootstrapDb();
    expect(opened.kind).toBe('rds');
    expect(opened.client).toBe(shimClient);
    expect(createClient).not.toHaveBeenCalled();
  });

  it('keeps the Supabase JS client when ENABLE_AWS_DB is not true', async () => {
    vi.stubEnv('ENABLE_AWS_DB', 'false');
    vi.stubEnv('DATABASE_URL', '');
    vi.stubEnv('DB_HOST', '');
    vi.stubEnv('DB_PASSWORD', '');
    vi.stubEnv('SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-role-test');

    const resolved = resolveBootstrapDb();
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;
    expect(resolved.kind).toBe('supabase');

    const { openBootstrapDb } = await import('@/lib/bootstrap/target');
    const opened = await openBootstrapDb();
    expect(opened.kind).toBe('supabase');
    expect(createClient).toHaveBeenCalledWith(
      'https://example.supabase.co',
      'service-role-test',
      { auth: { autoRefreshToken: false, persistSession: false } },
    );
  });

  it('refuses the RDS path when the flag is on but no connection is configured', () => {
    vi.stubEnv('ENABLE_AWS_DB', 'true');
    vi.stubEnv('DATABASE_URL', '');
    vi.stubEnv('DB_HOST', '');
    vi.stubEnv('DB_PASSWORD', '');
    vi.stubEnv('SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-role-test');

    const resolved = resolveBootstrapDb();
    expect(resolved.ok).toBe(false);
    if (resolved.ok) return;
    expect(resolved.message).toMatch(/DATABASE_URL/);
    expect(resolved.message).toMatch(/does not use Supabase URL keys/);
    expect(resolved.exitCode).toBe(2);
  });
});

describe('bootstrap-real-client', () => {
  it('parses the first client and LPN/RN/MD roster', () => {
    const args = parseRealClientArgs(SAMPLE_ARGV);
    expect(args.clientName).toBe('Acme TPA');
    expect(args.clientType).toBe('tpa');
    expect(args.reviewers.map((r) => r.role)).toEqual(['lpn', 'rn', 'md']);
    expect(args.reviewers.map((r) => r.credentials)).toEqual(['LPN', 'RN', 'MD']);
    expect(args.dryRun).toBe(false);
  });

  it('rejects a roster with no reviewer and a bad client type', () => {
    expect(() => parseRealClientArgs([
      '--client-name', 'Acme TPA',
      '--contact-email', 'ops@acme.example',
    ])).toThrow(BootstrapUsageError);
    expect(() => parseRealClientArgs([
      ...SAMPLE_ARGV.slice(0, 2),
      '--client-type', 'not_a_type',
      ...SAMPLE_ARGV.slice(2),
    ])).toThrow(/client-type/);
  });

  it('dry-run plan writes nothing and does not include a database password', () => {
    const lines = formatRealClientPlan(sampleArgs({ dryRun: true }));
    expect(lines.join('\n')).toMatch(/Acme TPA/);
    expect(lines.join('\n')).toMatch(/Pat LPN/);
    expect(lines.at(-1)).toMatch(/No rows written/);
    expect(lines.join('\n')).not.toMatch(/secret-value|SERVICE_ROLE|postgres:\/\//);
  });

  it('creates the client and roster, then skips them on a second run', async () => {
    const db = memoryDb();
    const first = await bootstrapRealClient(db.client, sampleArgs());
    expect(first.client.action).toBe('created');
    expect(first.reviewers.every((r) => r.action === 'created')).toBe(true);
    expect(db.tables.clients).toHaveLength(1);
    expect(db.tables.reviewers).toHaveLength(3);
    expect(db.inserts.map((op) => op.table)).toEqual(['clients', 'reviewers', 'reviewers', 'reviewers']);
    expect(db.inserts[1].row).toMatchObject({
      name: 'Pat LPN',
      email: 'pat@vantaum.example',
      credentials: 'LPN',
      max_cases_per_day: 25,
      status: 'active',
    });
    const md = db.inserts.find((op) => op.row.credentials === 'MD');
    expect(md?.row.specialty).toBe('Internal Medicine');

    const second = await bootstrapRealClient(db.client, sampleArgs());
    expect(second.client.action).toBe('skipped_existing');
    expect(second.client.id).toBe(first.client.id);
    expect(second.reviewers.every((r) => r.action === 'skipped_existing')).toBe(true);
    expect(db.tables.clients).toHaveLength(1);
    expect(db.tables.reviewers).toHaveLength(3);
    expect(db.inserts).toHaveLength(4);
  });

  it('dry-run against a database does not insert', async () => {
    const db = memoryDb();
    const result = await bootstrapRealClient(db.client, sampleArgs({ dryRun: true }));
    expect(result.client.action).toBe('would_create');
    expect(result.reviewers.every((r) => r.action === 'would_create')).toBe(true);
    expect(db.inserts).toHaveLength(0);
    expect(db.tables.clients).toHaveLength(0);
  });

  it('treats an existing reviewer email as already bootstrapped', async () => {
    const db = memoryDb({
      reviewers: [{ id: 'rev-1', name: 'Someone Else', email: 'pat@vantaum.example' }],
    });
    const result = await bootstrapRealClient(db.client, sampleArgs());
    const lpn = result.reviewers.find((r) => r.role === 'lpn');
    expect(lpn?.action).toBe('skipped_existing');
    expect(lpn?.id).toBe('rev-1');
    expect(db.tables.reviewers.filter((r) => r.email === 'pat@vantaum.example')).toHaveLength(1);
  });

  it('reports a schema ping failure without writing', async () => {
    const db = memoryDb();
    const original = db.client.from.bind(db.client);
    db.client.from = ((table: string) => {
      const chain = original(table);
      if (table === 'clients') {
        const select = chain.select.bind(chain);
        chain.select = ((cols?: string, opts?: { head?: boolean }) => {
          const next = select(cols, opts);
          if (opts?.head) {
            return {
              ...next,
              then: (onfulfilled?: (value: SbResult) => unknown) =>
                Promise.resolve({ data: null, error: { message: 'relation "clients" does not exist' } }).then(onfulfilled),
            };
          }
          return next;
        }) as typeof chain.select;
      }
      return chain;
    }) as DbClient['from'];

    await expect(bootstrapRealClient(db.client, sampleArgs())).rejects.toBeInstanceOf(BootstrapWriteError);
    expect(db.inserts).toHaveLength(0);
  });
});

describe('seed-demo RDS path', () => {
  it('dry-run lists synthetic tables and does not claim a connection', () => {
    const lines = formatDemoSeedDryRun();
    expect(lines.join('\n')).toMatch(/reviewers: 3/);
    expect(lines.join('\n')).toMatch(/cases: 10/);
    expect(lines.join('\n')).toMatch(/DO NOTHING/);
    expect(lines.at(-1)).toMatch(/No connection opened/);
    expect(DEMO_SEED_PLAN.reduce((n, step) => n + step.rows, 0)).toBe(24);
  });

  it('upserts stable ids and does not duplicate them on a second run', async () => {
    const db = memoryDb();
    await applyDemoSeed(db.client);
    expect(db.tables.reviewers).toHaveLength(3);
    expect(db.tables.clients).toHaveLength(2);
    expect(db.tables.cases).toHaveLength(10);
    expect(db.tables.efax_queue).toHaveLength(4);
    expect(db.tables.audit_log).toHaveLength(5);
    const reviewerIds = db.tables.reviewers.map((row) => row.id).sort();

    await applyDemoSeed(db.client);
    expect(db.tables.reviewers.map((row) => row.id).sort()).toEqual(reviewerIds);
    expect(db.tables.clients).toHaveLength(2);
    expect(db.tables.cases).toHaveLength(10);
    expect(db.tables.efax_queue).toHaveLength(4);
    expect(db.tables.audit_log).toHaveLength(10);
  });
});

describe('master-admin hybrid gate', () => {
  it('refuses to run auth.admin when ENABLE_AWS_DB is true', () => {
    const reason = masterAdminBlockReason({
      ENABLE_AWS_DB: 'true',
      DATABASE_URL: 'postgres://db.example:5432/vantaum',
    });
    expect(reason).toMatch(/auth\.admin/);
    expect(reason).toMatch(/pg shim/);
    expect(reason).toMatch(/will not turn on ENABLE_AWS_AUTH/);
    expect(reason).toMatch(/bootstrap-real-client/);
  });

  it('allows the hybrid path only when Supabase URL and service role are set', () => {
    expect(masterAdminBlockReason({ ENABLE_AWS_DB: 'false' })).toMatch(/SUPABASE_SERVICE_ROLE_KEY/);
    expect(masterAdminBlockReason({
      ENABLE_AWS_DB: 'false',
      NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'service-role-test',
    })).toBeNull();
  });
});

describe('env file loader', () => {
  it('fills unset keys and does not override or echo values', () => {
    const env: NodeJS.ProcessEnv = { ENABLE_AWS_DB: 'true' };
    const applied = applyEnvFile([
      '# comment',
      'ENABLE_AWS_DB=false',
      'DATABASE_URL=postgres://dbuser:secret-value@db.example:5432/vantaum',
      'QUOTED="hello"',
      'not a line',
    ].join('\n'), env);
    expect(env.ENABLE_AWS_DB).toBe('true');
    expect(env.DATABASE_URL).toContain('secret-value');
    expect(env.QUOTED).toBe('hello');
    expect(applied).toEqual(['DATABASE_URL', 'QUOTED']);
    expect(applied.join(' ')).not.toContain('secret-value');
  });
});
