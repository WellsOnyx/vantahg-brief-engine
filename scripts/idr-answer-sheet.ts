import path from 'path';
import { loadLocalEnv } from '../lib/idr-engine/env-local';
import { runCase } from '../lib/idr-engine/run-case';

/**
 * IDR Phase 0 CLI — single-case answer-sheet generator.
 *
 *   npx tsx scripts/idr-answer-sheet.ts <case-folder> [--out <dir>] [--library <json>]
 *
 * Reads one arbitration case folder of searchable PDFs (and/or .txt),
 * writes engine-output/{answer-sheet.md, answer-sheet.json,
 * cases-log-row.tsv} next to it. See lib/idr-engine/README.md.
 *
 * GUARDRAILS: output is a DRAFT FOR ARBITER REVIEW. This tool submits
 * nothing, contacts no portal, and flags rather than guesses.
 */

loadLocalEnv();

async function main() {
  const args = process.argv.slice(2);
  const folder = args.find((a) => !a.startsWith('--'));
  if (!folder) {
    console.error('Usage: npx tsx scripts/idr-answer-sheet.ts <case-folder> [--out <dir>] [--library <json>]');
    process.exit(2);
  }
  const flagVal = (name: string) => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : undefined;
  };

  const { sheet, files } = await runCase(path.resolve(folder), {
    outDir: flagVal('--out'),
    libraryPath: flagVal('--library'),
  });

  console.log(`\n${sheet.draftBanner}\n`);
  console.log(`Case ${sheet.caseId} · dispute ${sheet.record.disputeNumber ?? '—'} · ${sheet.record.batch ? `batch, ${sheet.record.lines.length} lines` : 'single line'} · mode ${sheet.record.extractionMode.toUpperCase()}`);
  for (const rec of sheet.recommendations) {
    console.log(`  line ${rec.line}: ${rec.recommended === 'FLAG' ? '⛔ FLAG — human ruling required' : `recommend ${rec.recommended} (${rec.confidencePct}%)`}${rec.dliChainToLine ? ` · DLI chain → line ${rec.dliChainToLine}` : ''}`);
  }
  if (sheet.flags.length) {
    console.log(`  flags: ${sheet.flags.map((f) => `${f.severity === 'block' ? '⛔' : '⚠'}${f.code}`).join(', ')}`);
  }
  console.log(`\nWrote:\n  ${files.html}   ← open this in the workspace browser\n  ${files.markdown}\n  ${files.json}\n  ${files.logRow}\n`);
}

main().catch((err) => {
  console.error('idr-answer-sheet failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
