#!/usr/bin/env tsx
/**
 * Phase 7.2 foundation — load the E1 synthetic fixture catalog and
 * create cases on the demo/memory path.
 *
 * Tokenized refs only. No live PHI. Does not flip ENABLE_AWS_* flags.
 *
 *   npm run test:synthetic-golive-pack
 *
 * Full north-star advance (brief → md_queue / sign) is the same catalog:
 *
 *   npm run test:go-live-synthetic
 */

import { resetCaseSpineService } from '../lib/case-spine';
import { resetClientConfigService } from '../lib/client-config';
import {
  MIN_SYNTHETIC_PACK,
  SYNTHETIC_E1_RELATIVE_PATH,
  loadSyntheticE1Catalog,
  loadSyntheticE1CatalogFromDisk,
  resetMemoryGoLiveStore,
  runSyntheticPack,
} from '../lib/golive';

async function main() {
  const disk = loadSyntheticE1CatalogFromDisk();
  const bundled = loadSyntheticE1Catalog();

  if (disk.cases.length !== bundled.cases.length) {
    throw new Error(
      `${SYNTHETIC_E1_RELATIVE_PATH} (${disk.cases.length}) does not match bundled catalog (${bundled.cases.length})`,
    );
  }

  const priorAuth = disk.cases.filter((c) => (c.type ?? 'prior_auth') === 'prior_auth').length;
  const appeals = disk.cases.filter((c) => c.type === 'first_level_appeal').length;

  console.log(`Loaded ${SYNTHETIC_E1_RELATIVE_PATH}`);
  console.log(`  cases=${disk.cases.length} prior_auth=${priorAuth} first_level_appeal=${appeals}`);
  console.log(`  ${disk.notes}`);

  resetCaseSpineService();
  resetClientConfigService();
  resetMemoryGoLiveStore();

  const result = await runSyntheticPack({ actor: 'script:load-synthetic-golive-pack' });
  const failed = result.cases.filter((c) => !c.ok);

  console.log(`E1 synthetic pack: ${result.passed ? 'PASS' : 'FAIL'}`);
  console.log(
    `  cases=${result.count} happy=${result.happy_path} missing=${result.missing_clinicals} gray=${result.gray_zone} signed=${result.signed}`,
  );
  for (const row of result.cases) {
    const spec = disk.cases.find((s) => s.id === row.spec_id);
    const mark = row.ok ? 'ok' : 'FAIL';
    console.log(
      `  [${mark}] ${row.spec_id} type=${spec?.type ?? 'prior_auth'} ${row.actual_state ?? '—'} via ${row.via}${row.error ? ` (${row.error})` : ''}`,
    );
  }

  if (!result.passed || failed.length > 0 || result.count < MIN_SYNTHETIC_PACK) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
