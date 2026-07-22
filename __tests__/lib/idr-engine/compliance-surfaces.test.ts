import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtemp, writeFile, readFile, mkdir } from 'fs/promises';
import { tmpdir } from 'os';
import path from 'path';
import { runCase } from '@/lib/idr-engine/run-case';

/**
 * Compliance surfaces (Jonah's rule, from Cole's compliance question):
 * our INTERNAL document may note it's a working template, but NOTHING
 * iMPROve might see may reveal automation. The two iMPROve-facing surfaces
 * the engine produces are:
 *   1. the rationale text pasted into the portal (parties + iMPROve see it)
 *   2. the Cases Log row that lands in the shared billing sheet
 * Both must be free of any AI / engine / tooling language AND of the
 * engine's internal flag-code tokens. The internal mirror form (which
 * iMPROve never sees — the arbiter transcribes from it) may still carry
 * the INTERNAL WORK PRODUCT stamp.
 */

// Automation/tooling fingerprints that must never reach an iMPROve surface.
const FORBIDDEN = /\b(ai[- ]?generated|artificial intelligence|engine|automat\w*|tooling|claude|anthropic|\bLLM\b|machine[- ]generated|heuristic|fingerprint|deviation|extraction_gap|no_op)\b/i;
// The engine's internal flag-code tokens (UPPER_SNAKE) must not appear.
const FLAG_TOKEN = /\b[A-Z]{2,}(?:_[A-Z]+)+\b/;

const FILES: Record<string, string> = {
  'ip-notice-of-offer.txt': 'NOTICE OF OFFER — INITIATING PARTY\nDispute number DISP-990001. Line 1 final payment offer: $1,150.00.',
  'nip-notice-of-offer.txt': 'NOTICE OF OFFER — NON-INITIATING PARTY\nDispute DISP-990001. QPA is $412.18. Line 1 final payment offer: $412.18.', // NIP==QPA → a flag fires
  'ip-brief.txt': 'ARBITRATION BRIEF OF THE INITIATING PARTY\nGood faith negotiation and prior contracted rate per the EOB in Exhibit A. Acuity high per the operative report.',
  'nip-brief.txt': 'ARBITRATION BRIEF — NON-INITIATING PARTY\nThe QPA already accounts for acuity and is appropriate.',
};

let caseDir: string;
let libPath: string;
let outDir: string;

beforeEach(async () => {
  const base = await mkdtemp(path.join(tmpdir(), 'idr-comp-'));
  caseDir = path.join(base, 'DISP-990001');
  await mkdir(caseDir);
  libPath = path.join(base, 'lib.json');
  outDir = path.join(base, 'out');
  for (const [f, c] of Object.entries(FILES)) await writeFile(path.join(caseDir, f), c, 'utf-8');
});

describe('iMPROve-facing surfaces carry no automation fingerprint', () => {
  it('the portal rationale paste is clean (no AI/engine/tooling language, no flag tokens)', async () => {
    const { sheet } = await runCase(caseDir, { libraryPath: libPath, outDir });
    expect(sheet.rationalePaste).not.toMatch(FORBIDDEN);
    expect(sheet.rationalePaste).not.toMatch(FLAG_TOKEN);
    // It is real house language, not empty.
    expect(sheet.rationalePaste).toContain('offer is selected as the out-of-network rate');
  });

  it('the Cases Log row (shared billing sheet) is clean — plain notes only, no engine flag codes', async () => {
    const { sheet, files } = await runCase(caseDir, { libraryPath: libPath, outDir });
    const tsv = (await readFile(files.logRow, 'utf-8')).split('\n')[1]; // the data row
    expect(tsv).not.toMatch(FORBIDDEN);
    expect(tsv).not.toMatch(FLAG_TOKEN); // no HEURISTIC_MODE / NIP_OFFER_EQUALS_QPA / etc.
    expect(sheet.logRow).not.toMatch(FORBIDDEN);
    expect(sheet.logRow).not.toMatch(FLAG_TOKEN);
    // A substantive flag still surfaces as a PLAIN-LANGUAGE note.
    expect(sheet.logRow).toContain('NIP offer equals QPA');
  });

  it('portal_fill (what the bookmarklet pastes) carries no automation fingerprint', async () => {
    const { files } = await runCase(caseDir, { libraryPath: libPath, outDir });
    const json = JSON.parse(await readFile(files.json, 'utf-8'));
    expect(json.portal_fill.rationale_paste).not.toMatch(FORBIDDEN);
    expect(JSON.stringify(json.portal_fill)).not.toMatch(FORBIDDEN);
  });

  it('the internal mirror form MAY carry the INTERNAL WORK PRODUCT stamp (iMPROve never sees it)', async () => {
    const { files } = await runCase(caseDir, { libraryPath: libPath, outDir });
    const html = await readFile(files.html, 'utf-8');
    expect(html).toContain('INTERNAL WORK PRODUCT'); // fine — internal document
    // but even the internal document never names the tooling
    expect(html).not.toMatch(/\b(engine|claude|anthropic|ai[- ]?generated)\b/i);
  });
});
