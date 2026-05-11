#!/usr/bin/env tsx
/**
 * VantaUM Master Admin Bootstrap
 *
 * Creates the FIRST admin user via Supabase Auth admin API + flips their
 * user_profiles role to 'admin'. Without this, the very first user has
 * to sign up via /signup (which creates them as 'reviewer'), and someone
 * else has to manually flip the role via SQL.
 *
 * Idempotent: if a user with the given email already exists, only the
 * role is updated. Re-running with the same flags will not error.
 *
 * Usage:
 *   npx tsx scripts/bootstrap-master-admin.ts \
 *     --email founder@example.com \
 *     --name "Founder Name" \
 *     --password 'SetAGoodOne!'
 *
 *   # OR — send a magic-link invitation instead of setting a password:
 *   npx tsx scripts/bootstrap-master-admin.ts \
 *     --email founder@example.com \
 *     --name "Founder Name" \
 *     --magic-link
 *
 *   # Preview without writing:
 *   #   --dry-run
 *
 * Required env vars:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY  (NOT the anon key — admin API requires
 *                               service role)
 */

import { createClient, type User } from '@supabase/supabase-js';

// ── CLI args ─────────────────────────────────────────────────────────────

interface Args {
  email?: string;
  name?: string;
  password?: string;
  magicLink: boolean;
  dryRun: boolean;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { magicLink: false, dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = (): string => {
      const v = argv[i + 1];
      if (v === undefined) throw new Error(`Missing value for ${a}`);
      i += 1;
      return v;
    };
    switch (a) {
      case '--email':       args.email = next(); break;
      case '--name':        args.name = next(); break;
      case '--password':    args.password = next(); break;
      case '--magic-link':  args.magicLink = true; break;
      case '--dry-run':     args.dryRun = true; break;
      case '--help':
      case '-h':
        printHelpAndExit(0);
        break;
      default:
        console.error(`Unknown arg: ${a}`);
        printHelpAndExit(1);
    }
  }
  return args;
}

function printHelpAndExit(code: number): never {
  console.log(`
bootstrap-master-admin — create the first VantaUM admin user

Required:
  --email <email>       Email address for the admin account
  --name <name>         Display name

One of:
  --password <pw>       Set a password; user can sign in immediately
  --magic-link          Send a Supabase OTP email; user clicks the link to sign in

Optional:
  --dry-run             Preview the operations without writing
`);
  process.exit(code);
}

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) {
    console.error(`\n✗ Missing env var: ${name}`);
    console.error('  This script requires Supabase admin credentials:');
    console.error('    NEXT_PUBLIC_SUPABASE_URL=https://<project>.supabase.co');
    console.error('    SUPABASE_SERVICE_ROLE_KEY=<service role key — NOT anon key>');
    process.exit(2);
  }
  return v;
}

function validate(args: Args): void {
  if (!args.email || !args.email.includes('@')) {
    console.error('Missing or invalid --email');
    printHelpAndExit(1);
  }
  if (!args.name || args.name.trim().length === 0) {
    console.error('Missing --name');
    printHelpAndExit(1);
  }
  if (!args.password && !args.magicLink) {
    console.error('Must provide either --password <pw> or --magic-link');
    printHelpAndExit(1);
  }
  if (args.password && args.magicLink) {
    console.error('Specify only one of --password or --magic-link');
    printHelpAndExit(1);
  }
}

// ── Main ─────────────────────────────────────────────────────────────────

async function main() {
  const args = parseArgs(process.argv.slice(2));
  validate(args);

  const supabaseUrl = requireEnv('NEXT_PUBLIC_SUPABASE_URL');
  const serviceKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const email = args.email!.toLowerCase().trim();
  const name = args.name!.trim();

  console.log(`\n● Connecting to Supabase: ${maskUrl(supabaseUrl)}`);

  // Verify connectivity + that user_profiles exists.
  const { error: pingErr } = await supabase
    .from('user_profiles')
    .select('id', { count: 'exact', head: true });
  if (pingErr) {
    console.error(`\n✗ user_profiles table unreachable: ${pingErr.message}`);
    console.error('  Apply the migrations under supabase/migrations/ before running this script.');
    process.exit(3);
  }

  // ── Step 1: find or create the auth user ────────────────────────────
  console.log(`\n● Step 1/2: provision auth user ${email}`);

  let user: User | null = null;
  const { data: existing } = await supabase.auth.admin.listUsers();
  user = existing?.users?.find((u) => u.email?.toLowerCase() === email) ?? null;

  if (user) {
    console.log(`  → User already exists (id: ${user.id}). Skipping create.`);
  } else if (args.dryRun) {
    console.log(`  → [dry-run] Would create user ${email} (${args.magicLink ? 'magic link' : 'password'}).`);
  } else {
    if (args.magicLink) {
      // Invitation via Supabase OTP — sends an email with a magic link.
      const { data, error } = await supabase.auth.admin.inviteUserByEmail(email, {
        data: { name },
      });
      if (error || !data?.user) {
        console.error(`  ✗ Invite failed: ${error?.message ?? 'unknown'}`);
        console.error('  Common cause: Supabase project SMTP not configured. Use --password instead to bypass email.');
        process.exit(4);
      }
      user = data.user;
      console.log(`  → Invitation sent. User signs in via the magic link in their email.`);
    } else {
      // Password path — user can sign in immediately with the given password.
      const { data, error } = await supabase.auth.admin.createUser({
        email,
        password: args.password!,
        email_confirm: true,
        user_metadata: { name },
      });
      if (error || !data?.user) {
        console.error(`  ✗ Create failed: ${error?.message ?? 'unknown'}`);
        process.exit(4);
      }
      user = data.user;
      console.log(`  → Created with password. User can sign in at /login now.`);
    }
  }

  // ── Step 2: promote to admin in user_profiles ────────────────────────
  console.log(`\n● Step 2/2: promote ${email} to role='admin'`);

  if (args.dryRun) {
    console.log('  → [dry-run] Would set user_profiles.role = admin.');
    console.log(`\n✓ Dry run complete. No changes written.`);
    return;
  }

  if (!user) {
    console.error('  ✗ No user object available (unexpected).');
    process.exit(5);
  }

  // The handle_new_user trigger (migration 001) auto-inserts a profile
  // row with the default role. We update it. If for some reason the row
  // is missing (e.g. invited but trigger didn't fire), upsert it.
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('id, role')
    .eq('id', user.id)
    .maybeSingle();

  if (profile) {
    if (profile.role === 'admin') {
      console.log(`  → Already admin. No change.`);
    } else {
      const { error: updateErr } = await supabase
        .from('user_profiles')
        .update({ role: 'admin', name })
        .eq('id', user.id);
      if (updateErr) {
        console.error(`  ✗ Role update failed: ${updateErr.message}`);
        process.exit(6);
      }
      console.log(`  → Updated from '${profile.role}' to 'admin'.`);
    }
  } else {
    const { error: insertErr } = await supabase
      .from('user_profiles')
      .insert({ id: user.id, role: 'admin', name });
    if (insertErr) {
      console.error(`  ✗ Profile insert failed: ${insertErr.message}`);
      process.exit(6);
    }
    console.log(`  → Inserted profile with role='admin'.`);
  }

  console.log(`
✓ Master admin ready.
   email:   ${email}
   user_id: ${user.id}
   role:    admin
   sign in: ${args.magicLink ? 'click the magic link in your email' : `/login with the password you provided`}

Next steps:
  1. Sign in at /login as ${email}
  2. Visit /admin/usage and confirm "Real mode — all required components ready"
  3. From /team, invite or promote other VantaUM staff (builder/ceo/practice-lead/slt/reviewer)
  4. From /clients, onboard your first TPA (or use scripts/bootstrap-real-client.ts)
`);
}

function maskUrl(url: string): string {
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.host}`;
  } catch {
    return '<invalid URL>';
  }
}

main().catch((err: unknown) => {
  console.error('\nbootstrap-master-admin failed:');
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
