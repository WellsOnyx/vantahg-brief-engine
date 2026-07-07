/**
 * gr-intake-verify — verify a Gravity Rail integration against the Canonical
 * Intake Contract (docs/INTAKE_CONTRACT.md).
 *
 *   GR_WEBHOOK_SECRET=... npx tsx scripts/gr-intake-verify.ts
 *       → prints the canonical HMAC signature for a sample payload + a ready curl.
 *
 *   GR_WEBHOOK_SECRET=... npx tsx scripts/gr-intake-verify.ts --url <endpoint>
 *       → live check: valid sig → 2xx, tampered → 401, replay → idempotent 200,
 *         missing idempotency key → 400. Exits non-zero on any failure.
 *
 * The signature is HMAC-SHA256(rawBody, secret) as lowercase hex — identical to
 * the server's lib/webhook-verify.ts. Compare your GR-side signature to the one
 * printed here for the same body; if they match, your signing is correct.
 */
import crypto from 'node:crypto';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const secret = process.env.GR_WEBHOOK_SECRET || arg('--secret');
const url = arg('--url');

if (!secret) {
  console.error('Missing GR_WEBHOOK_SECRET (env) or --secret <value>.');
  process.exit(2);
}

function sign(body: string): string {
  return crypto.createHmac('sha256', secret!).update(body).digest('hex');
}

const samplePayload = {
  event: 'chat.handoff',
  chat_id: 990001,
  workspace_id: 'ws_verify_demo',
  member: { email: 'member@example.com', name: 'Test Member' },
  title: 'MRI lumbar prior auth',
  field_values: { procedure_description: 'MRI lumbar 72148' },
};
const body = JSON.stringify(samplePayload);
const signature = sign(body);

console.log('── Canonical signature ─────────────────────────────────────────');
console.log('body:      ', body);
console.log('signature: ', signature);
console.log('\ncurl:');
console.log(
  [
    `curl -sS -X POST ${url || 'https://app.vantaum.com/api/gr/webhook'}`,
    `  -H "Content-Type: application/json"`,
    `  -H "X-Webhook-Signature: ${signature}"`,
    `  -H "Idempotency-Key: ${samplePayload.chat_id}"`,
    `  --data '${body}'`,
  ].join(' \\\n'),
);

// Round-trip sanity: recomputing must match (guards against local drift).
if (sign(body) !== signature) {
  console.error('\n[FAIL] local signature is not deterministic');
  process.exit(1);
}

if (!url) {
  console.log('\n(No --url given. Signature check only. Add --url <endpoint> for the live contract check.)');
  process.exit(0);
}

// ── Live contract check ────────────────────────────────────────────────────
type Check = { name: string; ok: boolean; detail: string };

async function post(rawBody: string, headers: Record<string, string>) {
  const res = await fetch(url!, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: rawBody,
  });
  let json: any = null;
  try {
    json = await res.json();
  } catch {
    /* non-json */
  }
  return { status: res.status, json };
}

async function run() {
  const checks: Check[] = [];
  const idem = String(samplePayload.chat_id);

  // 1) Valid signature → 2xx
  const valid = await post(body, { 'X-Webhook-Signature': signature, 'Idempotency-Key': idem });
  const demo = valid.json?.demo === true;
  checks.push({
    name: 'valid signature accepted (2xx)',
    ok: valid.status >= 200 && valid.status < 300,
    detail: `status ${valid.status}${demo ? ' (server in DEMO mode)' : ''}`,
  });

  // 2) Replay same key → idempotent 200 (only meaningful with a real DB)
  const replay = await post(body, { 'X-Webhook-Signature': signature, 'Idempotency-Key': idem });
  checks.push({
    name: 'replay is idempotent (200, idempotent:true)',
    ok: demo ? true : replay.status === 200 && replay.json?.idempotent === true,
    detail: demo ? 'skipped — server in demo mode (no persistence)' : `status ${replay.status}, idempotent=${replay.json?.idempotent}`,
  });

  // 3) Tampered signature → 401
  const tampered = await post(body, { 'X-Webhook-Signature': signature.slice(0, -1) + '0', 'Idempotency-Key': idem });
  checks.push({
    name: 'tampered signature rejected (401)',
    ok: tampered.status === 401,
    detail: `status ${tampered.status}`,
  });

  // 4) Missing idempotency key → 400
  const { chat_id, ...noChat } = samplePayload;
  const noKeyBody = JSON.stringify(noChat);
  const noKey = await post(noKeyBody, { 'X-Webhook-Signature': sign(noKeyBody) });
  checks.push({
    name: 'missing idempotency key rejected (400)',
    ok: noKey.status === 400,
    detail: `status ${noKey.status}`,
  });

  console.log('\n── Live contract check ─────────────────────────────────────────');
  let failed = 0;
  for (const c of checks) {
    console.log(`${c.ok ? 'PASS' : 'FAIL'}  ${c.name}  —  ${c.detail}`);
    if (!c.ok) failed++;
  }
  console.log(failed === 0 ? '\n✓ Contract verified.' : `\n✗ ${failed} check(s) failed.`);
  process.exit(failed === 0 ? 0 : 1);
}

run().catch((err) => {
  console.error('verify error:', err);
  process.exit(1);
});
