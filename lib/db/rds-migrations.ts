import { createHash } from 'crypto';
import { existsSync, readdirSync, readFileSync } from 'fs';
import { join } from 'path';

/**
 * RDS / plain-Postgres migration catalog.
 *
 * Prefers an RDS-flavored file in infra-aws/rds-migrations/ when one
 * exists for the same numeric prefix. Falls back to supabase/migrations/
 * for portable SQL. Skips Supabase-only artifacts (storage.buckets).
 *
 * The runner (scripts/apply-rds-migrations.mjs) applies this plan against
 * DATABASE_URL / DB_* and records rows in schema_migrations.
 */

export interface MigrationEntry {
  /** Numeric prefix, zero-padded, e.g. "000" or "019". */
  prefix: string;
  /** Filename stem without directory, e.g. "019_practices.sql". */
  filename: string;
  /** Absolute path to the SQL file. */
  path: string;
  /** Where the file lives. */
  source: 'rds' | 'supabase' | 'bootstrap';
  /** Why this file was chosen / skipped. */
  reason: string;
}

export interface MigrationPlan {
  apply: MigrationEntry[];
  skip: Array<MigrationEntry & { skipReason: string }>;
}

const SUPABASE_ONLY_PREFIXES = new Set([
  // Inserts into storage.buckets — S3 is provisioned by StorageStack.
  '013',
]);

function listSql(dir: string): Map<string, string> {
  const out = new Map<string, string>();
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const match = name.match(/^(\d{3})_.*\.sql$/);
    if (!match) continue;
    out.set(match[1], name);
  }
  return out;
}

export function resolveRepoRoot(from = process.cwd()): string {
  if (existsSync(join(from, 'supabase', 'migrations')) && existsSync(join(from, 'infra-aws'))) {
    return from;
  }
  const parent = join(from, '..');
  if (parent !== from && existsSync(join(parent, 'supabase', 'migrations'))) {
    return parent;
  }
  return from;
}

export function buildMigrationPlan(repoRoot = resolveRepoRoot()): MigrationPlan {
  const supabaseDir = join(repoRoot, 'supabase', 'migrations');
  const rdsDir = join(repoRoot, 'infra-aws', 'rds-migrations');
  const supabase = listSql(supabaseDir);
  const rds = listSql(rdsDir);

  const prefixes = new Set<string>([...supabase.keys(), ...rds.keys()]);
  const sorted = [...prefixes].sort();

  const apply: MigrationEntry[] = [];
  const skip: Array<MigrationEntry & { skipReason: string }> = [];

  const bootstrapName = '000_rds_bootstrap.sql';
  const bootstrapPath = join(rdsDir, bootstrapName);
  if (existsSync(bootstrapPath)) {
    apply.push({
      prefix: '000',
      filename: bootstrapName,
      path: bootstrapPath,
      source: 'bootstrap',
      reason: 'Auth-compat schema + schema_migrations ledger for plain Postgres',
    });
  }

  for (const prefix of sorted) {
    if (prefix === '000' && rds.get('000') === bootstrapName) {
      // Already queued as bootstrap. If supabase also has 000_initial_schema,
      // keep that as a separate apply after bootstrap.
    }

    if (SUPABASE_ONLY_PREFIXES.has(prefix)) {
      const filename = supabase.get(prefix) ?? rds.get(prefix) ?? `${prefix}_skipped.sql`;
      const path = supabase.has(prefix)
        ? join(supabaseDir, filename)
        : join(rdsDir, filename);
      skip.push({
        prefix,
        filename,
        path,
        source: 'supabase',
        reason: 'Supabase Storage artifact',
        skipReason: 'storage.buckets does not exist on RDS; S3 is provisioned by StorageStack',
      });
      continue;
    }

    if (rds.has(prefix) && rds.get(prefix) !== bootstrapName) {
      const filename = rds.get(prefix)!;
      apply.push({
        prefix,
        filename,
        path: join(rdsDir, filename),
        source: 'rds',
        reason: 'RDS-flavored variant (auth.users / RLS rewritten)',
      });
      continue;
    }

    if (supabase.has(prefix)) {
      const filename = supabase.get(prefix)!;
      apply.push({
        prefix,
        filename,
        path: join(supabaseDir, filename),
        source: 'supabase',
        reason: 'Portable SQL — no RDS override needed',
      });
    }
  }

  return { apply, skip };
}

export function checksumSql(sql: string): string {
  return createHash('sha256').update(sql, 'utf8').digest('hex');
}

export function readMigrationSql(entry: MigrationEntry): { sql: string; checksum: string } {
  const sql = readFileSync(entry.path, 'utf8');
  return { sql, checksum: checksumSql(sql) };
}

/**
 * Rewrites `CREATE POLICY IF NOT EXISTS name ON table` — invalid on
 * Postgres 15 — into DROP + CREATE. Used only as a safety net when a
 * leftover supabase file is applied without an RDS variant.
 */
export function rewriteCreatePolicyIfNotExists(sql: string): string {
  return sql.replace(
    /CREATE\s+POLICY\s+IF\s+NOT\s+EXISTS\s+("?[A-Za-z0-9_]+"?)\s+ON\s+("?[A-Za-z0-9_]+"?)/gi,
    (_m, name: string, table: string) =>
      `DROP POLICY IF EXISTS ${name} ON ${table};\nCREATE POLICY ${name} ON ${table}`,
  );
}

export function formatPlan(plan: MigrationPlan): string {
  const lines = [
    'RDS migration plan',
    `  apply: ${plan.apply.length}  skip: ${plan.skip.length}`,
    '',
  ];
  for (const e of plan.apply) {
    lines.push(`  [${e.source.padEnd(9)}] ${e.filename}  — ${e.reason}`);
  }
  if (plan.skip.length) {
    lines.push('', '  skipped:');
    for (const e of plan.skip) {
      lines.push(`    ${e.filename}  — ${e.skipReason}`);
    }
  }
  return lines.join('\n');
}
