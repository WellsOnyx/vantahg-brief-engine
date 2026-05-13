/**
 * RDS shim end-to-end validation.
 *
 * Self-contained Node script that exercises real CRUD against RDS using
 * the same patterns lib/db/supabase-shim.ts generates. We don't import
 * the shim itself (TS, would need transpilation) - we mirror the SQL
 * patterns so a successful run proves the queries the shim emits will
 * work against the live database.
 *
 * Designed to run on the SSM bastion (where the env vars come from the
 * RDS secret + DATABASE_URL is composed inline). Exit 0 on full pass.
 */

import pg from 'pg';

const pool = new pg.Pool({
  host: process.env.PGHOST,
  port: Number(process.env.PGPORT ?? 5432),
  database: process.env.PGDATABASE,
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  ssl: { rejectUnauthorized: false },
});

const checks = [];
function check(name, fn) { checks.push({ name, fn }); }

check('SELECT 1 round-trip', async () => {
  const r = await pool.query('SELECT 1 AS one');
  if (r.rows[0].one !== 1) throw new Error('unexpected');
});

check('clients table exists and is queryable', async () => {
  await pool.query('SELECT id, name FROM "clients" LIMIT 1');
});

check('cases table exists and is queryable', async () => {
  await pool.query('SELECT id, status FROM "cases" LIMIT 1');
});

check('parameterized eq filter (shim style)', async () => {
  await pool.query('SELECT * FROM "cases" WHERE "status" = $1 LIMIT 1', ['lpn_review']);
});

check('IN with multiple values', async () => {
  await pool.query(
    'SELECT * FROM "cases" WHERE "status" IN ($1, $2, $3) LIMIT 1',
    ['lpn_review', 'rn_review', 'md_review'],
  );
});

check('COUNT head:true pattern', async () => {
  const r = await pool.query('SELECT COUNT(*)::int AS count FROM "cases"');
  if (typeof r.rows[0].count !== 'number') throw new Error('count not numeric');
});

check('INSERT-RETURNING pattern (signup_requests)', async () => {
  // Create a synthetic test row so we don't depend on fixture data.
  const r = await pool.query(
    `INSERT INTO "signup_requests" ("legal_name", "primary_contact_name", "primary_contact_email")
     VALUES ($1, $2, $3) RETURNING id, legal_name`,
    ['__shim_validation_test__', 'Validator', 'validator@vantaum.test'],
  );
  if (!r.rows[0]?.id) throw new Error('no id returned');
  // Clean up.
  await pool.query('DELETE FROM "signup_requests" WHERE id = $1', [r.rows[0].id]);
});

check('UPDATE-WHERE pattern', async () => {
  // Insert + update + delete dance so we exercise the path without
  // touching any real data.
  const ins = await pool.query(
    `INSERT INTO "signup_requests" ("legal_name", "primary_contact_name", "primary_contact_email", "status")
     VALUES ($1, $2, $3, $4) RETURNING id`,
    ['__shim_update_test__', 'V', 'v@t.test', 'pending_review'],
  );
  const id = ins.rows[0].id;
  await pool.query(`UPDATE "signup_requests" SET "status" = $1 WHERE "id" = $2`, ['rejected', id]);
  const verify = await pool.query(`SELECT status FROM "signup_requests" WHERE id = $1`, [id]);
  if (verify.rows[0].status !== 'rejected') throw new Error('update did not stick');
  await pool.query(`DELETE FROM "signup_requests" WHERE id = $1`, [id]);
});

check('JSON subquery join pattern (cases <- clients)', async () => {
  // Mirrors the shim's nested-select compilation.
  await pool.query(`
    SELECT "cases".*,
      (SELECT to_jsonb(j) FROM "clients" j WHERE j.id = "cases"."client_id") AS "client"
    FROM "cases" LIMIT 1
  `);
});

check('ORDER BY with NULLS LAST', async () => {
  await pool.query(`SELECT id FROM "cases" ORDER BY "turnaround_deadline" ASC NULLS LAST LIMIT 5`);
});

check('contracts table has hellosign column', async () => {
  await pool.query(`SELECT id, hellosign_signature_request_id FROM "contracts" LIMIT 1`);
});

check('user_profiles + get_user_role function exists', async () => {
  await pool.query(`SELECT get_user_role() AS role`);
});

check('concierges + assignment tables exist', async () => {
  await pool.query(`SELECT id, weekly_auth_cap FROM "concierges" LIMIT 1`);
  await pool.query(`SELECT id FROM "client_concierge_assignments" LIMIT 1`);
});

check('invoices table exists', async () => {
  await pool.query(`SELECT id, invoice_number FROM "invoices" LIMIT 1`);
});

let passes = 0;
let fails = 0;
for (const { name, fn } of checks) {
  try {
    await fn();
    console.log(`  PASS  ${name}`);
    passes++;
  } catch (err) {
    console.log(`  FAIL  ${name}`);
    console.log(`        ${err instanceof Error ? err.message : String(err)}`);
    fails++;
  }
}

console.log('');
console.log(`Summary: ${passes} passed, ${fails} failed (${checks.length} total)`);
await pool.end();
process.exit(fails === 0 ? 0 : 1);
