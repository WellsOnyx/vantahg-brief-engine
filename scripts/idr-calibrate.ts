import path from 'path';
import { loadLocalEnv } from '../lib/idr-engine/env-local';
import { buildCalibration } from '../lib/idr-engine/calibrate';

/**
 * Calibration-corpus ingest — build the calibration library from
 * COMPLETED, QA-approved cases.
 *
 *   npx tsx scripts/idr-calibrate.ts <corpus-folder> [--library <json>] [--out <json>]
 *
 * Each subfolder = one completed case: its documents PLUS the final
 * submitted rationale (a .txt whose name contains 'submitted' or 'final')
 * and optionally decision.json ({prevailing_party, factor_checks}). Output:
 * calibration-library.json (weight usage, outcomes, exemplars) and
 * template-library.json seeded with observed factorMaps.
 */

loadLocalEnv();

async function main() {
  const args = process.argv.slice(2);
  const folder = args.find((a) => !a.startsWith('--'));
  if (!folder) {
    console.error('Usage: npx tsx scripts/idr-calibrate.ts <corpus-folder> [--library <json>] [--out <json>]');
    process.exit(2);
  }
  const flagVal = (name: string) => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : undefined;
  };

  const { calibration, files } = await buildCalibration(path.resolve(folder), {
    libraryPath: flagVal('--library'),
    outPath: flagVal('--out'),
  });

  console.log(`\nIngested ${calibration.caseCount} completed case(s).`);
  console.log(`Outcomes observed: IP ${calibration.outcomes.IP} · NIP ${calibration.outcomes.NIP}`);
  console.log(`Templates in corpus: ${calibration.templates.length} (factorMaps seeded where decision.json provided them)`);
  for (const [factor, u] of Object.entries(calibration.weightUsage)) {
    const total = u['modest weight'] + u['some weight'] + u['less weight'];
    if (total) console.log(`  factor ${factor} weight usage: modest ${u['modest weight']} · some ${u['some weight']} · less ${u['less weight']}`);
  }
  console.log(`\nWrote:\n  ${files.calibration}\n  ${files.templates}\n`);
}

main().catch((err) => {
  console.error('idr-calibrate failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
