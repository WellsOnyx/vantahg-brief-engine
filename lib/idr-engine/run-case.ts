import { readdir, mkdir, writeFile } from 'fs/promises';
import path from 'path';
import { extractPages } from './pdf-text';
import { classifyDocuments } from './classify';
import { extractCaseRecord } from './extract';
import { analyzeFactors } from './factor-analysis';
import { fingerprintBrief, loadLibrary, saveLibrary, type TemplateLibrary } from './fingerprint';
import { recommendLines } from './recommend';
import { renderRationale } from './rationale';
import { buildCoi, buildLogRow, DRAFT_BANNER, renderAnswerSheetMarkdown } from './answer-sheet';
import { renderAnswerSheetHtml } from './answer-sheet-html';
import type { AnswerSheet, EdgeFlag, FingerprintResult } from './types';

/**
 * Phase 0 orchestrator — one case folder in, one answer sheet out
 * (spec §6 stages 1–9, single case). Pure file-in/file-out: reads the
 * folder, writes engine-output/ next to it. No network beyond the
 * Anthropic API (when enabled), no portal contact of any kind.
 */

export interface RunCaseOptions {
  /** Output directory; default <caseFolder>/engine-output */
  outDir?: string;
  /** Template library JSON path; default <repo>/lib/idr-engine/template-library.json */
  libraryPath?: string;
  /**
   * Shared in-memory library (batch runner) — when provided, the caller
   * owns load/persist and concurrent cases can't clobber the JSON file.
   */
  library?: TemplateLibrary;
  now?: Date;
}

export interface RunCaseResult {
  sheet: AnswerSheet;
  outDir: string;
  files: { html: string; markdown: string; json: string; logRow: string };
}

const DOC_EXT = /\.(pdf|txt)$/i;

export async function runCase(caseFolder: string, opts: RunCaseOptions = {}): Promise<RunCaseResult> {
  const caseId = path.basename(path.resolve(caseFolder));
  const now = opts.now ?? new Date();
  const libraryPath = opts.libraryPath ?? path.join(process.cwd(), 'lib', 'idr-engine', 'template-library.json');

  // 1 · Ingest
  const entries = (await readdir(caseFolder, { withFileTypes: true }))
    .filter((e) => e.isFile() && DOC_EXT.test(e.name) && !e.name.startsWith('.'))
    .map((e) => e.name)
    .sort();
  if (entries.length === 0) {
    throw new Error(`No PDF/TXT documents found in ${caseFolder}`);
  }
  const files = await Promise.all(
    entries.map(async (file) => ({ file, pages: await extractPages(path.join(caseFolder, file)) })),
  );

  // 2 · Classify
  const { documents, flags: classifyFlags } = classifyDocuments(files);

  // 3 · Extract
  const record = await extractCaseRecord(caseId, documents);

  // 4 · Fingerprint (stub — §5)
  const library = opts.library ?? (await loadLibrary(libraryPath));
  const exhibitCount = documents.filter((d) => d.kind === 'exhibit').length;
  const fingerprints: FingerprintResult[] = [];
  const fingerprintFlags: EdgeFlag[] = [];
  for (const party of ['ip_brief', 'nip_brief'] as const) {
    const brief = documents.find((d) => d.kind === party);
    if (!brief) continue;
    const { result, flag } = fingerprintBrief(brief, party === 'ip_brief' ? 'IP' : 'NIP', exhibitCount, library, now.toISOString());
    fingerprints.push(result);
    if (flag) fingerprintFlags.push(flag);
  }
  if (!opts.library) {
    await saveLibrary(libraryPath, library).catch(() => {}); // auto-register; read-only FS is fine
  }

  // 5 · Factor analysis
  const { grid, flags: factorFlags } = await analyzeFactors(documents);

  // 6 · Recommend (edge cases surface as flags; blocked lines get FLAG, not a guess)
  const preFlags = [...classifyFlags, ...record.flags, ...fingerprintFlags, ...factorFlags];
  const { recommendations, flags: recFlags } = recommendLines(record, grid, preFlags);
  const flags = [...preFlags, ...recFlags];

  // 7 · Draft rationale
  const rationale = renderRationale(record, grid, recommendations);

  // 8 + 9 · Answer sheet + log row
  const { header: logRowHeader, row: logRow } = buildLogRow(record, recommendations, flags);
  const sheet: AnswerSheet = {
    caseId,
    generatedAt: now.toISOString(),
    draftBanner: DRAFT_BANNER,
    record,
    documents: documents.map(({ file, kind, classificationReason }) => ({ file, kind, classificationReason })),
    coi: buildCoi(record, documents),
    factorGrid: grid,
    rationale,
    recommendations,
    fingerprints,
    flags,
    logRow,
    logRowHeader,
  };

  const outDir = opts.outDir ?? path.join(caseFolder, 'engine-output');
  await mkdir(outDir, { recursive: true });
  const html = path.join(outDir, 'answer-sheet.html'); // the reviewer's artifact (spec v1.1 stage 8)
  const markdown = path.join(outDir, 'answer-sheet.md');
  const json = path.join(outDir, 'answer-sheet.json');
  const logRowFile = path.join(outDir, 'cases-log-row.tsv');
  await writeFile(html, renderAnswerSheetHtml(sheet), 'utf-8');
  await writeFile(markdown, renderAnswerSheetMarkdown(sheet), 'utf-8');
  await writeFile(json, JSON.stringify(comparisonView(sheet), null, 2), 'utf-8');
  await writeFile(logRowFile, `${logRowHeader}\n${logRow}\n`, 'utf-8');

  return { sheet, outDir, files: { html, markdown, json, logRow: logRowFile } };
}

/**
 * The validation view (spec §7 Phase 0): the discrete portal answers,
 * shaped for mechanical side-by-side diff against an arbiter's real
 * completed submission — factor checks as two 7-bool arrays, PP + DLI per
 * line, COI answer, log row.
 */
export function comparisonView(sheet: AnswerSheet) {
  return {
    DRAFT_FOR_ARBITER_REVIEW: true,
    case_id: sheet.caseId,
    dispute_number: sheet.record.disputeNumber,
    generated_at: sheet.generatedAt,
    extraction_mode: sheet.record.extractionMode,
    coi_answer: sheet.coi.answer,
    factor_checks: {
      ip: sheet.factorGrid.ip.map((f) => f.raised),
      nip: sheet.factorGrid.nip.map((f) => f.raised),
    },
    lines: sheet.recommendations.map((r) => {
      const line = sheet.record.lines.find((l) => l.line === r.line);
      return {
        line: r.line,
        cpt: line?.cpt ?? null,
        ip_offer: line?.ipOffer ?? null,
        nip_offer: line?.nipOffer ?? null,
        recommended_pp: r.recommended,
        confidence_pct: r.recommended === 'FLAG' ? null : r.confidencePct,
        dli_chain_to_line: r.dliChainToLine,
      };
    }),
    qpa: sheet.record.qpa,
    flags: sheet.flags.map((f) => ({ code: f.code, severity: f.severity, line: f.line ?? null })),
    fingerprints: sheet.fingerprints.map((f) => ({ file: f.file, status: f.status, template_id: f.templateId })),
    rationale: sheet.rationale,
    log_row: sheet.logRow,
    full_sheet: undefined, // the markdown is the human artifact; this JSON is the diff artifact
  };
}
