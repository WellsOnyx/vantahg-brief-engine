import { readdir, mkdir, readFile, writeFile } from 'fs/promises';
import crypto from 'crypto';
import path from 'path';
import { extractPages } from './pdf-text';
import { classifyDocuments, detectEligibilityObjection } from './classify';
import { extractCaseRecord } from './extract';
import { analyzeFactors } from './factor-analysis';
import { fingerprintBrief, loadLibrary, saveLibrary, type TemplateLibrary } from './fingerprint';
import { recommendLines } from './recommend';
import { renderRationale, buildRationaleSections } from './rationale';
import { FACTORS, PORTAL_ROW_MARKERS } from './factors';
import { buildCoi, buildLogRow, DRAFT_BANNER, renderAnswerSheetMarkdown } from './answer-sheet';
import { renderAnswerSheetHtml } from './answer-sheet-html';
import { assertSafeOutputTarget, defaultOutputRoot } from './output-guard';
import type { AnswerSheet, CaseDocument, EdgeFlag, EligibilityNote, FingerprintResult, Party, PriorDetermination } from './types';

/**
 * Phase 0 orchestrator — one case folder in, one answer sheet out
 * (spec §6 stages 1–9, single case). Pure file-in/file-out: reads the
 * folder, writes engine-output/ next to it. No network beyond the
 * Anthropic API (when enabled), no portal contact of any kind.
 */

export interface RunCaseOptions {
  /**
   * Output directory — ALWAYS outside the input folder (read-only-input
   * doctrine, see output-guard.ts). Default: <Desktop/engine-output>/<caseId>.
   */
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

const TEXT_EXT = /\.(pdf|txt)$/i;

/** Parse a staff eligibility-notes export: one note per line, optionally `username <tab|pipe> date <tab|pipe> note`. */
function parseEligibilityNotes(text: string): EligibilityNote[] {
  return text
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split(/\t|\s*\|\s*/);
      if (parts.length >= 3) return { username: parts[0] || null, date: parts[1] || null, note: parts.slice(2).join(' ') };
      return { username: null, date: null, note: line };
    });
}

export async function runCase(caseFolder: string, opts: RunCaseOptions = {}): Promise<RunCaseResult> {
  const caseId = path.basename(path.resolve(caseFolder));
  const now = opts.now ?? new Date();
  const libraryPath = opts.libraryPath ?? path.join(process.cwd(), 'lib', 'idr-engine', 'template-library.json');

  // READ-ONLY INPUT: every write target must live outside the input folder
  // (and outside OneDrive). Checked before anything is read or written.
  const outDir = opts.outDir ?? path.join(defaultOutputRoot(), caseId);
  assertSafeOutputTarget(outDir, [caseFolder]);
  if (!opts.library) assertSafeOutputTarget(libraryPath, [caseFolder], 'template-library file');

  // 1 · Ingest — inventory EVERY file (real folders run to ~60); extract
  // text from searchable PDFs/TXT, classify the rest by filename alone.
  const entries = (await readdir(caseFolder, { withFileTypes: true }))
    .filter((e) => e.isFile() && !e.name.startsWith('.'))
    .map((e) => e.name)
    .sort();
  if (entries.filter((f) => TEXT_EXT.test(f)).length === 0) {
    throw new Error(`No PDF/TXT documents found in ${caseFolder}`);
  }
  const allFiles = await Promise.all(
    entries.map(async (file) => ({
      file,
      bytes: await readFile(path.join(caseFolder, file)),
      pages: TEXT_EXT.test(file) ? await extractPages(path.join(caseFolder, file)) : [],
    })),
  );

  // Duplicate files deduped by CONTENT (field intel guard): identical
  // bytes under different names — keep the first, exclude the rest from
  // analysis, list them in the inventory as duplicates.
  const seenHashes = new Map<string, string>();
  const files: Array<{ file: string; pages: typeof allFiles[number]['pages'] }> = [];
  const duplicateDocs: CaseDocument[] = [];
  for (const f of allFiles) {
    const hash = crypto.createHash('sha256').update(f.bytes).digest('hex');
    const firstSeen = seenHashes.get(hash);
    if (firstSeen) {
      duplicateDocs.push({ file: f.file, kind: 'duplicate', pages: [], classificationReason: `identical content to ${firstSeen}` });
      continue;
    }
    seenHashes.set(hash, f.file);
    files.push({ file: f.file, pages: f.pages });
  }

  // 2 · Classify (+ eligibility-objection detection — field intel §3)
  const { documents: classified, flags: classifyFlags } = classifyDocuments(files);
  const documents = [...classified, ...duplicateDocs];

  const nipBrief = classified.find((d) => d.kind === 'nip_brief');
  const isObjection = detectEligibilityObjection(nipBrief);
  if (isObjection) {
    classifyFlags.unshift({
      code: 'ELIGIBILITY_OBJECTION',
      severity: 'block',
      message:
        'The NIP submission is an eligibility OBJECTION letter, not a merits brief. CHECK THE STAFF ELIGIBILITY NOTES FIRST — ' +
        'if no eligibility ruling is recorded, SEND THE CASE BACK rather than deciding the merits.',
    });
  }

  // Prior determinations parsed as exhibits — outcomes + dates (field intel guard).
  const priorDeterminations: PriorDetermination[] = classified
    .filter((d) => d.kind === 'prior_determination')
    .map((d) => {
      const text = d.pages.map((p) => p.text).join('\n');
      const outcome: Party | null = /non-initiating party(?:'s)? (?:offer is selected|has presented sufficient)/i.test(text)
        ? 'NIP'
        : /initiating party(?:'s)? (?:offer is selected|has presented sufficient)/i.test(text)
          ? 'IP'
          : null;
      const date = text.match(/\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/)?.[0] ?? text.match(/\b\d{4}-\d{2}-\d{2}\b/)?.[0] ?? null;
      return { file: d.file, outcome, date };
    });

  // 3 · Extract
  const record = await extractCaseRecord(caseId, documents);

  // 4 · Fingerprint (§5) — three-dimensional library (field intel §4):
  // provider_side (IP), payer_vendor (NIP merits), eligibility_objection
  // (NIP objection letters). Dimensions never cross-match.
  const library = opts.library ?? (await loadLibrary(libraryPath));
  const exhibitCount = documents.filter((d) => d.kind === 'exhibit').length;
  const fingerprints: FingerprintResult[] = [];
  const fingerprintFlags: EdgeFlag[] = [];
  for (const kind of ['ip_brief', 'nip_brief'] as const) {
    const brief = classified.find((d) => d.kind === kind);
    if (!brief) continue;
    const party = kind === 'ip_brief' ? 'IP' : 'NIP';
    const category = party === 'IP' ? 'provider_side' : isObjection ? 'eligibility_objection' : 'payer_vendor';
    const { result, flag } = fingerprintBrief(brief, party, exhibitCount, library, now.toISOString(), category);
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
  const sections = buildRationaleSections(record, grid, recommendations);
  const rationalePaste = [sections.p2_standard, sections.ip_discussion, sections.nip_discussion, sections.close].join('\n\n');

  // 8 + 9 · Answer sheet + log row
  const { header: logRowHeader, row: logRow } = buildLogRow(record, recommendations, flags);
  const eligibilityNotes = documents
    .filter((d) => d.kind === 'eligibility_notes')
    .flatMap((d) => parseEligibilityNotes(d.pages.map((p) => p.text).join('\n')));
  const sheet: AnswerSheet = {
    caseId,
    generatedAt: now.toISOString(),
    draftBanner: DRAFT_BANNER,
    record,
    eligibilityNotes,
    priorDeterminations,
    documents: documents.map(({ file, kind, classificationReason }) => ({ file, kind, classificationReason })),
    coi: buildCoi(record, documents),
    factorGrid: grid,
    rationale,
    rationalePaste,
    recommendations,
    fingerprints,
    flags,
    logRow,
    logRowHeader,
  };

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
        fh_50th_percentile: line?.fhBenchmark ?? null,
        recommended_pp: r.recommended,
        confidence_pct: r.recommended === 'FLAG' ? null : r.confidencePct,
        dli_chain_to_line: r.dliChainToLine,
      };
    }),
    qpa: sheet.record.qpa,
    // Section-by-section for the blind-validation diff (first target:
    // DISP-5552798) — compare factor checks, PP, and each rationale
    // section independently against the ground-truth submission.
    rationale_sections: buildRationaleSections(sheet.record, sheet.factorGrid, sheet.recommendations),
    // The portal-assist payload: everything the in-workspace bookmarklet
    // needs to pre-fill the CURRENT portal screen. It never includes DLI
    // numbers or attestation values — those are human-only by doctrine.
    portal_fill: {
      version: 1,
      coi: 'no_to_all_questions',
      factor_rows: FACTORS.map((f) => ({
        factor: f.factor,
        markers: PORTAL_ROW_MARKERS[f.factor],
        ip: sheet.factorGrid.ip.find((x) => x.factor === f.factor)?.raised ?? false,
        nip: sheet.factorGrid.nip.find((x) => x.factor === f.factor)?.raised ?? false,
      })),
      rationale_paste: sheet.rationalePaste,
      lines: sheet.recommendations.map((r) => ({
        line: r.line,
        recommended_pp: r.recommended,
        dli_chain_to_line: r.dliChainToLine,
      })),
      decided_party: (() => {
        const parties = new Set(
          sheet.recommendations.filter((r) => r.recommended === 'IP' || r.recommended === 'NIP').map((r) => r.recommended),
        );
        return parties.size === 1 ? [...parties][0] : null;
      })(),
    },
    flags: sheet.flags.map((f) => ({ code: f.code, severity: f.severity, line: f.line ?? null })),
    fingerprints: sheet.fingerprints.map((f) => ({ file: f.file, status: f.status, template_id: f.templateId })),
    rationale: sheet.rationale,
    log_row: sheet.logRow,
    full_sheet: undefined, // the markdown is the human artifact; this JSON is the diff artifact
  };
}
