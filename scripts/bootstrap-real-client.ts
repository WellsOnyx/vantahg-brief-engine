#!/usr/bin/env tsx
/**
 * VantaUM Real-Client Bootstrap
 *
 * One-command setup for the FIRST real customer (a TPA / health plan / etc.)
 * plus a minimal reviewer roster (1 LPN, 1 RN, 1 MD) so that the full intake
 * → brief → review → determination flow has somewhere to land.
 *
 * Idempotent: re-running with the same --client-name only inserts what's
 * missing. Safe to run repeatedly during early onboarding.
 *
 * Usage:
 *   npx tsx scripts/bootstrap-real-client.ts \
 *     --client-name "Acme TPA" \
 *     --client-type tpa \
 *     --contact-email ops@acme.example \
 *     --lpn-name "Pat LPN" --lpn-email pat@vantaum.example \
 *     --rn-name "Sam RN"   --rn-email sam@vantaum.example \
 *     --md-name "Dr. Jamie Smith" --md-email jamie@vantaum.example \
 *     --md-specialty "Internal Medicine"
 *
 *   Add --dry-run to print what would be created without writing.
 *
 * Required env vars:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from '@supabase/supabase-js';

// ── Args ─────────────────────────────────────────────────────────────────

interface Args {
  clientName?: string;
  clientType: 'tpa' | 'health_plan' | 'self_funded_employer' | 'managed_care_org' | 'workers_comp' | 'auto_med';
  contactEmail?: string;
  lpnName?: string;
  lpnEmail?: string;
  rnName?: string;
  rnEmail?: string;
  mdName?: string;
  mdEmail?: string;
  mdSpecialty?: string;
  dryRun: boolean;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { clientType: 'tpa', dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = (): string => {
      const v = argv[i + 1];
      if (v === undefined) throw new Error(`Missing value for ${a}`);
      i += 1;
      return v;
    };
    switch (a) {
      case '--client-name': args.clientName = next(); break;
      case '--client-type': args.clientType = next() as Args['clientType']; break;
      case '--contact-email': args.contactEmail = next(); break;
      case '--lpn-name': args.lpnName = next(); break;
      case '--lpn-email': args.lpnEmail = next(); break;
      case '--rn-name': args.rnName = next(); break;
      case '--rn-email': args.rnEmail = next(); break;
      case '--md-name': args.mdName = next(); break;
      case '--md-email': args.mdEmail = next(); break;
      case '--md-specialty': args.mdSpecialty = next(); break;
      case '--dry-run': args.dryRun = true; break;
      case '--help':
      case '-h':
        printHelpAndExit(0); break;
      default:
        console.error(`Unknown arg: ${a}`);
        printHelpAndExit(1);
    }
  }
  return args;
}

function printHelpAndExit(code: number): never {
  console.log(`
bootstrap-real-client — one-command first-customer setup

Required:
  --client-name <name>      TPA or payer name (e.g. "Acme TPA")
  --contact-email <email>   Primary contact at the client

Reviewer roster (at least one of LPN/RN/MD must be provided):
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
`);
  process.exit(code);
}

// ── Validation ───────────────────────────────────────────────────────────

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) {
    console.error(`Missing env var: ${name}.`);
    console.error('This script needs Supabase server-side credentials. Set both:');
    console.error('  NEXT_PUBLIC_SUPABASE_URL=https://<your-project>.supabase.co');
    console.error('  SUPABASE_SERVICE_ROLE_KEY=<service role key, NOT the anon key>');
    process.exit(2);
  }
  return v;
}

function validateArgs(args: Args): void {
  if (!args.clientName) {
    console.error('Missing --client-name');
    printHelpAndExit(1);
  }
  if (!args.contactEmail) {
    console.error('Missing --contact-email');
    printHelpAndExit(1);
  }
  const hasAnyReviewer =
    (args.lpnName && args.lpnEmail) ||
    (args.rnName && args.rnEmail) ||
    (args.mdName && args.mdEmail);
  if (!hasAnyReviewer) {
    console.error('At least one reviewer (LPN, RN, or MD) must be provided.');
    printHelpAndExit(1);
  }
}

// ── Main ─────────────────────────────────────────────────────────────────

async function main() {
  const args = parseArgs(process.argv.slice(2));
  validateArgs(args);

  const supabaseUrl = requireEnv('NEXT_PUBLIC_SUPABASE_URL');
  const serviceKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  console.log(`\n● Connecting to Supabase: ${maskUrl(supabaseUrl)}`);

  // Verify connectivity first — a failed SELECT here gives a much clearer
  // error than failing on the first INSERT below.
  const { error: pingError } = await supabase
    .from('clients')
    .select('id', { count: 'exact', head: true });
  if (pingError) {
    console.error('\n✗ Supabase reachable but query failed:');
    console.error(`  ${pingError.message}`);
    console.error('  Check that the service role key matches the project URL and that');
    console.error('  the schema migrations have been applied (clients/reviewers tables).');
    process.exit(3);
  }

  // ── 1. Client ──────────────────────────────────────────────────────
  console.log(`\n● Client: ${args.clientName}`);

  const { data: existingClient } = await supabase
    .from('clients')
    .select('*')
    .eq('name', args.clientName!)
    .maybeSingle();

  let clientId: string;
  if (existingClient) {
    console.log(`  → Already exists (id: ${existingClient.id}). Skipping insert.`);
    clientId = existingClient.id as string;
  } else if (args.dryRun) {
    console.log('  → [dry-run] Would create.');
    clientId = '<dry-run-client-id>';
  } else {
    const { data, error } = await supabase
      .from('clients')
      .insert({
        name: args.clientName,
        type: args.clientType,
        contact_email: args.contactEmail,
        uses_interqual: false,
        uses_mcg: false,
        contracted_sla_hours: 48,
      })
      .select('id')
      .single();
    if (error || !data) {
      console.error(`  ✗ Failed to create client: ${error?.message ?? 'unknown error'}`);
      process.exit(4);
    }
    clientId = data.id as string;
    console.log(`  → Created (id: ${clientId}).`);
  }

  // ── 2. Reviewers ───────────────────────────────────────────────────
  const reviewersToCreate: Array<{
    name: string;
    email: string;
    credentials: string;
    role: 'lpn' | 'rn' | 'md';
    specialty?: string;
  }> = [];

  if (args.lpnName && args.lpnEmail) {
    reviewersToCreate.push({
      name: args.lpnName,
      email: args.lpnEmail,
      credentials: 'LPN',
      role: 'lpn',
    });
  }
  if (args.rnName && args.rnEmail) {
    reviewersToCreate.push({
      name: args.rnName,
      email: args.rnEmail,
      credentials: 'RN',
      role: 'rn',
    });
  }
  if (args.mdName && args.mdEmail) {
    reviewersToCreate.push({
      name: args.mdName,
      email: args.mdEmail,
      credentials: 'MD',
      role: 'md',
      specialty: args.mdSpecialty,
    });
  }

  console.log(`\n● Reviewers (${reviewersToCreate.length}):`);

  for (const r of reviewersToCreate) {
    const { data: existing } = await supabase
      .from('reviewers')
      .select('id')
      .eq('name', r.name)
      .maybeSingle();
    if (existing) {
      console.log(`  → ${r.name} (${r.credentials}) already exists (id: ${existing.id}). Skipping.`);
      continue;
    }
    if (args.dryRun) {
      console.log(`  → [dry-run] Would create ${r.name} (${r.credentials}).`);
      continue;
    }
    const { data, error } = await supabase
      .from('reviewers')
      .insert({
        name: r.name,
        credentials: r.credentials,
        specialty: r.specialty ?? null,
        max_cases_per_day: 25,
      })
      .select('id')
      .single();
    if (error || !data) {
      console.error(`  ✗ Failed to create reviewer ${r.name}: ${error?.message ?? 'unknown error'}`);
      process.exit(5);
    }
    console.log(`  → Created ${r.name} (${r.credentials}) — id: ${data.id}`);
  }

  // ── Done ───────────────────────────────────────────────────────────
  console.log(`
✓ Bootstrap complete.

Next steps:
  1. Sign in at /signin and assign the 'admin' role to your operator user.
  2. Visit /admin/usage to confirm "Real mode — all required components ready".
  3. Submit a test case (portal, API, email, or eFax) and watch /cases.
`);
}

function maskUrl(url: string): string {
  // Shows host without leaking the full project ref into logs.
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.host}`;
  } catch {
    return '<invalid URL>';
  }
}

main().catch((err: unknown) => {
  console.error('\nbootstrap-real-client failed:');
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
