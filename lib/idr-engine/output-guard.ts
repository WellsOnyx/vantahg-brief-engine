import os from 'os';
import path from 'path';
import { existsSync } from 'fs';

/**
 * READ-ONLY INPUT DOCTRINE (Cole's rule, hard):
 *
 * The OneDrive/shared case folders are synced to EVERY workspace on the
 * team. The engine treats any input case folder as STRICTLY READ-ONLY —
 * it never writes, unzips, renames, moves, or deletes anything inside an
 * input folder or anywhere under a OneDrive-synced tree. Everything the
 * engine produces (answer sheets, queues, unzipped case files, libraries,
 * logs) goes to a separate LOCAL output folder outside the synced tree.
 *
 * Enforced here, not by convention: every write path is routed through
 * assertSafeOutputTarget(), which refuses to run when a write target is
 * inside the input folder or inside any OneDrive path. A dedicated test
 * (same pattern as the artifact leak test) proves an engine run leaves
 * the input tree byte-for-byte untouched.
 */

/** Default local output root: Desktop/engine-output (configurable via IDR_OUTPUT_DIR). */
export function defaultOutputRoot(): string {
  const env = process.env.IDR_OUTPUT_DIR?.trim();
  if (env) return path.resolve(env);
  const desktop = path.join(os.homedir(), 'Desktop');
  return path.join(existsSync(desktop) ? desktop : os.homedir(), 'engine-output');
}

function isInside(child: string, parent: string): boolean {
  const rel = path.relative(path.resolve(parent), path.resolve(child));
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

function looksLikeOneDrive(p: string): boolean {
  return /(^|[\\/])onedrive[^\\/]*([\\/]|$)/i.test(path.resolve(p));
}

/**
 * Refuse a write target that would violate the read-only doctrine:
 * inside any of the given input folders, or anywhere under OneDrive.
 * Call BEFORE the first write of a run.
 */
export function assertSafeOutputTarget(target: string, inputDirs: string[], label = 'output folder'): void {
  for (const input of inputDirs) {
    if (isInside(target, input)) {
      throw new Error(
        `READ-ONLY INPUT: refusing to run — the ${label} (${path.resolve(target)}) is inside the input folder ` +
        `(${path.resolve(input)}). Input case folders are synced/shared and must never be written to. ` +
        `Use an output folder outside the synced tree (default: ${defaultOutputRoot()}; override with --out or IDR_OUTPUT_DIR).`,
      );
    }
  }
  if (looksLikeOneDrive(target)) {
    throw new Error(
      `READ-ONLY INPUT: refusing to run — the ${label} (${path.resolve(target)}) is inside a OneDrive-synced tree. ` +
      `Everything the engine writes must stay local and un-synced. ` +
      `Use an output folder outside OneDrive (default: ${defaultOutputRoot()}; override with --out or IDR_OUTPUT_DIR).`,
    );
  }
}
