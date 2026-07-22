import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtemp, writeFile, mkdir, readdir, stat } from 'fs/promises';
import { execFileSync } from 'child_process';
import { tmpdir } from 'os';
import path from 'path';
import { runCase } from '@/lib/idr-engine/run-case';
import { runBatch } from '@/lib/idr-engine/run-batch';
import { buildCalibration } from '@/lib/idr-engine/calibrate';
import { assertSafeOutputTarget, defaultOutputRoot } from '@/lib/idr-engine/output-guard';

/**
 * READ-ONLY INPUT doctrine (Cole's rule, hard): input case folders are
 * OneDrive-synced to every workspace — the engine must never write,
 * unzip, rename, move, or delete ANYTHING inside an input folder or
 * under OneDrive. Same enforcement pattern as the artifact leak test:
 * the guard refuses unsafe targets, and a full run is proven to leave
 * the input tree byte-for-byte untouched.
 */

const CASE_FILES: Record<string, string> = {
  'ip-notice-of-offer.txt': 'NOTICE OF OFFER — INITIATING PARTY\nDispute number DISP-770001. Line 1 final payment offer: $1,150.00.',
  'nip-notice-of-offer.txt': 'NOTICE OF OFFER — NON-INITIATING PARTY\nDispute DISP-770001. The qualifying payment amount (QPA) is $400.00. Line 1 final payment offer: $450.00.',
  'ip-brief.txt': 'ARBITRATION BRIEF OF THE INITIATING PARTY\nThe payer previously paid more under the prior contracted rate in good faith negotiations, per the EOB in Exhibit A.\nThe acuity was high per the operative report.',
  'nip-brief.txt': 'ARBITRATION BRIEF — NON-INITIATING PARTY\nThe QPA already accounts for acuity and the qualifying payment amount is appropriate.',
  'exhibit-a.txt': 'EXHIBIT A — EXPLANATION OF BENEFITS. Paid amount $1,050.00.',
};

/** Recursive snapshot: every path with size + mtime — any write anywhere in the tree changes it. */
async function snapshotTree(dir: string): Promise<string[]> {
  const out: string[] = [];
  async function walk(d: string) {
    for (const e of (await readdir(d, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      const p = path.join(d, e.name);
      const s = await stat(p);
      out.push(`${path.relative(dir, p)}|${e.isDirectory() ? 'dir' : s.size}|${s.mtimeMs}`);
      if (e.isDirectory()) await walk(p);
    }
  }
  await walk(dir);
  return out;
}

let base: string;
let inputRoot: string;
let outRoot: string;
let libPath: string;

beforeEach(async () => {
  base = await mkdtemp(path.join(tmpdir(), 'idr-ro-'));
  inputRoot = path.join(base, 'synced-cases');
  outRoot = path.join(base, 'local-out');
  libPath = path.join(base, 'lib.json');
  await mkdir(inputRoot);
});

async function writeCase(name: string) {
  const dir = path.join(inputRoot, name);
  await mkdir(dir);
  for (const [f, c] of Object.entries(CASE_FILES)) await writeFile(path.join(dir, f), c, 'utf-8');
  return dir;
}

describe('output guard refusals', () => {
  it('refuses an output folder inside the input folder (and the old in-folder default)', async () => {
    const caseDir = await writeCase('DISP-770001');
    await expect(runCase(caseDir, { outDir: path.join(caseDir, 'engine-output'), libraryPath: libPath }))
      .rejects.toThrow(/READ-ONLY INPUT/);
    await expect(runCase(caseDir, { outDir: caseDir, libraryPath: libPath })).rejects.toThrow(/READ-ONLY INPUT/);
    await expect(runBatch(inputRoot, { outDir: path.join(inputRoot, '_engine-queue'), libraryPath: libPath }))
      .rejects.toThrow(/READ-ONLY INPUT/);
  });

  it('refuses any write target under a OneDrive tree', async () => {
    const caseDir = await writeCase('DISP-770001');
    const oneDriveOut = path.join(base, 'OneDrive - iMPROve documents', 'out');
    await expect(runCase(caseDir, { outDir: oneDriveOut, libraryPath: libPath })).rejects.toThrow(/OneDrive/);
    expect(() => assertSafeOutputTarget(path.join(base, 'onedrive', 'x'), [])).toThrow(/OneDrive/);
    // A template-library write target inside the input is refused too.
    await expect(runCase(caseDir, { outDir: path.join(outRoot, 'c'), libraryPath: path.join(caseDir, 'lib.json') }))
      .rejects.toThrow(/READ-ONLY INPUT/);
    // Calibration writes are guarded the same way.
    await expect(buildCalibration(inputRoot, { libraryPath: path.join(inputRoot, 'lib.json'), outPath: path.join(outRoot, 'cal.json') }))
      .rejects.toThrow(/READ-ONLY INPUT/);
  });

  it('refuses before anything is read or written — the input stays untouched even on refusal', async () => {
    const caseDir = await writeCase('DISP-770001');
    const before = await snapshotTree(inputRoot);
    await expect(runCase(caseDir, { outDir: caseDir, libraryPath: libPath })).rejects.toThrow();
    expect(await snapshotTree(inputRoot)).toEqual(before);
  });

  it('default output root lives outside any input and honors IDR_OUTPUT_DIR', () => {
    expect(defaultOutputRoot()).not.toContain(inputRoot);
    process.env.IDR_OUTPUT_DIR = path.join(base, 'custom-out');
    try {
      expect(defaultOutputRoot()).toBe(path.join(base, 'custom-out'));
    } finally {
      delete process.env.IDR_OUTPUT_DIR;
    }
  });
});

describe('input tree is byte-for-byte untouched by a full run', () => {
  it('single case: all artifacts land in the output folder; input snapshot identical', async () => {
    const caseDir = await writeCase('DISP-770001');
    const before = await snapshotTree(inputRoot);

    const { files, outDir } = await runCase(caseDir, { outDir: path.join(outRoot, 'DISP-770001'), libraryPath: libPath });

    expect(await snapshotTree(inputRoot)).toEqual(before); // THE rule
    for (const f of Object.values(files)) {
      expect(f.startsWith(path.join(outRoot, 'DISP-770001'))).toBe(true);
    }
    expect(outDir.startsWith(outRoot)).toBe(true);
  });

  it('batch with ZIP input: unzip + queue + sheets all land in the output tree; input snapshot identical', async () => {
    const caseDir = await writeCase('DISP-770002');
    execFileSync('zip', ['-q', '-j', path.join(inputRoot, 'DISP-770003.zip'),
      ...Object.keys(CASE_FILES).map((f) => path.join(caseDir, f))]);
    const before = await snapshotTree(inputRoot);

    const result = await runBatch(inputRoot, { outDir: outRoot, libraryPath: libPath });

    expect(await snapshotTree(inputRoot)).toEqual(before); // zips read, never extracted in place
    expect(result.ran).toHaveLength(2);
    expect(result.files.queueMd.startsWith(outRoot)).toBe(true);
    for (const c of result.ran) expect(c.answerSheetPath.startsWith(outRoot)).toBe(true);
    // The unzipped copy exists in the OUTPUT tree only.
    const unzipped = await readdir(path.join(outRoot, '_unzipped', 'DISP-770003'));
    expect(unzipped.length).toBeGreaterThan(0);
  });

  it('calibration corpus is read-only too', async () => {
    const dir = await writeCase('DISP-770004');
    await writeFile(path.join(dir, 'submitted-rationale.txt'), 'The negotiation evidence was given modest weight.', 'utf-8');
    const before = await snapshotTree(inputRoot);
    await buildCalibration(inputRoot, { libraryPath: libPath, outPath: path.join(outRoot, 'cal.json') });
    expect(await snapshotTree(inputRoot)).toEqual(before);
  });
});
