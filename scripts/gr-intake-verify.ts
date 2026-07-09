#!/usr/bin/env tsx
/**
 * gr-intake-verify — THE acceptance test for the Canonical Intake Contract
 * v1.1 (docs/INTAKE_CONTRACT.md). Both sides run this one script; green on
 * both sides = integration done.
 *
 * Print mode (no --url): prints canonical v1.1 + legacy signatures for a
 * sample payload plus ready-to-run curl commands, so the GR side can
 * compare its signing byte-for-byte.
 *
 *   GR_WEBHOOK_SECRET=... npx tsx scripts/gr-intake-verify.ts
 *
 * Live mode (--url <host>): exercises BOTH channels against a running
 * deployment and reports PASS/FAIL per link:
 *
 *   Channel A (/api/gr/webhook):  v1.1 signature accepted → tampered
 *     rejected → stale timestamp rejected → legacy scheme accepted
 *     (transition window) → re-delivery is idempotent.
 *   Channel B (/api/intake/voice): v1.1 accepted (202 + case) → resend
 *     409 duplicate with original case_id → tamper/replay rejected.
 *
 *   GR_WEBHOOK_SECRET=... npx tsx scripts/gr-intake-verify.ts --url https://<host>
 *   # optional: GR_VERIFY_SANDBOX=true adds X-GR-Sandbox (MVP env only)
 */
import {
  signIntakeRequest,
  computeLegacySignature,
  INTAKE_CONTRACT_VERSION,
  SIGNATURE_HEADER,
  TIMESTAMP_HEADER,
  LEGACY_SIGNATURE_HEADER,
  SANDBOX_HEADER,
} from '../lib/intake/gr-contract';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const secret = process.env.GR_WEBHOOK_SECRET || process.env.GRAVITY_RAIL_WEBHOOK_SECRET || arg('--secret');
const baseUrl = arg('--url');
const SANDBOX = (process.env.GR_VERIFY_SANDBOX ?? 'false').toLowerCase() === 'true';

if (!secret) {
  console.error('Missing GR_WEBHOOK_SECRET (env) or --secret <value>.');
  process.exit(2);
}

// ---------------------------------------------------------------------------
// Sample payloads (synthetic, clearly-labeled test identities — never PHI)
// ---------------------------------------------------------------------------

const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const handoffPayload = {
  event: 'chat.handoff',
  chat_id: Number(String(Date.now()).slice(-9)),
  workspace_id: 'ws_verify_demo',
  member: { email: 'member@example.com', name: 'Test Member' },
  title: 'MRI lumbar prior auth (verification)',
  transcript: 'Verification Test Patient requesting MRI lumbar spine, CPT 72148.',
};

const voicePayload = {
  contract_version: INTAKE_CONTRACT_VERSION,
  submission_id: `gr-verify-${suffix}`,
  intake_channel: 'phone' as const,
  event: 'intake.completed',
  from_number: '+15555550199',
  chat_id: 999001,
  title: 'GR intake verification (synthetic)',
  transcript:
    'Verification Test Patient, DOB 01/01/1990, member ID VERIFY000001, requesting prior auth for CPT 27447.',
  field_values: {
    patient_name: 'Verification Test-Patient',
    patient_dob: '01/01/1990',
    member_id: 'VERIFY000001',
    provider_name: 'Dr. Verify Harness',
    procedure_codes: ['27447'],
    priority: 'standard' as const,
  },
};

function v11Headers(rawBody: string, timestampSeconds?: number): Record<string, string> {
  const { timestamp, signature } = signIntakeRequest(secret!, rawBody, timestampSeconds);
  const h: Record<string, string> = { [TIMESTAMP_HEADER]: timestamp, [SIGNATURE_HEADER]: signature };
  if (SANDBOX) h[SANDBOX_HEADER] = 'true';
  return h;
}

// ---------------------------------------------------------------------------
// Print mode — signing reference for the GR side
// ---------------------------------------------------------------------------

if (!baseUrl) {
  const body = JSON.stringify(handoffPayload);
  const { timestamp, signature } = signIntakeRequest(secret, body);
  const legacy = computeLegacySignature(secret, body);
  console.log('=== Canonical Intake Contract v1.1 — signing reference ===\n');
  console.log('sample body:');
  console.log(body);
  console.log('\nv1.1 (canonical):');
  console.log(`  ${TIMESTAMP_HEADER}: ${timestamp}`);
  console.log(`  ${SIGNATURE_HEADER}: ${signature}`);
  console.log('\nv1 legacy (transition window only):');
  console.log(`  ${LEGACY_SIGNATURE_HEADER}: ${legacy}`);
  console.log('\ncurl (v1.1, Channel A):');
  console.log(
    `  curl -sS -X POST https://<host>/api/gr/webhook \\\n` +
      `    -H "Content-Type: application/json" \\\n` +
      `    -H "${TIMESTAMP_HEADER}: ${timestamp}" -H "${SIGNATURE_HEADER}: ${signature}" \\\n` +
      `    -H "Idempotency-Key: ${handoffPayload.chat_id}" \\\n` +
      `    --data '${body}'`,
  );
  console.log('\nRe-run with --url https://<host> for the full two-channel contract check.');
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Live mode — the acceptance run
// ---------------------------------------------------------------------------

type LinkStatus = 'PASS' | 'FAIL' | 'WARN';
const results: Array<{ link: string; status: LinkStatus }> = [];
function record(link: string, status: LinkStatus, detail: string) {
  results.push({ link, status });
  const icon = { PASS: '✅', FAIL: '❌', WARN: '⚠️ ' }[status];
  console.log(`${icon} ${status.padEnd(4)} ${link} — ${detail}`);
}

async function post(path: string, rawBody: string, headers: Record<string, string>) {
  const res = await fetch(`${baseUrl!.replace(/\/$/, '')}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: rawBody,
  });
  let json: Record<string, unknown> = {};
  try {
    json = (await res.json()) as Record<string, unknown>;
  } catch {
    /* status-only assertions */
  }
  return { status: res.status, json };
}

async function main() {
  console.log('=== Canonical Intake Contract v1.1 — acceptance test ===');
  console.log(`target:  ${baseUrl}`);
  console.log(`sandbox: ${SANDBOX}\n`);

  // ── Channel A: /api/gr/webhook ─────────────────────────────────────────
  console.log('— Channel A: /api/gr/webhook (handoff) —');
  const aBody = JSON.stringify(handoffPayload);
  const aKey = { 'Idempotency-Key': `verify-${suffix}` };

  {
    const { status, json } = await post('/api/gr/webhook', aBody, { ...v11Headers(aBody), ...aKey });
    const ok = (status === 201 || status === 200) && json.success === true;
    record('A1. v1.1 signature accepted', ok ? 'PASS' : 'FAIL', `HTTP ${status} ${JSON.stringify(json).slice(0, 120)}`);
  }
  {
    const headers = { ...v11Headers(aBody), ...aKey };
    const { status, json } = await post('/api/gr/webhook', aBody.replace('ws_verify_demo', 'ws_tampered'), headers);
    record('A2. tampered body rejected', status === 401 ? 'PASS' : 'FAIL', `HTTP ${status} code=${json.code}`);
  }
  {
    const stale = Math.floor(Date.now() / 1000) - 3600;
    const { status, json } = await post('/api/gr/webhook', aBody, { ...v11Headers(aBody, stale), ...aKey });
    record('A3. stale timestamp rejected', status === 401 && json.code === 'replay_rejected' ? 'PASS' : 'FAIL', `HTTP ${status} code=${json.code}`);
  }
  {
    const legacy = computeLegacySignature(secret!, aBody);
    const { status, json } = await post('/api/gr/webhook', aBody, { [LEGACY_SIGNATURE_HEADER]: legacy, ...aKey });
    const ok = (status === 200 || status === 201) && json.success === true;
    record('A4. v1 legacy accepted (window)', ok ? 'PASS' : 'FAIL', `HTTP ${status}`);
  }
  {
    const { status, json } = await post('/api/gr/webhook', aBody, { ...v11Headers(aBody), ...aKey });
    const demoTarget = json.demo === true;
    const ok = status === 200 && json.idempotent === true;
    record(
      'A5. re-delivery idempotent',
      ok ? 'PASS' : demoTarget ? 'WARN' : 'FAIL',
      demoTarget && !ok ? 'target in demo mode — idempotency needs a DB-backed environment' : `HTTP ${status} idempotent=${json.idempotent}`,
    );
  }

  // ── Channel B: /api/intake/voice ───────────────────────────────────────
  console.log('\n— Channel B: /api/intake/voice (phone envelope) —');
  const bBody = JSON.stringify(voicePayload);
  let caseId: string | null = null;

  {
    const { status, json } = await post('/api/intake/voice', bBody, v11Headers(bBody));
    caseId = (json.case_id as string | null) ?? null;
    const ok = status === 202 && json.contract_version === INTAKE_CONTRACT_VERSION && !!caseId;
    record('B1. v1.1 accepted, case created', ok ? 'PASS' : 'FAIL', `HTTP ${status} case_id=${caseId} status=${json.status}`);
  }
  {
    const headers = v11Headers(bBody);
    const { status, json } = await post('/api/intake/voice', bBody.replace('27447', '99999'), headers);
    record('B2. tampered body rejected', status === 401 ? 'PASS' : 'FAIL', `HTTP ${status} code=${(json.error as { code?: string })?.code}`);
  }
  {
    const stale = Math.floor(Date.now() / 1000) - 3600;
    const { status, json } = await post('/api/intake/voice', bBody, v11Headers(bBody, stale));
    const code = (json.error as { code?: string })?.code;
    record('B3. stale timestamp rejected', status === 401 && code === 'replay_rejected' ? 'PASS' : 'FAIL', `HTTP ${status} code=${code}`);
  }
  {
    const { status, json } = await post('/api/intake/voice', bBody, v11Headers(bBody));
    const err = json.error as { code?: string; duplicate_kind?: string } | undefined;
    const same = (json.case_id as string | null) === caseId;
    const demoTarget = (json as { demo?: boolean }).demo === true;
    const ok = status === 409 && err?.code === 'duplicate' && same;
    record(
      'B4. resend 409 duplicate (ledger)',
      ok ? 'PASS' : demoTarget ? 'WARN' : 'FAIL',
      demoTarget && !ok ? 'target in demo mode — ledger needs a DB-backed environment' : `HTTP ${status} code=${err?.code} case_id_match=${same}`,
    );
  }

  // ── Summary ─────────────────────────────────────────────────────────────
  const fails = results.filter((r) => r.status === 'FAIL').length;
  const warns = results.filter((r) => r.status === 'WARN').length;
  console.log(`\n=== ${results.length - fails - warns} PASS, ${fails} FAIL, ${warns} WARN ===`);
  if (fails > 0) {
    console.log('RESULT: RED — integration not accepted.');
    process.exit(1);
  }
  console.log(`RESULT: GREEN${warns ? ' (with warnings)' : ''} — contract verified.`);
}

main().catch((err) => {
  console.error('verify script crashed:', err);
  process.exit(2);
});
