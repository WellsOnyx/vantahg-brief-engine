import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtemp, writeFile, readFile, mkdir } from 'fs/promises';
import { tmpdir } from 'os';
import path from 'path';
import { runBatch } from '@/lib/idr-engine/run-batch';

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

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'idr-batch-'));
  libPath = path.join(root, 'lib.json');
});

async function writeCase(name: string, files: Record<string, string>) {
  const dir = path.join(root, name);
  await mkdir(dir);
  for (const [f, c] of Object.entries(files)) await writeFile(path.join(dir, f), c, 'utf-8');
}

describe('runBatch', () => {
  it('runs every case folder, sorts clean-by-confidence with blocked at the bottom, parks empty folders', async () => {
    await writeCase('DISP-000001', caseFiles('DISP-000001'));
    await writeCase('DISP-000002', caseFiles('DISP-000002', { identicalOffers: true })); // → blocking flag
    await writeCase('DISP-000003', caseFiles('DISP-000003'));
    await mkdir(path.join(root, 'DISP-000004')); // empty → parked, not dropped

    const result = await runBatch(root, { libraryPath: libPath, now: new Date('2026-07-21T12:00:00Z') });

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
    const sheet = await readFile(path.join(root, 'DISP-000001', 'engine-output', 'answer-sheet.md'), 'utf-8');
    expect(sheet).toContain('DRAFT FOR ARBITER REVIEW');
  });

  it('shares one template library across the batch: identical NIP template re-used across cases registers once', async () => {
    await writeCase('DISP-000010', caseFiles('DISP-000010'));
    await writeCase('DISP-000011', caseFiles('DISP-000011'));
    await runBatch(root, { libraryPath: libPath, concurrency: 1 });
    const lib = JSON.parse(await readFile(libPath, 'utf-8'));
    // Two briefs per case (IP + NIP), same shells across both cases → 2 templates, each seen twice.
    expect(lib.templates).toHaveLength(2);
    expect(lib.templates.every((t: { seenCount: number }) => t.seenCount === 2)).toBe(true);
  });
});
