#!/usr/bin/env tsx
/**
 * VantaUM Real-Client Bootstrap
 *
 * One-command setup for the FIRST real customer (a TPA / health plan / etc.)
 * plus a minimal reviewer roster (1 LPN, 1 RN, 1 MD) so that the full intake
 * → brief → review → determination flow has somewhere to land.
 *
 * Idempotent: re-running with the same client name or reviewer name/email
 * only inserts what's missing.
 *
 * RDS / plain Postgres (does not use Supabase JS or Auth admin):
 *   ENABLE_AWS_DB=true DATABASE_URL=postgres://... \
 *     npx tsx scripts/bootstrap-real-client.ts \
 *     --client-name "Acme TPA" \
 *     --contact-email ops@acme.example \
 *     --lpn-name "Pat LPN" --lpn-email pat@vantaum.example \
 *     --rn-name "Sam RN" --rn-email sam@vantaum.example \
 *     --md-name "Dr. Jamie Smith" --md-email jamie@vantaum.example \
 *     --md-specialty "Internal Medicine"
 *
 *   Local docker: add DATABASE_SSL=disable (or use a localhost URL).
 *   Schema first: npm run db:migrate:rds
 *
 * Leftover Supabase (only when ENABLE_AWS_DB is not true):
 *   NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL) + SUPABASE_SERVICE_ROLE_KEY
 *
 * Unset keys are filled from .env.local when that file exists.
 * Add --dry-run to avoid writes. With no database env, --dry-run prints
 * the plan and does not open a connection.
 */

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { applyEnvFile } from '@/lib/bootstrap/env-file';
import {
  BootstrapUsageError,
  BootstrapWriteError,
  bootstrapRealClient,
  formatRealClientPlan,
  parseRealClientArgs,
} from '@/lib/bootstrap/real-client';
import {
  BootstrapConfigError,
  describeDbTarget,
  openBootstrapDb,
  resolveBootstrapDb,
} from '@/lib/bootstrap/target';

function printHelp(): void {
  console.log(`
bootstrap-real-client — one-command first-customer setup

Required:
  --client-name <name>      TPA or payer name (e.g. "Acme TPA")
  --contact-email <email>   Primary contact at the client

Reviewer roster (at least one of LPN/RN/MD; name and email together):
  --lpn-name <name>         Optional LPN reviewer
  --lpn-email <email>
  --rn-name <name>          Optional RN reviewer
  --rn-email <email>
  --md-name <name>          Optional MD reviewer
  --md-email <email>
  --md-specialty <spec>     E.g. "Internal Medicine"

Optional:
  --client-type <type>      tpa (default) | health_plan | self_funded_employer | managed_care_org | workers_comp | auto_med
  --dry-run                 Show planned operations without writing

Database:
  ENABLE_AWS_DB=true + DATABASE_URL (or DB_HOST + DB_PASSWORD)
    pg shim against RDS / plain Postgres. Supabase keys are not required.
  ENABLE_AWS_DB unset or false
    leftover Supabase JS client (service role key, not the anon key).
`);
}

function loadLocalEnv(): void {
  const path = join(process.cwd(), '.env.local');
  if (!existsSync(path)) return;
  const applied = applyEnvFile(readFileSync(path, 'utf8'));
  if (applied.length > 0) {
    console.log(`Loaded ${applied.length} unset keys from .env.local (existing environment wins).`);
  }
}

async function main(): Promise<void> {
  loadLocalEnv();

  let args;
  try {
    args = parseRealClientArgs(process.argv.slice(2));
  } catch (err) {
    if (err instanceof BootstrapUsageError && err.message === 'help') {
      printHelp();
      process.exit(0);
    }
    console.error(err instanceof Error ? err.message : String(err));
    printHelp();
    process.exit(1);
  }

  const resolved = resolveBootstrapDb();
  if (!resolved.ok) {
    if (args.dryRun) {
      console.log(resolved.message);
      console.log('');
      for (const line of formatRealClientPlan(args)) console.log(line);
      return;
    }
    console.error(resolved.message);
    process.exit(resolved.exitCode);
  }

  console.log(`\n● ${resolved.summary}`);
  console.log(`● Target: ${describeDbTarget()}`);

  const opened = await openBootstrapDb();
  const result = await bootstrapRealClient(opened.client, args);

  console.log(`\n● Client: ${result.client.name}`);
  if (result.client.action === 'skipped_existing') {
    console.log(`  → Already exists (id: ${result.client.id}). Skipping insert.`);
  } else if (result.client.action === 'would_create') {
    console.log('  → [dry-run] Would create.');
  } else {
    console.log(`  → Created (id: ${result.client.id}).`);
  }

  console.log(`\n● Reviewers (${result.reviewers.length}):`);
  for (const reviewer of result.reviewers) {
    if (reviewer.action === 'skipped_existing') {
      console.log(`  → ${reviewer.name} (${reviewer.credentials}) already exists (id: ${reviewer.id}). Skipping.`);
    } else if (reviewer.action === 'would_create') {
      console.log(`  → [dry-run] Would create ${reviewer.name} (${reviewer.credentials}).`);
    } else {
      console.log(`  → Created ${reviewer.name} (${reviewer.credentials}) — id: ${reviewer.id}`);
    }
  }

  if (args.dryRun) {
    console.log('\n[dry-run] No rows written.');
    return;
  }

  console.log(`
✓ Bootstrap complete.

Next steps:
  1. Sign in at /signin and assign the 'admin' role to your operator user.
  2. Visit /admin/usage to confirm the database backend (rds when ENABLE_AWS_DB=true).
  3. Submit a test case (portal, API, email, or eFax) and watch /cases.
`);
}

main().catch((err: unknown) => {
  if (err instanceof BootstrapConfigError || err instanceof BootstrapWriteError) {
    console.error(`\nbootstrap-real-client failed:\n${err.message}`);
    process.exit(err.exitCode);
  }
  console.error('\nbootstrap-real-client failed:');
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
