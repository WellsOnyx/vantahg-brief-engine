#!/usr/bin/env tsx
/**
 * VantaUM End-to-End Synthetic Smoke Test
 *
 * One command, full system, real plumbing — no HTTP mocks, no LLM stubs.
 * Creates a synthetic case (clearly marked, fake patient), drives it
 * through brief generation, fact-check, MD determination, and PDF
 * download, and prints a single ✅ if every step worked.
 *
 * This is the ship-readiness gate. If this script succeeds against a real
 * Supabase + Anthropic environment, the full intake → brief → review →
 * determination → PDF loop works end to end.
 *
 * Usage:
 *   npm run test:e2e-synthetic          # default — leaves the case for inspection
 *   npm run test:e2e-synthetic -- --cleanup   # delete the case + audit rows after
 *   npm run test:e2e-synthetic -- --help
 *
 * Pre-conditions (the script verifies and refuses to run otherwise):
 *   1. Supabase env vars + reachable database
 *   2. ANTHROPIC_API_KEY set + ENABLE_REAL_ANTHROPIC=true
 *   3. At least one client and one MD-credentialed reviewer in the DB
 *      (run scripts/bootstrap-real-client.ts first if not)
 *
 * Cost: one brief generation against Anthropic per run. At Opus 4.6 list
 * prices and a typical ~5K token request, that's roughly $0.02-$0.05.
 */

import { getEnv, isRealAnthropicEnabled } from '../lib/env';
import { getRealModeStatus } from '../lib/real-mode-status';
import { generateBriefForCase } from '../lib/generate-brief';
import { generateBriefPdf } from '../lib/pdf-generator';
import { logAuditEvent, logDetermination } from '../lib/audit';
import { getServiceClient } from '../lib/supabase';
import type { Case } from '../lib/types';

interface CliArgs {
  cleanup: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = { cleanup: false };
  for (const a of argv) {
    switch (a) {
      case '--cleanup': args.cleanup = true; break;
      case '--help':
      case '-h':
        console.log(`
smoke-e2e — synthetic end-to-end verification

Pre-conditions:
  - Real Supabase + Anthropic configured (see /admin/usage)
  - At least one client and one MD reviewer in the DB

Usage:
  npm run test:e2e-synthetic
  npm run test:e2e-synthetic -- --cleanup    # remove the synthetic case after

Cost: ~$0.02-$0.05 per run (one brief generation against Anthropic).
`);
        process.exit(0);
        break;
      default:
        console.error(`Unknown arg: ${a}`);
        process.exit(1);
    }
  }
  return args;
}

const STEP_PREFIX = '●';
const FAIL_PREFIX = '✗';
const OK_PREFIX = '✓';

function step(label: string): void {
  console.log(`${STEP_PREFIX} ${label}`);
}

function fail(label: string, hint?: string): never {
  console.error(`\n${FAIL_PREFIX} ${label}`);
  if (hint) console.error(`  ${hint}`);
  process.exit(1);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const startedAt = Date.now();

  console.log('\nVantaUM end-to-end synthetic smoke test\n');

  // ── Pre-flight 1: real-mode status ──────────────────────────────────
  step('Pre-flight: real-mode status');
  const status = await getRealModeStatus();
  if (status.demo_mode) {
    fail(
      'Demo mode is active — this script needs a real environment.',
      'Set ENABLE_REAL_ANTHROPIC=true and provide Supabase + Anthropic credentials in .env.local.',
    );
  }
  if (status.components.supabase.status !== 'ready') {
    fail(
      `Supabase: ${status.components.supabase.hint}`,
      status.components.supabase.missing.length > 0
        ? `Missing: ${status.components.supabase.missing.join(', ')}`
        : undefined,
    );
  }
  if (status.components.anthropic.status !== 'ready' || !isRealAnthropicEnabled()) {
    fail(
      `Anthropic: ${status.components.anthropic.hint}`,
      status.components.anthropic.missing.length > 0
        ? `Missing: ${status.components.anthropic.missing.join(', ')}`
        : undefined,
    );
  }
  console.log(`  ${OK_PREFIX} Supabase reachable, real Anthropic enabled`);

  const supabase = getServiceClient();

  // ── Pre-flight 2: bootstrap present? ────────────────────────────────
  step('Pre-flight: bootstrap state');
  const { data: client, error: clientErr } = await supabase
    .from('clients')
    .select('id, name')
    .limit(1)
    .maybeSingle();
  if (clientErr) {
    fail(`Failed to list clients: ${clientErr.code ?? 'unknown'}`, 'Check service-role key + schema.');
  }
  if (!client) {
    fail(
      'No clients found in the database.',
      'Run: npx tsx scripts/bootstrap-real-client.ts --client-name "..." --contact-email "..." ' +
        '--md-name "..." --md-email "..." --md-specialty "Internal Medicine"',
    );
  }
  const { data: mdReviewer, error: reviewerErr } = await supabase
    .from('reviewers')
    .select('id, name, credentials')
    .ilike('credentials', 'MD%')
    .limit(1)
    .maybeSingle();
  if (reviewerErr) {
    fail(`Failed to list reviewers: ${reviewerErr.code ?? 'unknown'}`);
  }
  if (!mdReviewer) {
    fail(
      'No MD-credentialed reviewer found.',
      'Re-run the bootstrap script with --md-name / --md-email / --md-specialty.',
    );
  }
  console.log(`  ${OK_PREFIX} Client: ${client.name}`);
  console.log(`  ${OK_PREFIX} MD reviewer: ${mdReviewer.name}`);

  // ── Step 1: Create synthetic case ───────────────────────────────────
  step('Step 1/5: Create synthetic intake case');
  const stamp = new Date().toISOString().replace(/[^\d]/g, '').slice(0, 14); // YYYYMMDDHHMMSS
  const caseNumber = `SMOKE-${stamp}`;
  const synthetic = {
    case_number: caseNumber,
    status: 'intake' as const,
    priority: 'standard' as const,
    service_category: 'imaging' as const,
    review_type: 'prior_auth' as const,
    patient_name: `Smoke Test — ${stamp}`,
    patient_dob: '1980-01-15',
    patient_gender: 'female',
    patient_member_id: `SMOKE-MBR-${stamp}`,
    requesting_provider: 'Dr. Synthetic Provider, MD',
    requesting_provider_npi: '1234567890',
    requesting_provider_specialty: 'Internal Medicine',
    procedure_codes: ['72148'], // MRI lumbar — well-known criteria
    diagnosis_codes: ['M54.5', 'M54.16'],
    procedure_description: 'MRI lumbar spine without contrast',
    clinical_question: 'Is MRI medically necessary for chronic low back pain with radiculopathy?',
    payer_name: 'Smoke Test Plan',
    plan_type: 'PPO',
    facility_type: 'outpatient' as const,
    client_id: client.id,
    intake_channel: 'api' as const,
    authorization_number: `AUTH-SMOKE-${stamp}`,
    intake_received_at: new Date().toISOString(),
    submitted_documents: [],
    vertical: 'medical' as const,
    sla_hours: 48,
    turnaround_deadline: new Date(Date.now() + 48 * 3600_000).toISOString(),
  };

  const { data: insertedCase, error: insertErr } = await supabase
    .from('cases')
    .insert(synthetic)
    .select('*, client:clients(*)')
    .single();
  if (insertErr || !insertedCase) {
    fail(
      `Failed to insert case: ${insertErr?.code ?? 'unknown'}`,
      'Schema may be missing required columns. Check migration 008 was applied.',
    );
  }
  const caseId = insertedCase.id as string;
  await logAuditEvent(caseId, 'case_created', 'smoke-e2e', {
    case_number: caseNumber,
    synthetic: true,
  });
  console.log(`  ${OK_PREFIX} case_id=${caseId} case_number=${caseNumber}`);

  // ── Step 2: Brief generation + fact-check ───────────────────────────
  step('Step 2/5: Generate clinical brief + fact-check (real Anthropic call)');
  let brief, factCheck;
  try {
    const result = await generateBriefForCase(insertedCase as Case, { client: insertedCase.client });
    brief = result.brief;
    factCheck = result.factCheck;
  } catch (err) {
    await cleanupOnError(supabase, caseId, args.cleanup);
    fail(
      `Brief generation failed: ${err instanceof Error ? err.name : typeof err}`,
      err instanceof Error ? err.message : undefined,
    );
  }

  const { error: briefUpdateErr } = await supabase
    .from('cases')
    .update({
      ai_brief: brief,
      ai_brief_generated_at: new Date().toISOString(),
      fact_check: factCheck,
      fact_check_at: new Date().toISOString(),
      status: 'brief_ready',
    })
    .eq('id', caseId);
  if (briefUpdateErr) {
    fail(`Failed to persist brief: ${briefUpdateErr.code ?? 'unknown'}`);
  }
  console.log(
    `  ${OK_PREFIX} brief generated · recommendation=${brief.ai_recommendation.recommendation} · ` +
      `confidence=${brief.ai_recommendation.confidence} · fact_check=${factCheck.overall_status} ` +
      `(${factCheck.overall_score}/100)`,
  );

  // ── Step 3: MD review + final determination ─────────────────────────
  step('Step 3/5: Record MD determination');
  // Skip the LPN/RN tiers for this smoke test; the full pod workflow is
  // exercised by the workflow-hardening suite. Here we just verify the
  // determination write + audit trail.
  const determination = brief.ai_recommendation.recommendation === 'approve' ? 'approve' : 'deny';
  const determinationRationale = `[smoke-e2e] Following AI recommendation: ${brief.ai_recommendation.rationale.slice(0, 200)}`;
  const determinationAt = new Date().toISOString();

  const { error: detErr } = await supabase
    .from('cases')
    .update({
      status: 'determination_made',
      determination,
      determination_rationale: determinationRationale,
      determination_at: determinationAt,
      determined_by: mdReviewer.id,
    })
    .eq('id', caseId);
  if (detErr) {
    fail(`Failed to write determination: ${detErr.code ?? 'unknown'}`);
  }
  await logDetermination(caseId, mdReviewer.name, determination, {
    rationale_preview: determinationRationale.slice(0, 80),
    reviewer_id: mdReviewer.id,
  });
  console.log(`  ${OK_PREFIX} determination=${determination} by=${mdReviewer.name}`);

  // ── Step 4: Generate the brief PDF ──────────────────────────────────
  step('Step 4/5: Generate brief PDF');
  // Re-fetch so we have the persisted ai_brief on the case object.
  const { data: caseForPdf, error: refetchErr } = await supabase
    .from('cases')
    .select('*, reviewer:reviewers(*), client:clients(*)')
    .eq('id', caseId)
    .single();
  if (refetchErr || !caseForPdf) {
    fail(`Failed to re-fetch case for PDF: ${refetchErr?.code ?? 'unknown'}`);
  }

  let pdfBytes: Buffer;
  try {
    pdfBytes = await generateBriefPdf(caseForPdf as Case);
  } catch (err) {
    fail(
      `PDF generation failed: ${err instanceof Error ? err.name : typeof err}`,
      err instanceof Error ? err.message : undefined,
    );
  }
  if (pdfBytes.slice(0, 5).toString('ascii') !== '%PDF-') {
    fail('PDF output does not start with %PDF- magic bytes');
  }
  if (pdfBytes.length < 5_000) {
    fail(`PDF is suspiciously small (${pdfBytes.length} bytes)`);
  }
  console.log(`  ${OK_PREFIX} ${pdfBytes.length.toLocaleString()} bytes, %PDF- header OK`);

  // ── Step 5: Audit trail check ───────────────────────────────────────
  step('Step 5/5: Audit trail');
  const { data: auditRows, error: auditErr } = await supabase
    .from('audit_log')
    .select('action')
    .eq('case_id', caseId);
  if (auditErr) {
    fail(`Failed to read audit log: ${auditErr.code ?? 'unknown'}`);
  }
  const actions = (auditRows ?? []).map((r) => r.action);
  const expected = ['case_created', 'brief_generation_started', 'brief_generation_completed', 'fact_check_completed', 'determination_made'];
  const missing = expected.filter((a) => !actions.includes(a));
  if (missing.length > 0) {
    fail(
      `Audit trail incomplete. Missing actions: ${missing.join(', ')}`,
      'Check lib/audit.ts and the audit-fire-and-forget catches in the brief pipeline.',
    );
  }
  console.log(`  ${OK_PREFIX} ${actions.length} audit events written, all expected actions present`);

  // ── Optional cleanup ────────────────────────────────────────────────
  if (args.cleanup) {
    console.log('\n● Cleanup');
    await supabase.from('audit_log').delete().eq('case_id', caseId);
    await supabase.from('cases').delete().eq('id', caseId);
    console.log(`  ${OK_PREFIX} Removed case + audit rows`);
  }

  const elapsedSec = ((Date.now() - startedAt) / 1000).toFixed(1);
  console.log(`
✅ Full end-to-end flow successful (${elapsedSec}s)
   case_id:     ${caseId}
   case_number: ${caseNumber}
   pdf_bytes:   ${pdfBytes.length.toLocaleString()}
${args.cleanup ? '   cleanup:     done' : '   note:        case left in DB for inspection — re-run with --cleanup to remove'}
`);
}

async function cleanupOnError(
  supabase: ReturnType<typeof getServiceClient>,
  caseId: string,
  shouldCleanup: boolean,
): Promise<void> {
  if (!shouldCleanup) return;
  await supabase.from('audit_log').delete().eq('case_id', caseId);
  await supabase.from('cases').delete().eq('id', caseId);
}

// getEnv() is called inside getRealModeStatus and the helpers, but calling
// it at startup gives a clearer error message if env parsing itself blows up.
getEnv();

main().catch((err: unknown) => {
  console.error('\n✗ smoke-e2e crashed:');
  console.error(err instanceof Error ? err.stack ?? err.message : String(err));
  process.exit(1);
});
