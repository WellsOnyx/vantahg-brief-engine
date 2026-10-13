/**
 * One-command VHG Score demo prep.
 *
 *   npm run demo:vhg
 *
 * Writes the redacted pattern file and prints the local and published URLs.
 * Does not connect to a database and does not read live PHI.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { getStoplossDashboard } from '../lib/vhg/dashboard';
import { getRedactedIdrPatterns } from '../lib/vhg/patterns';
import { getMedReviewDemoCase, panelFromCase } from '../lib/vhg/portfolio';

const outDir = path.join(process.cwd(), 'fixtures/vhg');
const outFile = path.join(outDir, 'idr-patterns.redacted.json');

mkdirSync(outDir, { recursive: true });
const patterns = getRedactedIdrPatterns();
writeFileSync(outFile, `${JSON.stringify(patterns, null, 2)}\n`);

const dashboard = getStoplossDashboard();
const featured = getMedReviewDemoCase('vhg-mr-0101');
const panel = featured ? panelFromCase(featured, false) : null;

console.log(`Redacted IDR patterns: ${patterns.length}`);
console.log(`Wrote ${outFile}`);
if (dashboard.ok) {
  console.log(
    `Entitled med-review cases: ${dashboard.totals.cases_reviewed}; high VHG risk: ${dashboard.totals.high_vhg_risk_count}`,
  );
}
if (panel) {
  console.log(`Sample case ${panel.case_number}: VHG Score ${panel.score.score} (${panel.score.band})`);
}
console.log('');
console.log('Local:  ENABLE_VHG_SCORE_DEMO=true npm run dev');
console.log('        http://localhost:3000/stoploss');
console.log('        http://localhost:3000/stoploss/review/vhg-mr-0101');
console.log('Live:   https://vantaum.com/stoploss');
