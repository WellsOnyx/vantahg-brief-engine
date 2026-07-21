import { readdir, mkdir, writeFile } from 'fs/promises';
import path from 'path';
import { runCase } from './run-case';
import { loadLibrary, saveLibrary } from './fingerprint';
import type { AnswerSheet } from './types';

/**
 * Batch runner (spec §7 Phase 1): point at a directory whose
 * SUBDIRECTORIES are case folders, run the single-case engine on each,
 * and emit a review queue sorted by confidence — high-confidence cases
 * fly through QA; anything flagged or low-confidence sinks to the
 * full-read pile (the confidence-gating doctrine, same as UM).
 *
 * A case that errors is PARKED with its error (the 'no records found' /
 * sync-lag discipline — park with status, never crash the batch, never
 * guess). The queue file records every parked case so nothing silently
 * disappears — billing reconciliation integrity depends on the queue
 * being a complete account of what went in.
 */

export interface BatchCaseSummary {
  caseId: string;
  folder: string;
  answerSheetPath: string;
  disputeNumber: string | null;
  batch: boolean;
  lineCount: number;
  /** min line confidence; 0 when any line is FLAG */
  gateConfidencePct: number;
  recommendations: Array<{ line: number; recommended: string; confidencePct: number }>;
  flagCodes: string[];
  hasBlockingFlags: boolean;
}

export interface BatchResult {
  root: string;
  generatedAt: string;
  ran: BatchCaseSummary[];
  parked: Array<{ caseId: string; folder: string; error: string }>;
  files: { queueMd: string; queueJson: string };
}

const DEFAULT_CONCURRENCY = 3;

function gateConfidence(sheet: AnswerSheet): number {
  const confs = sheet.recommendations.map((r) => (r.recommended === 'FLAG' ? 0 : r.confidencePct));
  return confs.length ? Math.min(...confs) : 0;
}

export async function runBatch(
  rootFolder: string,
  opts: { outDir?: string; libraryPath?: string; concurrency?: number; now?: Date } = {},
): Promise<BatchResult> {
  const root = path.resolve(rootFolder);
  const now = opts.now ?? new Date();
  const entries = (await readdir(root, { withFileTypes: true }))
    .filter((e) => e.isDirectory() && !e.name.startsWith('.') && !e.name.startsWith('_'))
    .map((e) => e.name)
    .sort();
  if (entries.length === 0) throw new Error(`No case subfolders found in ${root}`);

  const ran: BatchCaseSummary[] = [];
  const parked: BatchResult['parked'] = [];

  // One shared library for the whole batch — loaded once, saved once, so
  // concurrent cases can't clobber each other's auto-registrations.
  const libraryPath = opts.libraryPath ?? path.join(process.cwd(), 'lib', 'idr-engine', 'template-library.json');
  const library = await loadLibrary(libraryPath);

  // Bounded concurrency — the LLM path must not fan out unbounded (same
  // discipline as the brief worker).
  const concurrency = Math.max(1, opts.concurrency ?? DEFAULT_CONCURRENCY);
  let next = 0;
  async function worker() {
    while (next < entries.length) {
      const name = entries[next++];
      const folder = path.join(root, name);
      try {
        const { sheet, files } = await runCase(folder, { library, now });
        ran.push({
          caseId: sheet.caseId,
          folder,
          answerSheetPath: files.markdown,
          disputeNumber: sheet.record.disputeNumber,
          batch: sheet.record.batch,
          lineCount: sheet.record.lines.length,
          gateConfidencePct: gateConfidence(sheet),
          recommendations: sheet.recommendations.map((r) => ({
            line: r.line,
            recommended: r.recommended,
            confidencePct: r.recommended === 'FLAG' ? 0 : r.confidencePct,
          })),
          flagCodes: sheet.flags.map((f) => f.code),
          hasBlockingFlags: sheet.flags.some((f) => f.severity === 'block'),
        });
      } catch (err) {
        parked.push({ caseId: name, folder, error: err instanceof Error ? err.message : String(err) });
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, entries.length) }, worker));
  await saveLibrary(libraryPath, library).catch(() => {});

  // Sort: clean cases by confidence descending; anything with a blocking
  // flag sinks below every clean case regardless of score.
  ran.sort((a, b) => {
    if (a.hasBlockingFlags !== b.hasBlockingFlags) return a.hasBlockingFlags ? 1 : -1;
    return b.gateConfidencePct - a.gateConfidencePct;
  });

  const outDir = opts.outDir ?? path.join(root, '_engine-queue');
  await mkdir(outDir, { recursive: true });
  const queueMd = path.join(outDir, 'queue.md');
  const queueJson = path.join(outDir, 'queue.json');

  const result: BatchResult = { root, generatedAt: now.toISOString(), ran, parked, files: { queueMd, queueJson } };
  await writeFile(queueMd, renderQueueMarkdown(result), 'utf-8');
  await writeFile(
    queueJson,
    JSON.stringify({ DRAFT_FOR_ARBITER_REVIEW: true, ...result, files: undefined }, null, 2),
    'utf-8',
  );
  return result;
}

function renderQueueMarkdown(r: BatchResult): string {
  const L: string[] = [];
  L.push('████ DRAFT FOR ARBITER REVIEW — INTERNAL WORK PRODUCT, NOT FOR DISTRIBUTION. Every case below still needs a human decision; this queue only orders the review work. ████', '');
  L.push(`# Review queue — ${r.root}`);
  L.push(`Generated ${r.generatedAt} · ${r.ran.length} case(s) prepped · ${r.parked.length} parked`);
  L.push('');
  L.push('Work top-down: highest-confidence, unflagged cases first (fastest transcribe-and-decide); blocked/flagged cases need a full read.');
  L.push('');
  L.push('| # | Case | Dispute | Lines | Gate conf. | Recommendation(s) | Flags | Answer sheet |');
  L.push('|---|---|---|---|---|---|---|---|');
  r.ran.forEach((c, i) => {
    const recs = c.recommendations.map((x) => `L${x.line}:${x.recommended}${x.recommended === 'FLAG' ? '' : ` ${x.confidencePct}%`}`).join(' · ');
    const flags = c.flagCodes.length ? c.flagCodes.join(', ') : '—';
    L.push(`| ${i + 1} | ${c.caseId} | ${c.disputeNumber ?? '—'} | ${c.lineCount}${c.batch ? ' (batch)' : ''} | ${c.hasBlockingFlags ? '⛔' : `${c.gateConfidencePct}%`} | ${recs} | ${flags} | ${c.answerSheetPath} |`);
  });
  if (r.parked.length) {
    L.push('', '## Parked (errored — retry after fixing; nothing here was skipped silently)');
    for (const p of r.parked) L.push(`- **${p.caseId}** (${p.folder}): ${p.error}`);
  }
  L.push('');
  return L.join('\n');
}
