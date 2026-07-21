import type { CaseRecord, EdgeFlag, FactorGrid, LineRecommendation, Party } from './types';

/**
 * Stage 6 — Recommend (spec §6): per line, recommended prevailing party +
 * confidence %, anchored on factor 5 (good-faith/contracted rates — WINS
 * CASES) then factor 3 (acuity). NEVER auto-final: any blocking edge case
 * on a line replaces the recommendation with FLAG, and the sheet says so
 * out loud. Decisions are per line, baseball-style — IP's offer or NIP's,
 * no splitting.
 */

const ANCHOR_WEIGHTS: Record<number, number> = {
  5: 5, // importance #1
  3: 3, // importance #2
  1: 1,
  2: 1,
  4: 1,
  6: 0.5, // nearly always checked for both — low signal
  7: 0.5, // NIP boilerplate — low signal
};

const WEIGHT_MULTIPLIER: Record<string, number> = {
  'considerable weight': 1.5,
  'some weight': 1.0,
  'modest weight': 0.6,
};

function sideScore(grid: FactorGrid, party: Party): { score: number; drivers: string[] } {
  const findings = party === 'IP' ? grid.ip : grid.nip;
  let score = 0;
  const drivers: string[] = [];
  for (const f of findings) {
    if (!f.raised) continue;
    const base = ANCHOR_WEIGHTS[f.factor] ?? 1;
    const mult = f.suggestedWeight ? WEIGHT_MULTIPLIER[f.suggestedWeight] : 0.6;
    const evidenceBoost = Math.min(f.evidence.length, 3) / 3; // proof matters
    const s = base * mult * (0.5 + 0.5 * evidenceBoost);
    score += s;
    if (base >= 3) drivers.push(`factor ${f.factor} raised with ${f.evidence.length} evidence quote(s), ${f.suggestedWeight ?? 'weight tbd'}`);
  }
  return { score, drivers };
}

export function recommendLines(record: CaseRecord, grid: FactorGrid, allFlags: EdgeFlag[]): {
  recommendations: LineRecommendation[];
  flags: EdgeFlag[];
} {
  const flags: EdgeFlag[] = [];
  const heuristic = record.extractionMode === 'heuristic';

  const ip = sideScore(grid, 'IP');
  const nip = sideScore(grid, 'NIP');
  const spread = Math.abs(ip.score - nip.score);
  const lead: Party = ip.score >= nip.score ? 'IP' : 'NIP';

  // Confidence: spread-driven, capped hard in heuristic mode. This is a
  // prep signal for QA gating, not a probability — the arbiter decides.
  const rawConfidence = Math.min(95, Math.round(50 + spread * 8));
  const confidencePct = heuristic ? Math.min(rawConfidence, 60) : rawConfidence;

  const blockedLines = new Set(
    allFlags.filter((f) => f.severity === 'block' && f.line !== undefined).map((f) => f.line as number),
  );
  const caseBlocked = allFlags.some((f) => f.severity === 'block' && f.line === undefined);

  const recommendations: LineRecommendation[] = [];
  for (const line of record.lines) {
    const reasons: string[] = [];

    // Edge: identical offers on a line → human ruling, no recommendation (§6).
    if (line.ipOffer !== null && line.nipOffer !== null && line.ipOffer === line.nipOffer) {
      flags.push({
        code: 'IDENTICAL_OFFERS',
        severity: 'block',
        line: line.line,
        message: `Line ${line.line}: IP and NIP offers are IDENTICAL ($${line.ipOffer.toLocaleString()}) — engine does not recommend; human ruling required.`,
      });
      recommendations.push({
        line: line.line,
        recommended: 'FLAG',
        confidencePct: 0,
        dliChainToLine: null,
        reasons: ['Identical IP/NIP offers — see flag.'],
      });
      continue;
    }

    // Edge: NIP offer exactly equals the QPA (§6) — warn, still recommend.
    if (line.nipOffer !== null && record.qpa !== null && line.nipOffer === record.qpa) {
      flags.push({
        code: 'NIP_OFFER_EQUALS_QPA',
        severity: 'warn',
        line: line.line,
        message: `Line ${line.line}: NIP offer equals the QPA exactly ($${line.nipOffer.toLocaleString()}) — the QPA is the NIP's own number; do not treat the match as corroboration.`,
      });
    }

    if (caseBlocked || blockedLines.has(line.line)) {
      recommendations.push({
        line: line.line,
        recommended: 'FLAG',
        confidencePct: 0,
        dliChainToLine: null,
        reasons: ['Blocking flag on this case/line — resolve before deciding. See FLAGS section.'],
      });
      continue;
    }

    reasons.push(
      `Anchor factors: IP ${ip.drivers.length ? ip.drivers.join('; ') : 'raised no anchor factor with evidence'} | NIP ${nip.drivers.length ? nip.drivers.join('; ') : 'raised no anchor factor with evidence'}`,
      `Factor score IP ${ip.score.toFixed(1)} vs NIP ${nip.score.toFixed(1)} → lean ${lead}.`,
    );
    if (heuristic) reasons.push('HEURISTIC MODE — confidence capped at 60%; treat as a filing aid, not an analysis.');

    recommendations.push({
      line: line.line,
      recommended: lead,
      confidencePct,
      dliChainToLine: null,
      reasons,
    });
  }

  // DLI chaining plan (§2): a line whose decision matches a PREVIOUS line
  // gets the pre-staged sentence; the number itself is read off the portal
  // screen and typed by the human — never auto-filled.
  const decided = recommendations.filter((r) => r.recommended !== 'FLAG');
  const lastLineByParty: Partial<Record<Party, number>> = {};
  for (const rec of recommendations) {
    if (rec.recommended === 'FLAG') continue;
    const p = rec.recommended as Party;
    const prior = lastLineByParty[p];
    if (prior !== undefined) rec.dliChainToLine = prior;
    lastLineByParty[p] = rec.line;
  }

  // Edge: split decision across batch lines (§6) — possible but loud.
  const parties = new Set(decided.map((r) => r.recommended));
  if (record.batch && parties.size > 1) {
    flags.push({
      code: 'SPLIT_DECISION',
      severity: 'warn',
      message: 'Recommended prevailing party DIFFERS across batch lines (split decision). Each divergent line needs its own full rationale — DLI chaining does not apply across the split.',
    });
  }

  return { recommendations, flags };
}
