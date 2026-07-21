import { readFile } from 'fs/promises';
import path from 'path';

/**
 * Blind-validation diff — compare an engine answer-sheet.json against a
 * captured ground-truth submission (first target: DISP-5552798).
 *
 *   npx tsx scripts/idr-compare.ts <engine answer-sheet.json> <ground-truth.json>
 *
 * Ground-truth shape:
 *   {
 *     "prevailing_party": "IP" | "NIP",            // or per-line: {"1":"IP","2":"NIP"}
 *     "factor_checks": { "ip": [7 bools], "nip": [7 bools] },
 *     "rationale_sections": { "p2_standard": "...", "ip_discussion": "...",
 *                              "nip_discussion": "...", "close": "..." }   // any subset
 *   }
 *
 * Reports factor checks per party, prevailing party per line, and
 * rationale content section-by-section (token-overlap similarity).
 */

interface GroundTruth {
  prevailing_party?: string | Record<string, string>;
  factor_checks?: { ip?: boolean[]; nip?: boolean[] };
  rationale_sections?: Record<string, string>;
}

function tokens(s: string): Set<string> {
  return new Set(s.toLowerCase().split(/[^a-z0-9%$.]+/).filter((t) => t.length > 2));
}

function similarityPct(a: string, b: string): number {
  const ta = tokens(a);
  const tb = tokens(b);
  if (ta.size === 0 && tb.size === 0) return 100;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  return Math.round((100 * inter) / (ta.size + tb.size - inter));
}

async function main() {
  const [enginePath, truthPath] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  if (!enginePath || !truthPath) {
    console.error('Usage: npx tsx scripts/idr-compare.ts <engine answer-sheet.json> <ground-truth.json>');
    process.exit(2);
  }
  const engine = JSON.parse(await readFile(path.resolve(enginePath), 'utf-8'));
  const truth = JSON.parse(await readFile(path.resolve(truthPath), 'utf-8')) as GroundTruth;

  let mismatches = 0;
  const say = (ok: boolean, label: string, detail: string) => {
    if (!ok) mismatches++;
    console.log(`  ${ok ? '✓' : '✗'} ${label}: ${detail}`);
  };

  console.log(`\nComparing ${engine.case_id ?? enginePath} against ground truth\n`);

  // 1 · Factor checks per party
  console.log('Factor checks:');
  for (const side of ['ip', 'nip'] as const) {
    const truthChecks = truth.factor_checks?.[side];
    const engineChecks: boolean[] = engine.factor_checks?.[side] ?? [];
    if (!truthChecks) {
      console.log(`  – ${side.toUpperCase()}: no ground truth provided`);
      continue;
    }
    for (let i = 0; i < 7; i++) {
      const ok = Boolean(engineChecks[i]) === Boolean(truthChecks[i]);
      say(ok, `${side.toUpperCase()} factor ${i + 1}`, ok ? (engineChecks[i] ? 'checked' : 'unchecked') : `engine=${Boolean(engineChecks[i])} truth=${Boolean(truthChecks[i])}`);
    }
  }

  // 2 · Prevailing party per line
  console.log('\nPrevailing party:');
  const perLineTruth = typeof truth.prevailing_party === 'object' ? truth.prevailing_party : null;
  for (const line of engine.lines ?? []) {
    const expected = perLineTruth ? perLineTruth[String(line.line)] : (truth.prevailing_party as string | undefined);
    if (!expected) {
      console.log(`  – line ${line.line}: no ground truth provided`);
      continue;
    }
    const got = line.recommended_pp;
    say(got === expected, `line ${line.line}`, got === expected ? String(got) : `engine=${got} truth=${expected}${got === 'FLAG' ? ' (engine declined to recommend — check flags)' : ''}`);
  }

  // 3 · Rationale section-by-section
  console.log('\nRationale sections (token-overlap similarity):');
  const engineSections: Record<string, string> = engine.rationale_sections ?? {};
  for (const [section, truthText] of Object.entries(truth.rationale_sections ?? {})) {
    const engineText = engineSections[section];
    if (typeof engineText !== 'string') {
      say(false, section, 'missing from engine output');
      continue;
    }
    const sim = similarityPct(engineText, truthText);
    say(sim >= 70, section, `${sim}% similar${sim < 70 ? ' — read both versions side by side' : ''}`);
  }
  if (!truth.rationale_sections) console.log('  – no rationale ground truth provided');

  console.log(`\n${mismatches === 0 ? 'MATCH — no mismatches against the provided ground truth.' : `${mismatches} mismatch(es) — review above before trusting the engine on live cases.`}\n`);
  process.exit(mismatches === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('idr-compare failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
