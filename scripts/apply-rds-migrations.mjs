#!/usr/bin/env node
/**
 * Apply the RDS / plain-Postgres migration plan.
 *
 * Usage:
 *   node scripts/apply-rds-migrations.mjs              # apply pending
 *   node scripts/apply-rds-migrations.mjs --dry-run    # print plan only
 *   node scripts/apply-rds-migrations.mjs --status     # show applied vs pending
 *
 * Connection (same as lib/db/pool.ts):
 *   DATABASE_URL
 *   or DB_HOST + DB_PORT + DB_NAME + DB_USER + DB_PASSWORD
 *
 * No AWS credentials required. Safe against a local docker Postgres.
 */

import { createHash } from 'crypto';
import { existsSync, readdirSync, readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');

const SUPABASE_ONLY_PREFIXES = new Set(['013']);

function listSql(dir) {
  const out = new Map();
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const match = name.match(/^(\d{3})_.*\.sql$/);
    if (!match) continue;
    out.set(match[1], name);
  }
  return out;
}

function buildPlan() {
  const supabaseDir = join(REPO_ROOT, 'supabase', 'migrations');
  const rdsDir = join(REPO_ROOT, 'infra-aws', 'rds-migrations');
  const supabase = listSql(supabaseDir);
  const rds = listSql(rdsDir);
  const prefixes = [...new Set([...supabase.keys(), ...rds.keys()])].sort();
  const apply = [];
  const skip = [];

  const bootstrapName = '000_rds_bootstrap.sql';
  const bootstrapPath = join(rdsDir, bootstrapName);
  if (existsSync(bootstrapPath)) {
    apply.push({
      id: '000_rds_bootstrap',
      prefix: '000',
      filename: bootstrapName,
      path: bootstrapPath,
      source: 'bootstrap',
    });
  }

  for (const prefix of prefixes) {
    if (SUPABASE_ONLY_PREFIXES.has(prefix)) {
      skip.push({ prefix, filename: supabase.get(prefix) ?? `${prefix}.sql` });
      continue;
    }
    if (rds.has(prefix) && rds.get(prefix) !== bootstrapName) {
      const filename = rds.get(prefix);
      apply.push({
        id: filename.replace(/\.sql$/, ''),
        prefix,
        filename,
        path: join(rdsDir, filename),
        source: 'rds',
      });
      continue;
    }
    if (supabase.has(prefix)) {
      const filename = supabase.get(prefix);
      apply.push({
        id: filename.replace(/\.sql$/, ''),
        prefix,
        filename,
        path: join(supabaseDir, filename),
        source: 'supabase',
      });
    }
  }
  return { apply, skip };
}

function checksum(sql) {
  return createHash('sha256').update(sql, 'utf8').digest('hex');
}

function rewritePolicies(sql) {
  return sql.replace(
    /CREATE\s+POLICY\s+IF\s+NOT\s+EXISTS\s+("?[A-Za-z0-9_]+"?)\s+ON\s+("?[A-Za-z0-9_]+"?)/gi,
    (_m, name, table) =>
      `DROP POLICY IF EXISTS ${name} ON ${table};\nCREATE POLICY ${name} ON ${table}`,
  );
}

function connectionConfig() {
  if (process.env.DATABASE_URL) {
    return { connectionString: process.env.DATABASE_URL, ssl: sslOpt() };
  }
  if (process.env.DB_HOST && process.env.DB_PASSWORD) {
    return {
      host: process.env.DB_HOST,
      port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 5432,
      database: process.env.DB_NAME || 'vantaum',
      user: process.env.DB_USER || 'vantaum_admin',
      password: process.env.DB_PASSWORD,
      ssl: sslOpt(),
    };
  }
  return null;
}

function sslOpt() {
  if (process.env.DATABASE_SSL === 'disable') return false;
  if (process.env.DB_HOST === 'localhost' || process.env.DB_HOST === '127.0.0.1') return false;
  if (process.env.DATABASE_URL && /localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL)) return false;
  return { rejectUnauthorized: false };
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const dryRun = args.has('--dry-run');
  const statusOnly = args.has('--status');
  const plan = buildPlan();

  console.log(`RDS migration plan: ${plan.apply.length} apply, ${plan.skip.length} skip`);
  for (const e of plan.apply) {
    console.log(`  [${e.source}] ${e.filename}`);
  }
  for (const e of plan.skip) {
    console.log(`  [skip] ${e.filename} (Supabase Storage — use S3)`);
  }

  if (dryRun) {
    console.log('\nDry run. No connection opened.');
    return;
  }

  const cfg = connectionConfig();
  if (!cfg) {
    console.error(
      'No database connection. Set DATABASE_URL or DB_HOST+DB_PASSWORD.\n' +
        'Local: docker compose -f docker-compose.postgres.yml up -d\n' +
        '  DATABASE_URL=postgres://vantaum:localdev@127.0.0.1:5432/vantaum DATABASE_SSL=disable',
    );
    process.exit(2);
  }

  const client = new pg.Client(cfg);
  await client.connect();
  try {
    await client.query('SELECT 1');

    // Bootstrap creates schema_migrations; if we're mid-ledger, the table exists.
    let applied = new Set();
    const table = await client.query(
      `SELECT to_regclass('public.schema_migrations') AS t`,
    );
    if (table.rows[0]?.t) {
      const rows = await client.query('SELECT id FROM schema_migrations');
      applied = new Set(rows.rows.map((r) => r.id));
    }

    if (statusOnly) {
      for (const e of plan.apply) {
        console.log(`  ${applied.has(e.id) ? 'applied' : 'pending'}  ${e.id}`);
      }
      return;
    }

    let ran = 0;
    for (const e of plan.apply) {
      if (applied.has(e.id)) {
        console.log(`  skip (already applied) ${e.id}`);
        continue;
      }
      const raw = readFileSync(e.path, 'utf8');
      const sql = rewritePolicies(raw);
      const sum = checksum(raw);
      console.log(`  applying ${e.id} ...`);
      await client.query('BEGIN');
      try {
        await client.query(sql);
        // schema_migrations exists after bootstrap; subsequent files record here.
        await client.query(
          `INSERT INTO schema_migrations (id, source, checksum)
           VALUES ($1, $2, $3)
           ON CONFLICT (id) DO NOTHING`,
          [e.id, e.source, sum],
        );
        await client.query('COMMIT');
        ran += 1;
        console.log(`  ok ${e.id}`);
      } catch (err) {
        await client.query('ROLLBACK');
        console.error(`  FAILED ${e.id}: ${err.message}`);
        process.exitCode = 1;
        return;
      }
    }
    console.log(`Done. Applied ${ran} migration(s).`);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
