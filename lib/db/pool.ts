// Lazy dynamic import for 'pg' so the bundler never sees the native package
// during `npm run build` on Vercel or in the Docker image unless
// ENABLE_AWS_DB is actually active at runtime.
type PgModule = typeof import('pg');
let _pg: PgModule | null = null;
async function getPgModule() {
  if (!_pg) {
    _pg = await import('pg');
  }
  return _pg;
}

// Structural stand-in was too narrow for `pg.Pool` (and broke the shim's
// `rows[0].count` read). Use the real pg types; the value import stays dynamic.
type Pool = InstanceType<PgModule['Pool']>;
type PoolConfig = ConstructorParameters<PgModule['Pool']>[0];
type QueryResultRow = Record<string, unknown>;

/**
 * Singleton Postgres connection pool for the AWS / RDS path.
 *
 * Reads connection info from env vars in this order:
 *   - DATABASE_URL (plain connection string)
 *   - DB_HOST / DB_PORT / DB_NAME / DB_USER / DB_PASSWORD (individual fields
 *     mounted from Secrets Manager by the Fargate task definition)
 *
 * The pool is lazy-initialized so importing this module doesn't crash
 * the build when env vars aren't set (matches the existing pattern in
 * lib/supabase.ts).
 *
 * SSL: RDS requires SSL by default. We pass `rejectUnauthorized: false`
 * which trusts the cert chain without pinning - good enough for app->RDS
 * inside our VPC. If you tighten this later, copy the RDS CA bundle
 * into the container.
 */

let _pool: Pool | null = null;

export async function getPool(): Promise<Pool> {
  if (_pool) return _pool;

  const mod = await getPgModule();
  const { Pool } = mod;

  const url = process.env.DATABASE_URL;
  const cfg: PoolConfig = url
    ? { connectionString: url, ssl: { rejectUnauthorized: false } }
    : {
        host: process.env.DB_HOST,
        port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 5432,
        database: process.env.DB_NAME,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        ssl: { rejectUnauthorized: false },
      };

  cfg.max = 10;
  cfg.idleTimeoutMillis = 30_000;
  cfg.connectionTimeoutMillis = 5_000;
  cfg.application_name = 'vantaum-app';

  _pool = new Pool(cfg);
  _pool.on('error', (err: unknown) => {
    console.error('[pg.Pool] error:', err);
  });
  return _pool;
}

/**
 * Returns true when enough env is present to actually connect.
 * Mirrors `hasSupabaseConfig` semantics.
 */
export function hasRdsConfig(): boolean {
  return !!(process.env.DATABASE_URL || (process.env.DB_HOST && process.env.DB_PASSWORD));
}

/**
 * Runs a query and returns rows. Convenience wrapper around pool.query.
 * Throws on error - callers handle.
 */
export async function rawQuery<T extends QueryResultRow = QueryResultRow>(
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  const pool = await getPool();
  const result = await pool.query(sql, params);
  return result.rows as T[];
}
