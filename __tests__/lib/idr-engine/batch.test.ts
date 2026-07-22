import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtemp, writeFile, readFile, mkdir, rm } from 'fs/promises';
import { execFileSync } from 'child_process';
import { tmpdir } from 'os';
import path from 'path';
import { runBatch } from '@/lib/idr-engine/run-batch';
import { buildCalibration } from '@/lib/idr-engine/calibrate';

/**
 * Batch runner: processes every case subfolder, sorts the queue by
 * confidence with blocked cases at the bottom, parks (never drops)
 * errored cases, and shares one template library across the batch.
 */

function caseFiles(disputeNo: string, opts: { identicalOffers?: boolean } = {}): Record<string, string> {
  const nipOffer = opts.identicalOffers ? '$1,150.00' : '$450.00';
  return {
    'ip-notice-of-offer.txt': `NOTICE OF OFFER — INITIATING PARTY\nDispute number ${disputeNo}. Line 1 final payment offer: $1,150.00.`,
    'nip-notice-of-offer.txt': `NOTICE OF OFFER — NON-INITIATING PARTY\nDispute ${disputeNo}. The qualifying payment amount (QPA) is $400.00. Line 1 final payment offer: ${nipOffer}.`,
    'ip-brief.txt':
      'ARBITRATION BRIEF OF THE INITIATING PARTY\nThe payer previously paid more under the prior contracted rate in good faith negotiations, per the EOB in Exhibit A.\nThe acuity was high per the operative report.',
    'nip-brief.txt': 'ARBITRATION BRIEF — NON-INITIATING PARTY\nThe QPA already accounts for acuity and the qualifying payment amount is appropriate.',
    'exhibit-a.txt': 'EXHIBIT A — EXPLANATION OF BENEFITS. Paid amount $1,050.00.',
  };
}

let root: string;
let libPath: string;
let outDir: string;

beforeEach(async () => {
  const base = await mkdtemp(path.join(tmpdir(), 'idr-batch-'));
  root = path.join(base, 'cases');
  await mkdir(root);
  libPath = path.join(base, 'lib.json');
  outDir = path.join(base, 'out'); // read-only-input rule: outputs never inside the input root
});

async function writeCase(name: string, files: Record<string, string>) {
  const dir = path.join(root, name);
  await mkdir(dir);
  for (const [f, c] of Object.entries(files)) await writeFile(path.join(dir, f), c, 'utf-8');
}

describe('runBatch', () => {
  it('runs every case folder, sorts clean-by-confidence with blocked at the bottom, parks empty folders', async () => {
    await writeCase('DISP-000001', caseFiles('DISP-000001'));
    const missingBrief = caseFiles('DISP-000002');
    delete missingBrief['nip-brief.txt']; // MISSING_DOC → blocking flag (identical offers are no-ops now, not blockers)
    await writeCase('DISP-000002', missingBrief);
    await writeCase('DISP-000003', caseFiles('DISP-000003'));
    await mkdir(path.join(root, 'DISP-000004')); // empty → parked, not dropped

    const result = await runBatch(root, { libraryPath: libPath, outDir, now: new Date('2026-07-21T12:00:00Z') });

    expect(result.ran).toHaveLength(3);
    expect(result.parked).toHaveLength(1);
    expect(result.parked[0].caseId).toBe('DISP-000004');

    // Blocked case (identical offers) sinks to the bottom regardless of order on disk.
    expect(result.ran[2].caseId).toBe('DISP-000002');
    expect(result.ran[2].hasBlockingFlags).toBe(true);
    expect(result.ran[0].gateConfidencePct).toBeGreaterThanOrEqual(result.ran[1].gateConfidencePct);

    const md = await readFile(result.files.queueMd, 'utf-8');
    expect(md).toContain('DRAFT FOR ARBITER REVIEW');
    expect(md).toContain('Parked');
    expect(md).toContain('DISP-000004');

    const json = JSON.parse(await readFile(result.files.queueJson, 'utf-8'));
    expect(json.DRAFT_FOR_ARBITER_REVIEW).toBe(true);
    expect(json.ran).toHaveLength(3);

    // Per-case artifacts exist too.
    const sheet = await readFile(path.join(outDir, 'DISP-000001', 'answer-sheet.md'), 'utf-8');
    expect(sheet).toContain('DRAFT FOR ARBITER REVIEW');
  });

  it('shares one template library across the batch: identical NIP template re-used across cases registers once', async () => {
    await writeCase('DISP-000010', caseFiles('DISP-000010'));
    await writeCase('DISP-000011', caseFiles('DISP-000011'));
    await runBatch(root, { libraryPath: libPath, outDir, concurrency: 1 });
    const lib = JSON.parse(await readFile(libPath, 'utf-8'));
    // Two briefs per case (IP + NIP), same shells across both cases → 2 templates, each seen twice.
    expect(lib.templates).toHaveLength(2);
    expect(lib.templates.every((t: { seenCount: number }) => t.seenCount === 2)).toBe(true);
  });

  it('accepts a directory of ZIPs: unzips internally and runs each as a case', async () => {
    // Build a case folder, zip it flat, delete the folder — only the zip remains.
    await writeCase('DISP-000020', caseFiles('DISP-000020'));
    const src = path.join(root, 'DISP-000020');
    const fileNames = Object.keys(caseFiles('DISP-000020'));
    execFileSync('zip', ['-q', '-j', path.join(root, 'DISP-000020.zip'), ...fileNames.map((f) => path.join(src, f))]);
    await rm(src, { recursive: true });

    const result = await runBatch(root, { libraryPath: libPath, outDir });
    expect(result.ran).toHaveLength(1);
    expect(result.ran[0].caseId).toBe('DISP-000020');
    expect(result.parked).toHaveLength(0);
    const sheet = await readFile(path.join(outDir, 'DISP-000020', 'answer-sheet.html'), 'utf-8');
    expect(sheet).toContain('DRAFT FOR ARBITER REVIEW');
    // Re-running discovers the zip again, not the _unzipped extraction as a second case.
    const again = await runBatch(root, { libraryPath: libPath, outDir });
    expect(again.ran).toHaveLength(1);
  });
});

// ── Calibration corpus (spec item 6) ───────────────────────────────────────

describe('buildCalibration', () => {
  it('ingests completed cases: weight usage mined, outcomes counted, template factorMap seeded, exemplars captured', async () => {
    const corpus = path.join(root, 'completed');
    await mkdir(corpus);
    for (const [name, pp] of [['DISP-900001', 'IP'], ['DISP-900002', 'IP']] as const) {
      const dir = path.join(corpus, name);
      await mkdir(dir);
      for (const [f, c] of Object.entries(caseFiles(name))) await writeFile(path.join(dir, f), c, 'utf-8');
      await writeFile(
        path.join(dir, 'submitted-rationale.txt'),
        'With respect to good-faith negotiation efforts and contracted rates, the Initiating Party submitted prior EOBs; this consideration was given modest weight. ' +
        'With respect to the acuity of the case, the operating report was given some weight. ' +
        'The provider training and curriculum vitae were given less weight.',
        'utf-8',
      );
      await writeFile(
        path.join(dir, 'decision.json'),
        JSON.stringify({ prevailing_party: pp, factor_checks: { ip: [false, false, true, false, true, true, false], nip: [false, false, true, false, false, false, true] } }),
        'utf-8',
      );
    }

    const { calibration } = await buildCalibration(corpus, {
      libraryPath: libPath,
      outPath: path.join(root, 'calibration.json'),
      now: new Date('2026-07-21T12:00:00Z'),
    });

    expect(calibration.caseCount).toBe(2);
    expect(calibration.outcomes).toEqual({ IP: 2, NIP: 0 });
    expect(calibration.exemplars.length).toBeGreaterThan(0);
    // Weight ladder mined from the real rationale text:
    expect(calibration.weightUsage['5']['modest weight']).toBeGreaterThan(0);
    expect(calibration.weightUsage['3']['some weight']).toBeGreaterThan(0);
    expect(calibration.weightUsage['1']['less weight']).toBeGreaterThan(0);
    // Fingerprint library seeded with observed factor checks:
    const lib = JSON.parse(await readFile(libPath, 'utf-8'));
    const nipTemplate = lib.templates.find((t: { party: string }) => t.party === 'NIP');
    expect(nipTemplate.factorMap).toEqual([3, 7]);
  });
});
