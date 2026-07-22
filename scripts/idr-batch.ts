import path from 'path';
import { loadLocalEnv } from '../lib/idr-engine/env-local';
import { runBatch } from '../lib/idr-engine/run-batch';

/**
 * IDR batch runner — process a directory of case folders.
 *
 *   npx tsx scripts/idr-batch.ts <root-folder> [--out <dir>] [--library <json>] [--concurrency N]
 *
 * Each SUBFOLDER of <root-folder> is one arbitration case. Every case gets
 * its own engine-output/ (same artifacts as the single-case run), and the
 * root gets _engine-queue/{queue.md,queue.json} — the review queue sorted
 * by confidence, flagged cases at the bottom, errored cases parked and
 * listed. See lib/idr-engine/README.md.
 *
 * GUARDRAILS: drafts only, human decides every case, no portal contact.
 */

loadLocalEnv();

async function main() {
  const args = process.argv.slice(2);
  const folder = args.find((a) => !a.startsWith('--'));
  if (!folder) {
    console.error('Usage: npx tsx scripts/idr-batch.ts <root-folder> [--out <dir>] [--library <json>] [--concurrency N]');
    process.exit(2);
  }
  const flagVal = (name: string) => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : undefined;
  };

  const result = await runBatch(path.resolve(folder), {
    outDir: flagVal('--out'),
    libraryPath: flagVal('--library'),
    concurrency: flagVal('--concurrency') ? Number(flagVal('--concurrency')) : undefined,
  });

  console.log(`\nPrepped ${result.ran.length} case(s), parked ${result.parked.length}.`);
  for (const c of result.ran.slice(0, 15)) {
    console.log(`  ${c.hasBlockingFlags ? '⛔' : `${String(c.gateConfidencePct).padStart(3)}%`}  ${c.caseId}  ${c.recommendations.map((x) => `L${x.line}:${x.recommended}`).join(' ')}`);
  }
  if (result.ran.length > 15) console.log(`  … ${result.ran.length - 15} more in the queue file`);
  for (const p of result.parked) console.log(`  PARKED ${p.caseId}: ${p.error}`);
  console.log(`\nQueue: ${result.files.queueMd}\n`);
}

main().catch((err) => {
  console.error('idr-batch failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
