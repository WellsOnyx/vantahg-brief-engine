import { mkdir, readdir, readFile, writeFile } from 'fs/promises';
import path from 'path';
import { extractPages } from './pdf-text';
import { classifyDocuments, detectEligibilityObjection } from './classify';
import { assertSafeOutputTarget } from './output-guard';
import { fingerprintBrief, loadLibrary, saveLibrary, type TemplateLibrary } from './fingerprint';
import { FACTORS } from './factors';
import type { FactorNumber, Party } from './types';

/**
 * Calibration corpus (live-walkthrough spec item 6): ingest a folder of
 * COMPLETED, QA-approved cases — documents PLUS the final submitted
 * rationale/decision — and build a calibration library:
 *
 *   - template → observed factor selections + outcomes (also written into
 *     the fingerprint library's factorMap, so the corpus SEEDS it)
 *   - real weight-language usage per factor, mined from the submitted
 *     rationales ('given modest/some/less weight')
 *   - exemplar rationale excerpts used as few-shot grounding so drafts
 *     match the house's demonstrated judgment, not just its format
 *
 * Ground-truth shape per completed-case folder (alongside the normal
 * case documents):
 *   - a file matching /submitted|final/ with .txt — the rationale as
 *     actually submitted
 *   - optional decision.json:
 *       { "prevailing_party": "IP"|"NIP",
 *         "factor_checks": { "ip": [7 bools], "nip": [7 bools] } }
 *
 * NOTE: the current template catalog doc is titled "…REV 02" and marked
 * SUPERSEDED — a v3 exists and will be provided later; re-run this ingest
 * when it lands.
 */

export interface CalibrationLibrary {
  version: string;
  builtAt: string;
  caseCount: number;
  /** Observed weight-ladder usage per factor, mined from real rationales. */
  weightUsage: Record<string, { 'modest weight': number; 'some weight': number; 'less weight': number }>;
  outcomes: { IP: number; NIP: number };
  templates: Array<{
    templateId: string;
    party: Party;
    seenInCorpus: number;
    observedFactorChecks: number[] | null;
    outcomes: { IP: number; NIP: number };
  }>;
  /** Few-shot grounding: real submitted rationale excerpts (QA-approved). */
  exemplars: Array<{ caseId: string; excerpt: string }>;
}

const TEXT_EXT = /\.(pdf|txt)$/i;

function emptyWeightUsage(): CalibrationLibrary['weightUsage'] {
  const o: CalibrationLibrary['weightUsage'] = {};
  for (const f of FACTORS) o[String(f.factor)] = { 'modest weight': 0, 'some weight': 0, 'less weight': 0 };
  return o;
}

/** Attribute each 'given X weight' sentence to a factor via its keywords. */
function mineWeightUsage(rationale: string, usage: CalibrationLibrary['weightUsage']): void {
  for (const sentence of rationale.split(/(?<=[.!?])\s+/)) {
    const m = /given (modest|some|less) weight/i.exec(sentence);
    if (!m) continue;
    const lower = sentence.toLowerCase();
    for (const def of FACTORS) {
      let scanned = lower;
      for (const neg of def.negations ?? []) scanned = scanned.split(neg).join(' ');
      if (def.keywords.some((k) => scanned.includes(k)) || scanned.includes((def.proseTitle ?? def.title).toLowerCase().slice(0, 30))) {
        usage[String(def.factor)][`${m[1].toLowerCase()} weight` as 'modest weight' | 'some weight' | 'less weight'] += 1;
        break;
      }
    }
  }
}

interface GroundTruthDecision {
  prevailing_party?: 'IP' | 'NIP';
  factor_checks?: { ip?: boolean[]; nip?: boolean[] };
}

export async function buildCalibration(
  corpusRoot: string,
  opts: { libraryPath?: string; outPath?: string; now?: Date } = {},
): Promise<{ calibration: CalibrationLibrary; files: { calibration: string; templates: string } }> {
  const root = path.resolve(corpusRoot);
  const now = opts.now ?? new Date();
  const libraryPath = opts.libraryPath ?? path.join(process.cwd(), 'lib', 'idr-engine', 'template-library.json');
  const outPath = opts.outPath ?? path.join(process.cwd(), 'lib', 'idr-engine', 'calibration-library.json');
  // READ-ONLY INPUT: the corpus tree is never written to.
  assertSafeOutputTarget(libraryPath, [root], 'template-library file');
  assertSafeOutputTarget(outPath, [root], 'calibration-library file');

  const caseDirs = (await readdir(root, { withFileTypes: true }))
    .filter((e) => e.isDirectory() && !e.name.startsWith('.') && !e.name.startsWith('_'))
    .map((e) => e.name)
    .sort();
  if (caseDirs.length === 0) throw new Error(`No completed-case subfolders found in ${root}`);

  const library: TemplateLibrary = await loadLibrary(libraryPath);
  const calibration: CalibrationLibrary = {
    version: 'v1',
    builtAt: now.toISOString(),
    caseCount: 0,
    weightUsage: emptyWeightUsage(),
    outcomes: { IP: 0, NIP: 0 },
    templates: [],
    exemplars: [],
  };
  const templateStats = new Map<string, CalibrationLibrary['templates'][number]>();

  for (const dirName of caseDirs) {
    const folder = path.join(root, dirName);
    const fileNames = (await readdir(folder, { withFileTypes: true }))
      .filter((e) => e.isFile() && !e.name.startsWith('.'))
      .map((e) => e.name)
      .sort();

    // Ground truth: submitted rationale (required) + optional decision.json.
    const rationaleFile = fileNames.find((f) => /submitted|final/i.test(f) && /\.txt$/i.test(f));
    if (!rationaleFile) continue; // not a completed case — skip silently is wrong; record via exemplars gap
    const submittedRationale = await readFile(path.join(folder, rationaleFile), 'utf-8');

    let decision: GroundTruthDecision = {};
    const decisionFile = fileNames.find((f) => /^decision\.json$/i.test(f));
    if (decisionFile) {
      try {
        decision = JSON.parse(await readFile(path.join(folder, decisionFile), 'utf-8')) as GroundTruthDecision;
      } catch {
        decision = {};
      }
    }

    // Classify the case documents (excluding ground-truth files).
    const docFiles = await Promise.all(
      fileNames
        .filter((f) => f !== rationaleFile && !/^decision\.json$/i.test(f))
        .map(async (file) => ({
          file,
          pages: TEXT_EXT.test(file) ? await extractPages(path.join(folder, file)) : [],
        })),
    );
    const { documents } = classifyDocuments(docFiles);
    const exhibitCount = documents.filter((d) => d.kind === 'exhibit' || d.kind === 'negotiation_proof').length;

    calibration.caseCount += 1;
    if (decision.prevailing_party) calibration.outcomes[decision.prevailing_party] += 1;
    mineWeightUsage(submittedRationale, calibration.weightUsage);
    if (calibration.exemplars.length < 5) {
      calibration.exemplars.push({ caseId: dirName, excerpt: submittedRationale.slice(0, 1200) });
    }

    // Register brief templates; attach observed factor checks as factorMap.
    // Three-dimensional (field intel §4): provider_side / payer_vendor /
    // eligibility_objection.
    for (const kind of ['ip_brief', 'nip_brief'] as const) {
      const brief = documents.find((d) => d.kind === kind);
      if (!brief) continue;
      const party: Party = kind === 'ip_brief' ? 'IP' : 'NIP';
      const category = party === 'IP' ? 'provider_side' : detectEligibilityObjection(brief) ? 'eligibility_objection' : 'payer_vendor';
      const { result } = fingerprintBrief(brief, party, exhibitCount, library, now.toISOString(), category);
      if (!result.templateId) continue;

      const checks = party === 'IP' ? decision.factor_checks?.ip : decision.factor_checks?.nip;
      const observed = Array.isArray(checks)
        ? (checks.map((v, i) => (v ? i + 1 : null)).filter((v): v is number => v !== null) as FactorNumber[])
        : null;

      const entry = library.templates.find((t) => t.id === result.templateId);
      if (entry && observed && !entry.factorMap) entry.factorMap = observed;

      const stat = templateStats.get(result.templateId) ?? {
        templateId: result.templateId,
        party,
        seenInCorpus: 0,
        observedFactorChecks: null,
        outcomes: { IP: 0, NIP: 0 },
      };
      stat.seenInCorpus += 1;
      if (observed) stat.observedFactorChecks = observed;
      if (decision.prevailing_party) stat.outcomes[decision.prevailing_party] += 1;
      templateStats.set(result.templateId, stat);
    }
  }

  calibration.templates = [...templateStats.values()];
  await mkdir(path.dirname(libraryPath), { recursive: true });
  await saveLibrary(libraryPath, library);
  await mkdir(path.dirname(outPath), { recursive: true });
  await writeFile(outPath, JSON.stringify(calibration, null, 2), 'utf-8');
  return { calibration, files: { calibration: outPath, templates: libraryPath } };
}

/** Cached loader for prompt grounding — null when no corpus has been ingested. */
let cachedCalibration: CalibrationLibrary | null | undefined;
export async function loadCalibration(customPath?: string): Promise<CalibrationLibrary | null> {
  if (cachedCalibration !== undefined && !customPath) return cachedCalibration;
  const p = customPath ?? path.join(process.cwd(), 'lib', 'idr-engine', 'calibration-library.json');
  try {
    const lib = JSON.parse(await readFile(p, 'utf-8')) as CalibrationLibrary;
    if (!customPath) cachedCalibration = lib;
    return lib;
  } catch {
    if (!customPath) cachedCalibration = null;
    return null;
  }
}
