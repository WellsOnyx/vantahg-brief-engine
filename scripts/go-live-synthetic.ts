#!/usr/bin/env tsx
/**
 * Phase 7.2 — E1 synthetic pack (≥10).
 *
 * Happy path + missing clinicals (R01) + gray zone. Asserts via case-spine
 * and intake ingest. Tokenized refs only — no live PHI, no vendor keys.
 *
 *   npm run test:go-live-synthetic
 */

import { resetCaseSpineService } from '../lib/case-spine';
import { resetClientConfigService } from '../lib/client-config';
import { resetMemoryGoLiveStore, runSyntheticPack, SYNTHETIC_PACK } from '../lib/golive';

async function main() {
  resetCaseSpineService();
  resetClientConfigService();
  resetMemoryGoLiveStore();

  const result = await runSyntheticPack({ actor: 'script:go-live-synthetic' });
  const failed = result.cases.filter((c) => !c.ok);

  console.log(`E1 synthetic pack: ${result.passed ? 'PASS' : 'FAIL'}`);
  console.log(
    `  cases=${result.count} (catalog ${SYNTHETIC_PACK.length}) happy=${result.happy_path} missing=${result.missing_clinicals} gray=${result.gray_zone} signed=${result.signed}`,
  );
  for (const row of result.cases) {
    const mark = row.ok ? 'ok' : 'FAIL';
    console.log(`  [${mark}] ${row.spec_id} ${row.actual_state ?? '—'} via ${row.via}${row.error ? ` (${row.error})` : ''}`);
  }

  if (!result.passed || failed.length > 0 || result.count < 10) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
