#!/usr/bin/env tsx
/**
 * Phase 7.3 foundation — load the E2 shadow fixture catalog and
 * MD-sign + fan-out on the demo/memory path.
 *
 * Tokenized refs only. No live PHI. Does not flip ENABLE_AWS_* flags.
 * Every case is shadow=true — member/provider outbound is intent only.
 *
 *   npm run test:shadow-golive-pack
 *
 * Same catalog:
 *
 *   npm run test:go-live-shadow
 */

import { resetCaseSpineService } from '../lib/case-spine';
import { resetClientConfigService } from '../lib/client-config';
import {
  MIN_SHADOW_PACK,
  SHADOW_E2_RELATIVE_PATH,
  loadShadowE2Catalog,
  loadShadowE2CatalogFromDisk,
  resetMemoryGoLiveStore,
  runShadowPack,
} from '../lib/golive';

async function main() {
  const disk = loadShadowE2CatalogFromDisk();
  const bundled = loadShadowE2Catalog();

  if (disk.cases.length !== bundled.cases.length) {
    throw new Error(
      `${SHADOW_E2_RELATIVE_PATH} (${disk.cases.length}) does not match bundled catalog (${bundled.cases.length})`,
    );
  }
  if (disk.shadow !== true || bundled.shadow !== true) {
    throw new Error(`${SHADOW_E2_RELATIVE_PATH} must set shadow=true`);
  }

  const priorAuth = disk.cases.filter((c) => (c.type ?? 'prior_auth') === 'prior_auth').length;
  const appeals = disk.cases.filter((c) => c.type === 'first_level_appeal').length;

  console.log(`Loaded ${SHADOW_E2_RELATIVE_PATH}`);
  console.log(`  cases=${disk.cases.length} prior_auth=${priorAuth} first_level_appeal=${appeals} shadow=true`);
  console.log(`  ${disk.notes}`);

  resetCaseSpineService();
  resetClientConfigService();
  resetMemoryGoLiveStore();

  const result = await runShadowPack({ actor: 'script:load-shadow-golive-pack' });
  const failed = result.cases.filter((c) => !c.ok);

  console.log(`E2 shadow pack: ${result.passed ? 'PASS' : 'FAIL'}`);
  console.log(
    `  cases=${result.count} signed=${result.signed} shadow_mode=${result.shadow_mode} member_provider_final_sends=${result.member_provider_final_sends}`,
  );
  for (const row of result.cases) {
    const spec = disk.cases.find((s) => s.id === row.spec_id);
    const mark = row.ok ? 'ok' : 'FAIL';
    console.log(
      `  [${mark}] ${row.spec_id} type=${spec?.type ?? 'prior_auth'} ${row.actual_state ?? '—'} via ${row.via}${row.error ? ` (${row.error})` : ''}`,
    );
  }

  if (
    !result.passed ||
    failed.length > 0 ||
    result.count < MIN_SHADOW_PACK ||
    result.member_provider_final_sends !== 0
  ) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
