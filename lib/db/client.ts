/**
 * Postgres client for VantaUM.
 *
 * Backed by `postgres.js` driver wrapped in Drizzle ORM. Connects to an
 * AWS RDS Postgres instance. Falls back to demo mode (no connection) when
 * env vars are missing, mirroring the existing Supabase server client
 * behavior so tests and demo flows still work.
 *
 * Connection string lives in DATABASE_URL or is assembled from the
 * RDS_* fragments. SSL is required on RDS — `sslmode=require` is enforced.
 */

import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

let _db: PostgresJsDatabase<typeof schema> | null = null;
let _client: ReturnType<typeof postgres> | null = null;

function buildConnectionString(): string | null {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;

  const host = process.env.RDS_HOSTNAME;
  const port = process.env.RDS_PORT || '5432';
  const user = process.env.RDS_USERNAME;
  const pass = process.env.RDS_PASSWORD;
  const db = process.env.RDS_DB_NAME || 'vantaum';
  if (!host || !user || !pass) return null;

  const encodedPass = encodeURIComponent(pass);
  return `postgres://${user}:${encodedPass}@${host}:${port}/${db}?sslmode=require`;
}

/**
 * Returns the Drizzle DB instance, or `null` when the DB is not configured
 * (demo mode). Callers should branch on `null` and substitute stub data.
 */
export function getDb(): PostgresJsDatabase<typeof schema> | null {
  if (_db) return _db;

  const url = buildConnectionString();
  if (!url) return null;

  _client = postgres(url, {
    ssl: 'require',
    max: Number(process.env.RDS_POOL_MAX || 10),
    idle_timeout: 30,
    connect_timeout: 10,
    prepare: false, // PgBouncer-friendly; required if RDS is fronted by RDS Proxy
  });

  _db = drizzle(_client, { schema });
  return _db;
}

/**
 * True when a Postgres connection is configured.
 */
export function hasDbConfig(): boolean {
  return !!buildConnectionString();
}

/**
 * Close the connection pool. Useful for tests and graceful shutdown.
 */
export async function closeDb(): Promise<void> {
  if (_client) {
    await _client.end({ timeout: 5 });
    _client = null;
    _db = null;
  }
}

export { schema };
