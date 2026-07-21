import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtemp, writeFile, readFile, mkdir } from 'fs/promises';
import { tmpdir } from 'os';
import path from 'path';
import { runCase } from '@/lib/idr-engine/run-case';
import { classifyDocuments } from '@/lib/idr-engine/classify';
import { fingerprintBrief, loadLibrary } from '@/lib/idr-engine/fingerprint';
import { renderRationale } from '@/lib/idr-engine/rationale';
import type { CaseDocument, CaseRecord, FactorGrid } from '@/lib/idr-engine/types';

/**
 * IDR Phase 0 (spec §6/§7): classification of the four core docs,
 * flag-not-guess edge cases (identical offers, missing docs, missing
 * cited exhibits), the check rule, importance-ordered rationale (factor 5
 * before 3), DLI chaining slots, DRAFT banner on every artifact, the
 * fingerprint stub's DEVIATION alarm, and the comparison JSON shape.
 *
 * Tests run in heuristic mode (no ANTHROPIC key in CI) — which is itself
 * part of the contract: no key must mean flags and blanks, never guesses.
 */

// ── Fixture case: batched, 2 lines, ER visit 99284 ────────────────────────

const IP_OFFER = `NOTICE OF OFFER — INITIATING PARTY
Dispute number DISP-445566. Initiating Party: Desert Emergency Physicians Group.
Service: CPT 99284 emergency department visit. Line 1 final payment offer: $1,150.00.
Line 2 final payment offer: $1,150.00.`;

const NIP_OFFER = `NOTICE OF OFFER — NON-INITIATING PARTY
Dispute DISP-445566. Non-Initiating Party: Sunstone Health Plan.
The qualifying payment amount (QPA) for CPT 99284 is $412.18.
Line 1 final payment offer: $450.00. Line 2 final payment offer: $450.00.`;

const IP_BRIEF = `ARBITRATION BRIEF OF THE INITIATING PARTY
The payer previously paid $1,050 for the identical service under the prior contracted rate in plan year 2023 — see Exhibit A (EOB) — and now offers less than half; such good-faith negotiation history controls.
Exhibit A is the payer's own explanation of benefits showing what it paid under the network agreement for this exact service.
The acuity of this case was high: the patient presented with chest pain requiring immediate workup, as the operative report shows.
Additional information: negotiation email correspondence is attached as Exhibit B.`;

const NIP_BRIEF = `ARBITRATION BRIEF — NON-INITIATING PARTY
The QPA already accounts for acuity of the typical case in this service code.
The qualifying payment amount is appropriate and reflects the median contracted rate for the geographic region.`;

const EXHIBIT_A = `EXHIBIT A — EXPLANATION OF BENEFITS
Paid amount $1,050.00 for CPT 99284, plan year 2023.`;

async function writeFixtureCase(dir: string, overrides: Partial<Record<string, string>> = {}) {
  const files: Record<string, string> = {
    'ip-notice-of-offer.txt': overrides.ipOffer ?? IP_OFFER,
    'nip-notice-of-offer.txt': overrides.nipOffer ?? NIP_OFFER,
    'ip-brief.txt': overrides.ipBrief ?? IP_BRIEF,
    'nip-brief.txt': overrides.nipBrief ?? NIP_BRIEF,
    'exhibit-a-eob.txt': overrides.exhibitA ?? EXHIBIT_A,
  };
  for (const [name, content] of Object.entries(files)) {
    if (content === '__OMIT__') continue;
    await writeFile(path.join(dir, name), content, 'utf-8');
  }
}

let caseDir: string;
let libPath: string;

beforeEach(async () => {
  const base = await mkdtemp(path.join(tmpdir(), 'idr-phase0-'));
  caseDir = path.join(base, 'DISP-445566');
  await mkdir(caseDir);
  libPath = path.join(base, 'template-library.json');
});

// ── End-to-end ─────────────────────────────────────────────────────────────

describe('runCase (heuristic mode, end to end)', () => {
  it('produces the three artifacts with the DRAFT banner and portal-ordered sheet', async () => {
    await writeFixtureCase(caseDir);
    const { sheet, files } = await runCase(caseDir, { libraryPath: libPath, now: new Date('2026-07-13T12:00:00Z') });

    const md = await readFile(files.markdown, 'utf-8');
    expect(md).toContain('DRAFT FOR ARBITER REVIEW');
    expect(md.indexOf('Portal step 1 · COI')).toBeLessThan(md.indexOf('Portal step 2'));
    expect(md.indexOf('Portal step 2')).toBeLessThan(md.indexOf('Portal step 3 · Rationale'));
    expect(md.indexOf('Portal step 3')).toBeLessThan(md.indexOf('Portal step 4 · Prevailing party'));
    expect(md.indexOf('Portal step 4')).toBeLessThan(md.indexOf('Portal step 5 · DLI'));
    expect(md.indexOf('Portal step 5')).toBeLessThan(md.indexOf('Portal step 6 · Attestation'));
    expect(md).toContain('ENTERED IN TWO PLACES');

    expect(sheet.record.disputeNumber).toBe('DISP-445566');
    expect(sheet.record.qpa).toBe(412.18);
    expect(sheet.record.batch).toBe(true);
    expect(sheet.record.lines.map((l) => l.ipOffer)).toEqual([1150, 1150]);
    expect(sheet.record.lines.map((l) => l.nipOffer)).toEqual([450, 450]);
    expect(sheet.flags.some((f) => f.code === 'HEURISTIC_MODE')).toBe(true);

    const json = JSON.parse(await readFile(files.json, 'utf-8'));
    expect(json.DRAFT_FOR_ARBITER_REVIEW).toBe(true);
    expect(json.factor_checks.ip).toHaveLength(7);
    expect(json.factor_checks.nip).toHaveLength(7);
    expect(json.lines).toHaveLength(2);

    const tsv = await readFile(files.logRow, 'utf-8');
    expect(tsv.split('\n')[0].split('\t')[0]).toBe('Dispute');
    expect(tsv).toContain('DISP-445566');
  });

  it('check rule: raised factors carry page-cited evidence (IP factor 5, NIP factor 7)', async () => {
    await writeFixtureCase(caseDir);
    const { sheet } = await runCase(caseDir, { libraryPath: libPath });
    const ip5 = sheet.factorGrid.ip.find((f) => f.factor === 5)!;
    const nip7 = sheet.factorGrid.nip.find((f) => f.factor === 7)!;
    expect(ip5.raised).toBe(true);
    expect(ip5.evidence.length).toBeGreaterThan(0);
    expect(ip5.evidence[0].page).toBeGreaterThan(0);
    expect(nip7.raised).toBe(true);
  });

  it('recommends per line with DLI chaining on the second matching line, confidence capped in heuristic mode', async () => {
    await writeFixtureCase(caseDir);
    const { sheet, files } = await runCase(caseDir, { libraryPath: libPath });
    expect(sheet.recommendations).toHaveLength(2);
    const [l1, l2] = sheet.recommendations;
    expect(l1.recommended).toBe('IP'); // factor-5 evidence drives the lean
    expect(l1.dliChainToLine).toBeNull();
    expect(l2.recommended).toBe('IP');
    expect(l2.dliChainToLine).toBe(1);
    expect(l1.confidencePct).toBeLessThanOrEqual(60); // heuristic cap
    const md = await readFile(files.markdown, 'utf-8');
    expect(md).toContain('The decision is the same as DLI [____');
    expect(md).not.toMatch(/DLI \d/); // the number is NEVER pre-filled
  });
});

// ── Edge cases: flag, never guess ──────────────────────────────────────────

describe('edge cases (§6)', () => {
  it('identical IP/NIP offers on a line → FLAG, no recommendation on that line', async () => {
    await writeFixtureCase(caseDir, {
      nipOffer: NIP_OFFER.replace(/Line 1 final payment offer: \$450\.00\./, 'Line 1 final payment offer: $1,150.00.'),
    });
    const { sheet } = await runCase(caseDir, { libraryPath: libPath });
    const l1 = sheet.recommendations.find((r) => r.line === 1)!;
    expect(l1.recommended).toBe('FLAG');
    expect(sheet.flags.some((f) => f.code === 'IDENTICAL_OFFERS' && f.line === 1)).toBe(true);
  });

  it('missing core document → MISSING_DOC block flag and all lines FLAG', async () => {
    await writeFixtureCase(caseDir, { nipBrief: '__OMIT__' });
    const { sheet } = await runCase(caseDir, { libraryPath: libPath });
    expect(sheet.flags.some((f) => f.code === 'MISSING_DOC')).toBe(true);
    expect(sheet.recommendations.every((r) => r.recommended === 'FLAG')).toBe(true);
  });

  it('brief citing exhibits that are not in the folder → MISSING_CITED_EXHIBIT', async () => {
    await writeFixtureCase(caseDir, { exhibitA: '__OMIT__' }); // brief cites Exhibits A and B; folder has none
    const { sheet } = await runCase(caseDir, { libraryPath: libPath });
    expect(sheet.flags.some((f) => f.code === 'MISSING_CITED_EXHIBIT')).toBe(true);
  });

  it('NIP offer exactly equal to the QPA → warn flag, recommendation still made', async () => {
    await writeFixtureCase(caseDir, {
      nipOffer: NIP_OFFER.replace(/\$450\.00\. Line 2 final payment offer: \$450\.00\./, '$412.18. Line 2 final payment offer: $412.18.'),
    });
    const { sheet } = await runCase(caseDir, { libraryPath: libPath });
    expect(sheet.flags.some((f) => f.code === 'NIP_OFFER_EQUALS_QPA')).toBe(true);
    expect(sheet.recommendations[0].recommended).not.toBe('FLAG');
  });
});

// ── Rationale (§4) ─────────────────────────────────────────────────────────

describe('rationale house template', () => {
  it('orders the IP discussion by importance: factor 5 before factor 3, with CMS weight language and the verbatim close', async () => {
    await writeFixtureCase(caseDir);
    const { sheet } = await runCase(caseDir, { libraryPath: libPath });
    const r = sheet.rationale;
    const f5 = r.indexOf('good-faith');
    const f3 = r.search(/acuity/i);
    expect(f5).toBeGreaterThan(-1);
    expect(f3).toBeGreaterThan(-1);
    expect(f5).toBeLessThan(f3); // importance order: 5 first, 3 second
    expect(r).toMatch(/given (considerable|some|modest) weight/);
    expect(r).toContain("offer is selected as the out-of-network rate that best represents the value");
    expect(r).toContain('¶1 is portal-injected');
    expect(r).toContain('VERIFY-VERBATIM');
  });
});

// ── Classification ─────────────────────────────────────────────────────────

describe('classifyDocuments', () => {
  it('labels the four core docs and the exhibit from realistic names/content', async () => {
    await writeFixtureCase(caseDir);
    const files = [
      { file: 'ip-notice-of-offer.txt', pages: [{ page: 1, text: IP_OFFER }] },
      { file: 'nip-notice-of-offer.txt', pages: [{ page: 1, text: NIP_OFFER }] },
      { file: 'ip-brief.txt', pages: [{ page: 1, text: IP_BRIEF }] },
      { file: 'nip-brief.txt', pages: [{ page: 1, text: NIP_BRIEF }] },
      { file: 'exhibit-a-eob.txt', pages: [{ page: 1, text: EXHIBIT_A }] },
    ];
    const { documents, flags } = classifyDocuments(files);
    const byFile = Object.fromEntries(documents.map((d) => [d.file, d.kind]));
    expect(byFile['ip-notice-of-offer.txt']).toBe('ip_offer');
    expect(byFile['nip-notice-of-offer.txt']).toBe('nip_offer');
    expect(byFile['ip-brief.txt']).toBe('ip_brief');
    expect(byFile['nip-brief.txt']).toBe('nip_brief');
    expect(byFile['exhibit-a-eob.txt']).toBe('exhibit');
    expect(flags.filter((f) => f.code === 'MISSING_DOC')).toHaveLength(0);
  });
});

// ── Fingerprint stub (§5) ──────────────────────────────────────────────────

// A realistic-length template shell — long enough that one added sentence
// keeps token similarity above the near-match threshold, as real multi-page
// payer templates do.
const NIP_TEMPLATE =
  'The Non-Initiating Party respectfully submits that the qualifying payment amount of $412.18 calculated on 3/1/2026 ' +
  'for dispute DISP-445566 is appropriate and reflects the median contracted rate for the same or similar item or service ' +
  'in the applicable geographic region. The QPA methodology prescribed by the No Surprises Act already accounts for the ' +
  'acuity and complexity of the typical patient encounter billed under this service code, and the Initiating Party has ' +
  'offered no credible information demonstrating that the qualifying payment amount materially misrepresents the market ' +
  'value of the service at issue. Accordingly, the certified IDR entity should select the Non-Initiating Party offer.';

describe('template fingerprint', () => {
  const briefDoc = (text: string): CaseDocument => ({
    file: 'nip-brief.pdf',
    kind: 'nip_brief',
    pages: [{ page: 1, text }],
    classificationReason: 'test',
  });

  it('registers a new template; identical re-filing with different numbers is quiet; extra exhibit → DEVIATION', async () => {
    const lib = await loadLibrary(libPath); // empty
    const first = fingerprintBrief(briefDoc(NIP_TEMPLATE), 'NIP', 1, lib);
    expect(first.result.status).toBe('new_template');
    expect(first.flag).toBeNull();

    // Same shell, different case number/amount/date → NORMAL reuse, quiet.
    const refiled = NIP_TEMPLATE
      .replace('$412.18', '$377.50')
      .replace('3/1/2026', '4/2/2026')
      .replace('DISP-445566', 'DISP-990011');
    const second = fingerprintBrief(briefDoc(refiled), 'NIP', 1, lib);
    expect(second.result.status).toBe('known_template');
    expect(second.flag).toBeNull();

    // Known shell + exhibit count shifted → DEVIATION, loud and blocking.
    const third = fingerprintBrief(briefDoc(refiled), 'NIP', 2, lib);
    expect(third.result.status).toBe('DEVIATION');
    expect(third.flag?.code).toBe('TEMPLATE_DEVIATION');
    expect(third.flag?.severity).toBe('block');
    expect(third.flag?.message).toContain('EXHIBIT COUNT');
  });

  it('changed wording inside a familiar shell → DEVIATION (the lazy-arbiter trap)', async () => {
    const lib = await loadLibrary(libPath);
    fingerprintBrief(briefDoc(NIP_TEMPLATE), 'NIP', 1, lib);
    const edited = NIP_TEMPLATE +
      ' Additionally, the provider expressly waived any right to balance billing in the executed consent form.';
    const changed = fingerprintBrief(briefDoc(edited), 'NIP', 1, lib);
    expect(changed.result.status).toBe('DEVIATION');
    expect(changed.flag?.code).toBe('TEMPLATE_DEVIATION');
    expect(changed.flag?.message).toContain('WORDING CHANGED');
  });
});

// ── Split decision rendering ───────────────────────────────────────────────

describe('split decision rationale', () => {
  it('a split across lines yields the ARBITER-TO-SELECT close and a split note', () => {
    const record: CaseRecord = {
      caseId: 'x', disputeNumber: null, ipName: null, nipName: null, qpa: null,
      batch: true, extractionMode: 'llm', flags: [],
      lines: [
        { line: 1, cpt: null, description: null, dateOfService: null, ipOffer: 100, nipOffer: 50 },
        { line: 2, cpt: null, description: null, dateOfService: null, ipOffer: 100, nipOffer: 50 },
      ],
    };
    const grid: FactorGrid = {
      ip: [{ factor: 5, raised: true, evidence: [{ quote: 'q', page: 1, file: 'f' }], suggestedWeight: 'considerable weight', summary: 'prior contracted rates' }],
      nip: [],
    };
    const split = renderRationale(record, grid, [
      { line: 1, recommended: 'IP', confidencePct: 80, dliChainToLine: null, reasons: [] },
      { line: 2, recommended: 'NIP', confidencePct: 70, dliChainToLine: null, reasons: [] },
    ]);
    expect(split).toContain('[ARBITER TO SELECT: IP/NIP]');
    expect(split).toContain('SPLIT DECISION');
    // Single-party close when not split:
    const unified = renderRationale(record, grid, [
      { line: 1, recommended: 'IP', confidencePct: 80, dliChainToLine: null, reasons: [] },
      { line: 2, recommended: 'IP', confidencePct: 80, dliChainToLine: 1, reasons: [] },
    ]);
    expect(unified).toContain("the IP has presented sufficient credible evidence");
    expect(unified).not.toContain('SPLIT DECISION');
  });
});
