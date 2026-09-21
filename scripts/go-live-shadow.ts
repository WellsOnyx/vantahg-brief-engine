#!/usr/bin/env tsx
/**
 * Phase 7.3 — E2 shadow pack (≥10).
 *
 * Live-shaped synthetic packets. MD signs. Fan-out records member/provider
 * intent only. Tokenized refs only — no live PHI, no vendor keys.
 *
 *   npm run test:go-live-shadow
 */

import { resetCaseSpineService } from '../lib/case-spine';
import { resetClientConfigService } from '../lib/client-config';
import { MIN_SHADOW_PACK, resetMemoryGoLiveStore, runShadowPack, SHADOW_PACK } from '../lib/golive';

async function main() {
  resetCaseSpineService();
  resetClientConfigService();
  resetMemoryGoLiveStore();

  const result = await runShadowPack({ actor: 'script:go-live-shadow' });
  const failed = result.cases.filter((c) => !c.ok);

  console.log(`E2 shadow pack: ${result.passed ? 'PASS' : 'FAIL'}`);
  console.log(
    `  cases=${result.count} (catalog ${SHADOW_PACK.length}) signed=${result.signed} shadow_mode=${result.shadow_mode} member_provider_final_sends=${result.member_provider_final_sends}`,
  );
  for (const row of result.cases) {
    const mark = row.ok ? 'ok' : 'FAIL';
    console.log(`  [${mark}] ${row.spec_id} ${row.actual_state ?? '—'} via ${row.via}${row.error ? ` (${row.error})` : ''}`);
  }

  if (!result.passed || failed.length > 0 || result.count < MIN_SHADOW_PACK || result.member_provider_final_sends !== 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
