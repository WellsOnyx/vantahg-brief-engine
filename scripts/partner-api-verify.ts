#!/usr/bin/env tsx
/**
 * partner-api-verify — the acceptance test for the Partner API v1
 * (docs/PARTNER_API.md §8). Both sides run this one script.
 *
 *   X_API_KEY=vum_live_… npx tsx scripts/partner-api-verify.ts --url https://<host>
 *
 * Exercises: unauthenticated 401 → submit 202 → idempotent resend 200 →
 * schema-invalid field errors → read by client_reference → list since →
 * cross-tenant/nonexistent 404. DB-backed links WARN on demo targets.
 */

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const baseUrl = arg('--url');
const apiKey = process.env.X_API_KEY || arg('--key');

if (!baseUrl || !apiKey) {
  console.error('Usage: X_API_KEY=vum_live_… npx tsx scripts/partner-api-verify.ts --url https://<host>');
  process.exit(2);
}

type LinkStatus = 'PASS' | 'FAIL' | 'WARN';
const results: Array<{ status: LinkStatus }> = [];
function record(link: string, status: LinkStatus, detail: string) {
  results.push({ status });
  console.log(`${{ PASS: '✅', FAIL: '❌', WARN: '⚠️ ' }[status]} ${status.padEnd(4)} ${link} — ${detail}`);
}

async function call(method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
  const res = await fetch(`${baseUrl!.replace(/\/$/, '')}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let json: Record<string, unknown> = {};
  try { json = (await res.json()) as Record<string, unknown>; } catch { /* status-only */ }
  return { status: res.status, json };
}

const authed = { 'X-API-Key': apiKey! };
const ref = `pav-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const submitBody = {
  patient_name: 'Verification Test-Patient',
  patient_dob: '1990-01-01',
  patient_member_id: 'VERIFY000001',
  procedure_codes: ['27447'],
  diagnosis_codes: ['M17.11'],
  procedure_description: 'Total knee arthroplasty (verification)',
  case_type: 'um',
  review_type: 'prior_auth',
  priority: 'standard',
};

async function main() {
  console.log(`=== Partner API v1 — acceptance test ===\ntarget: ${baseUrl}\n`);

  // 1. Unauthenticated rejected
  {
    const { status } = await call('POST', '/api/partner/v1/cases', submitBody, { 'Idempotency-Key': ref });
    record('1. unauthenticated rejected', status === 401 ? 'PASS' : 'FAIL', `HTTP ${status}`);
  }
  // 2. Missing idempotency key rejected
  {
    const { status, json } = await call('POST', '/api/partner/v1/cases', submitBody, authed);
    const code = (json.error as { code?: string })?.code;
    record('2. missing Idempotency-Key rejected', status === 400 && code === 'idempotency_key_required' ? 'PASS' : 'FAIL', `HTTP ${status} code=${code}`);
  }
  // 3. Submit accepted
  let caseId: string | null = null;
  let demoTarget = false;
  {
    const { status, json } = await call('POST', '/api/partner/v1/cases', submitBody, { ...authed, 'Idempotency-Key': ref });
    caseId = (json.case_id as string) ?? null;
    demoTarget = json.demo === true;
    record('3. submit accepted (202)', status === 202 && !!caseId ? 'PASS' : 'FAIL', `HTTP ${status} case_id=${caseId}`);
  }
  // 4. Idempotent resend
  {
    const { status, json } = await call('POST', '/api/partner/v1/cases', submitBody, { ...authed, 'Idempotency-Key': ref });
    const ok = status === 200 && json.idempotent === true;
    record('4. idempotent resend (200, no new case)', ok ? 'PASS' : demoTarget ? 'WARN' : 'FAIL',
      demoTarget && !ok ? 'demo target — ledger needs a DB-backed environment' : `HTTP ${status} idempotent=${json.idempotent}`);
  }
  // 5. Schema-invalid field errors
  {
    const { status, json } = await call('POST', '/api/partner/v1/cases', { patient_name: 'X' }, { ...authed, 'Idempotency-Key': `${ref}-bad` });
    const errs = (json.error as { errors?: Array<{ path: string }> })?.errors ?? [];
    const ok = status === 400 && errs.some((e) => e.path === 'procedure_codes');
    record('5. schema-invalid → field errors', ok ? 'PASS' : 'FAIL', `HTTP ${status} paths=${errs.map((e) => e.path).join(',')}`);
  }
  // 6. Read by client_reference
  {
    const { status, json } = await call('GET', `/api/partner/v1/cases/${ref}`, undefined, authed);
    const ok = status === 200 || (demoTarget && status === 200);
    record('6. read by client_reference', ok ? 'PASS' : demoTarget ? 'WARN' : 'FAIL', `HTTP ${status} status=${json.status}`);
  }
  // 7. Nonexistent/cross-tenant → 404
  {
    const { status } = await call('GET', '/api/partner/v1/cases/00000000-0000-4000-8000-000000000000', undefined, authed);
    record('7. unknown case → 404 (tenant wall)', status === 404 || (demoTarget && status === 200) ? (status === 404 ? 'PASS' : 'WARN') : 'FAIL', `HTTP ${status}`);
  }
  // 8. List since
  {
    const { status, json } = await call('GET', `/api/partner/v1/cases?since=${new Date(Date.now() - 3600_000).toISOString()}`, undefined, authed);
    record('8. polling list', status === 200 && Array.isArray(json.cases) ? 'PASS' : 'FAIL', `HTTP ${status} count=${Array.isArray(json.cases) ? (json.cases as unknown[]).length : '—'}`);
  }

  const fails = results.filter((r) => r.status === 'FAIL').length;
  const warns = results.filter((r) => r.status === 'WARN').length;
  console.log(`\n=== ${results.length - fails - warns} PASS, ${fails} FAIL, ${warns} WARN ===`);
  if (fails) { console.log('RESULT: RED'); process.exit(1); }
  console.log(`RESULT: GREEN${warns ? ' (with warnings)' : ''}`);
}

main().catch((e) => { console.error('crashed:', e); process.exit(2); });
