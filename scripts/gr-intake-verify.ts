#!/usr/bin/env tsx
/**
 * Canonical Intake Contract — acceptance test (docs/INTAKE_CONTRACT.md §10).
 *
 * Simulates a signed Gravity Rail voice submission end-to-end and reports
 * PASS/FAIL on each link of the chain:
 *
 *   1. signature accepted            (202 on a correctly signed request)
 *   2. tampered signature rejected   (401 signature_invalid)
 *   3. stale timestamp rejected      (401 replay_rejected)
 *   4. case created                  (cases row exists, intake_channel=phone)
 *   5. engine processed              (intake_finalized / brief audit trail)
 *   6. visible in cockpit queue      (active review status or assignment)
 *   7. audit events fired            (case_created_from_voice on the case)
 *   8. idempotent on resend          (409 duplicate, same case_id)
 *
 * This is the acceptance test BOTH sides run — green here = integration done.
 *
 * Usage:
 *   GR_VERIFY_BASE_URL=https://<host> \
 *   GRAVITY_RAIL_WEBHOOK_SECRET=<secret> \
 *   npx tsx scripts/gr-intake-verify.ts
 *
 * Options (env):
 *   GR_VERIFY_BASE_URL   target deployment (default http://localhost:3000)
 *   GR_VERIFY_SANDBOX    send X-GR-Sandbox: true (default "true" — requires
 *                        INTAKE_SANDBOX_ENABLED=true on the target, i.e. the
 *                        MVP environment; set "false" only if you know why)
 *   Database checks (4-7) additionally need the target environment's DB
 *   config in this shell (Supabase keys or ENABLE_AWS_DB + DATABASE_URL).
 *   Without it those links are reported SKIP and the script still exercises
 *   the HTTP contract (1-3, 8).
 */

import { signIntakeRequest, SANDBOX_HEADER, SIGNATURE_HEADER, TIMESTAMP_HEADER, INTAKE_CONTRACT_VERSION } from '../lib/intake/gr-contract';

const BASE_URL = process.env.GR_VERIFY_BASE_URL || 'http://localhost:3000';
const SECRET = process.env.GRAVITY_RAIL_WEBHOOK_SECRET || '';
const SANDBOX = (process.env.GR_VERIFY_SANDBOX ?? 'true').toLowerCase() !== 'false';
const ENDPOINT = `${BASE_URL.replace(/\/$/, '')}/api/intake/voice`;

type LinkStatus = 'PASS' | 'FAIL' | 'SKIP' | 'WARN';
const results: Array<{ link: string; status: LinkStatus; detail: string }> = [];
function record(link: string, status: LinkStatus, detail: string) {
  results.push({ link, status, detail });
  const icon = { PASS: '✅', FAIL: '❌', SKIP: '⏭️ ', WARN: '⚠️ ' }[status];
  console.log(`${icon} ${status.padEnd(4)} ${link} — ${detail}`);
}

function buildPayload(submissionId: string) {
  // Synthetic, clearly-labeled test identity — not a real person.
  return {
    contract_version: INTAKE_CONTRACT_VERSION,
    submission_id: submissionId,
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
      diagnosis_codes: ['M17.11'],
      priority: 'standard' as const,
    },
  };
}

async function post(rawBody: string, headers: Record<string, string>) {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: rawBody,
  });
  let json: Record<string, unknown> = {};
  try {
    json = (await res.json()) as Record<string, unknown>;
  } catch {
    /* non-JSON response — callers assert on status */
  }
  return { status: res.status, json };
}

function signedHeaders(rawBody: string, timestampSeconds?: number): Record<string, string> {
  const { timestamp, signature } = signIntakeRequest(SECRET, rawBody, timestampSeconds);
  const headers: Record<string, string> = {
    [TIMESTAMP_HEADER]: timestamp,
    [SIGNATURE_HEADER]: signature,
  };
  if (SANDBOX) headers[SANDBOX_HEADER] = 'true';
  return headers;
}

async function main() {
  console.log('=== Canonical Intake Contract — acceptance test ===');
  console.log(`target:  ${ENDPOINT}`);
  console.log(`sandbox: ${SANDBOX}`);
  console.log('');

  if (!SECRET) {
    console.error('GRAVITY_RAIL_WEBHOOK_SECRET is required (the target environment\'s secret).');
    process.exit(2);
  }

  const submissionId = `gr-verify-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const payload = buildPayload(submissionId);
  const rawBody = JSON.stringify(payload);

  // ---- Link 1: signature accepted → 202 --------------------------------
  let caseId: string | null = null;
  {
    const { status, json } = await post(rawBody, signedHeaders(rawBody));
    if (status === 202 && json.contract_version === INTAKE_CONTRACT_VERSION) {
      caseId = (json.case_id as string | null) ?? null;
      if (caseId) {
        record('1. signature accepted / 202', 'PASS', `case_id=${caseId} status=${json.status}`);
      } else {
        record('1. signature accepted / 202', 'FAIL', `202 but no case_id (status=${json.status}); expected auto-create — check manual_review_reasons=${JSON.stringify(json.manual_review_reasons)}`);
      }
    } else {
      record('1. signature accepted / 202', 'FAIL', `HTTP ${status}: ${JSON.stringify(json).slice(0, 300)}`);
    }
  }

  // ---- Link 2: tampered body rejected ----------------------------------
  {
    const headers = signedHeaders(rawBody); // signed over the REAL body...
    const tampered = rawBody.replace('27447', '99999'); // ...but we send a different one
    const { status, json } = await post(tampered, headers);
    const code = (json.error as { code?: string } | undefined)?.code;
    if (status === 401 && code === 'signature_invalid') {
      record('2. tampered signature rejected', 'PASS', '401 signature_invalid');
    } else {
      record('2. tampered signature rejected', 'FAIL', `HTTP ${status} code=${code}`);
    }
  }

  // ---- Link 3: stale timestamp rejected --------------------------------
  {
    const stale = Math.floor(Date.now() / 1000) - 3600;
    const { status, json } = await post(rawBody, signedHeaders(rawBody, stale));
    const code = (json.error as { code?: string } | undefined)?.code;
    if (status === 401 && code === 'replay_rejected') {
      record('3. stale timestamp rejected', 'PASS', '401 replay_rejected (1h-old timestamp)');
    } else {
      record('3. stale timestamp rejected', 'FAIL', `HTTP ${status} code=${code}`);
    }
  }

  // ---- Links 4-7 need DB access to the target environment ---------------
  let db: import('../lib/supabase').SupabaseClient | null = null;
  try {
    const { getServiceClient, hasSupabaseConfig } = await import('../lib/supabase');
    if (hasSupabaseConfig()) db = getServiceClient();
  } catch {
    db = null;
  }

  if (!db || !caseId) {
    const why = !caseId ? 'no case_id from link 1' : 'no DB config in this shell';
    record('4. case created (DB)', caseId ? 'SKIP' : 'FAIL', why);
    record('5. engine processed', 'SKIP', why);
    record('6. visible in cockpit queue', 'SKIP', why);
    record('7. audit events fired', 'SKIP', why);
  } else {
    // Link 4: case row exists on the phone channel.
    const { data: caseRow } = await db
      .from('cases')
      .select('id, case_number, status, intake_channel, assigned_lpn_id, assigned_reviewer_id, ai_brief')
      .eq('id', caseId)
      .maybeSingle();
    if (caseRow && caseRow.intake_channel === 'phone') {
      record('4. case created (DB)', 'PASS', `${caseRow.case_number} status=${caseRow.status}`);
    } else {
      record('4. case created (DB)', 'FAIL', caseRow ? `intake_channel=${caseRow.intake_channel}` : 'row not found');
    }

    // Give the (synchronous, but best-effort) finalize chassis a beat.
    await new Promise((r) => setTimeout(r, 1500));

    const { data: auditRows } = await db
      .from('audit_log')
      .select('action')
      .eq('case_id', caseId);
    const actions = new Set((auditRows ?? []).map((r: { action: string }) => r.action));

    // Link 5: engine processed — finalize ran (or brief persisted).
    if (actions.has('intake_finalized') || (caseRow && caseRow.ai_brief)) {
      record('5. engine processed', 'PASS', `audit=${[...actions].filter((a) => a.startsWith('intake_')).join(',') || 'ai_brief present'}`);
    } else {
      record(
        '5. engine processed',
        'WARN',
        'no intake_finalized audit — is ENABLE_CHANNEL_AGNOSTIC_INTAKE=true on the target? (contract allows the flag off; case still valid)',
      );
    }

    // Link 6: cockpit queue visibility — active review status or assignment.
    const { data: fresh } = await db
      .from('cases')
      .select('status, assigned_lpn_id, assigned_reviewer_id')
      .eq('id', caseId)
      .maybeSingle();
    const activeStatuses = ['lpn_review', 'rn_review', 'md_review', 'pend_missing_info'];
    if (fresh && (activeStatuses.includes(fresh.status) || fresh.assigned_lpn_id || fresh.assigned_reviewer_id)) {
      record('6. visible in cockpit queue', 'PASS', `status=${fresh.status} lpn=${fresh.assigned_lpn_id ?? '—'} reviewer=${fresh.assigned_reviewer_id ?? '—'}`);
    } else {
      record(
        '6. visible in cockpit queue',
        'WARN',
        `status=${fresh?.status} with no assignment — expected when routing/finalization is flag-off or no staff pool exists in this environment`,
      );
    }

    // Link 7: audit events fired.
    if (actions.has('case_created_from_voice')) {
      record('7. audit events fired', 'PASS', `case_created_from_voice present (${actions.size} events on case)`);
    } else {
      record('7. audit events fired', 'FAIL', `events on case: ${[...actions].join(', ') || 'none'}`);
    }
  }

  // ---- Link 8: idempotent resend → 409 duplicate, same case_id ----------
  {
    const { status, json } = await post(rawBody, signedHeaders(rawBody));
    const err = json.error as { code?: string; duplicate_kind?: string } | undefined;
    const sameCase = (json.case_id as string | null) === caseId;
    if (status === 409 && err?.code === 'duplicate' && sameCase) {
      record('8. idempotent on resend', 'PASS', `409 duplicate (${err.duplicate_kind}), original case_id returned`);
    } else if (status === 202 && (json as { demo?: boolean }).demo) {
      record('8. idempotent on resend', 'WARN', 'target is in demo mode — idempotency ledger does not persist there');
    } else {
      record('8. idempotent on resend', 'FAIL', `HTTP ${status} code=${err?.code} case_id_match=${sameCase}`);
    }
  }

  // ---- Summary -----------------------------------------------------------
  console.log('\n=== Summary ===');
  const fails = results.filter((r) => r.status === 'FAIL');
  const warns = results.filter((r) => r.status === 'WARN');
  const skips = results.filter((r) => r.status === 'SKIP');
  console.log(`${results.length - fails.length - warns.length - skips.length} PASS, ${fails.length} FAIL, ${warns.length} WARN, ${skips.length} SKIP`);
  if (SANDBOX) {
    console.log('Sandbox artifacts (SBX- case numbers) can be cleaned up by case_number prefix.');
  }
  if (fails.length > 0) {
    console.log('\nRESULT: RED — integration not accepted.');
    process.exit(1);
  }
  console.log(`\nRESULT: GREEN${warns.length ? ' (with warnings)' : ''} — contract verified.`);
}

main().catch((err) => {
  console.error('verify script crashed:', err);
  process.exit(2);
});
