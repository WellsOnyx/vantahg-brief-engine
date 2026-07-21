import { FACTORS } from './factors';
import { dliSentence } from './rationale';
import type { AnswerSheet, CaseDocument, EdgeFlag, LineRecommendation } from './types';

/**
 * Stage 8 + 9 — Answer sheet + log row (spec §6): everything in PORTAL
 * ORDER so the reviewer transcribes top-to-bottom with zero re-derivation:
 *
 *   COI → factor checks per party (with evidence) → rationale paste block
 *   → prevailing party (×2 places) → DLI sentence slots → attestation
 *   reminder → Cases Log row.
 *
 * The sheet exists to be COMPARED — against the arbiter's real submission
 * during validation, and against the portal screen during live use. The
 * companion JSON carries the same discrete answers for mechanical diffing.
 */

export const DRAFT_BANNER =
  '████ DRAFT FOR ARBITER REVIEW — THE ENGINE RECOMMENDS, IT NEVER DECIDES. A credentialed human reviews every field, decides every line, and clicks submit. Nothing in this file was or will be auto-submitted anywhere. ████';

const COI_NAME_STOPWORDS = new Set(['llc', 'inc', 'corp', 'health', 'plan', 'medical', 'group', 'of', 'the', 'and']);

export function buildCoi(record: { ipName: string | null; nipName: string | null }, docs: CaseDocument[]): AnswerSheet['coi'] {
  const names = new Set<string>();
  if (record.ipName) names.add(record.ipName);
  if (record.nipName) names.add(record.nipName);
  // Surface person-looking names from offers/briefs (signers, physicians) —
  // the engine cannot know the reviewer's conflicts; the human judges.
  for (const d of docs) {
    if (d.kind === 'cms_filler' || d.kind === 'exhibit') continue;
    const head = d.pages[0]?.text ?? '';
    for (const m of head.matchAll(/(?:Dr\.|MD|DO|signed(?: by)?:?)\s*([A-Z][a-z]+ [A-Z][a-z]+)/g)) {
      const candidate = m[1];
      if (!candidate.split(' ').some((w) => COI_NAME_STOPWORDS.has(w.toLowerCase()))) names.add(candidate);
    }
  }
  return { answer: 'No', namesForReview: [...names].sort() };
}

function checkbox(v: boolean): string {
  return v ? '[X]' : '[ ]';
}

function money(v: number | null): string {
  return v === null ? '— NOT EXTRACTED —' : `$${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function renderAnswerSheetMarkdown(sheet: AnswerSheet): string {
  const r = sheet.record;
  const L: string[] = [];

  L.push(sheet.draftBanner, '');
  L.push(`# IDR Answer Sheet — ${r.caseId}`);
  L.push(`Generated ${sheet.generatedAt} · extraction mode: ${r.extractionMode.toUpperCase()} · dispute ${r.disputeNumber ?? '—'} · ${r.batch ? `BATCH (${r.lines.length} lines)` : 'single line'}`);
  L.push('');

  // ── Flags first: nothing below is trustworthy until these are read ──
  if (sheet.flags.length > 0) {
    L.push('## ⚑ FLAGS — READ BEFORE ANYTHING ELSE');
    for (const f of sheet.flags) {
      L.push(`- ${f.severity === 'block' ? '⛔' : '⚠'} **${f.code}**${f.line ? ` (line ${f.line})` : ''} — ${f.message}`);
    }
    L.push('');
  }

  // ── Case facts ──
  L.push('## Case facts (verify against documents)');
  L.push(`- IP (provider): ${r.ipName ?? '— fill from notice of offer —'}`);
  L.push(`- NIP (payer/TPA): ${r.nipName ?? '— fill from notice of offer —'}`);
  L.push(`- QPA (NIP-supplied — display only, never an anchor): ${money(r.qpa)}`);
  L.push('');
  L.push('| Line | CPT | Date of service | IP offer | NIP offer |');
  L.push('|---|---|---|---|---|');
  for (const line of r.lines) {
    L.push(`| ${line.line} | ${line.cpt ?? '—'} | ${line.dateOfService ?? '—'} | ${money(line.ipOffer)} | ${money(line.nipOffer)} |`);
  }
  L.push('');
  L.push('Documents read:');
  for (const d of sheet.documents) L.push(`- ${d.file} → ${d.kind} (${d.classificationReason})`);
  L.push('');

  // ── PORTAL ORDER starts here ──
  L.push('---');
  L.push('## Portal step 1 · COI');
  L.push(`Answer: **${sheet.coi.answer}** (per policy).`);
  L.push('Names appearing in this case — scan for any conflict YOU have (the engine cannot know your conflicts):');
  if (sheet.coi.namesForReview.length === 0) {
    L.push('- (no names extracted — check the party names in Case facts above yourself)');
  }
  for (const n of sheet.coi.namesForReview) L.push(`- ${n}`);
  L.push('');

  L.push('## Portal step 2 · Factor checkboxes (check rule: a party is checked ONLY if their brief raises it)');
  L.push('| # | Factor | IP | NIP |');
  L.push('|---|---|---|---|');
  for (const def of FACTORS) {
    const ip = sheet.factorGrid.ip.find((f) => f.factor === def.factor);
    const nip = sheet.factorGrid.nip.find((f) => f.factor === def.factor);
    L.push(`| ${def.factor} | ${def.title} | ${checkbox(!!ip?.raised)} | ${checkbox(!!nip?.raised)} |`);
  }
  L.push('');
  L.push('### Evidence backing each check');
  for (const side of ['ip', 'nip'] as const) {
    for (const f of sheet.factorGrid[side]) {
      if (!f.raised) continue;
      L.push(`- **${side.toUpperCase()} · factor ${f.factor}** (${f.suggestedWeight ?? 'weight tbd'}): ${f.summary ?? ''}`);
      for (const e of f.evidence) L.push(`  > "${e.quote}" — ${e.file}, p. ${e.page}`);
    }
  }
  L.push('');

  L.push('## Portal step 3 · Rationale (paste block)');
  L.push('```');
  L.push(sheet.rationale);
  L.push('```');
  L.push('');

  L.push('## Portal step 4 · Prevailing party — ENTERED IN TWO PLACES');
  L.push('| Line | Engine recommendation | Confidence | Notes |');
  L.push('|---|---|---|---|');
  for (const rec of sheet.recommendations) {
    const label = rec.recommended === 'FLAG' ? '⛔ FLAG — HUMAN RULING REQUIRED' : rec.recommended;
    L.push(`| ${rec.line} | ${label} | ${rec.recommended === 'FLAG' ? '—' : `${rec.confidencePct}%`} | ${rec.reasons[0] ?? ''} |`);
  }
  L.push('');
  L.push('Reminder: your DECISION (not the engine\'s recommendation) goes in both PP fields — they must match.');
  L.push('');

  L.push('## Portal step 5 · DLI sentence slots (batch continuation lines)');
  const chained = sheet.recommendations.filter((x) => x.dliChainToLine !== null);
  if (chained.length === 0) {
    L.push('- none (single line, or no repeated decisions)');
  } else {
    for (const rec of chained) {
      L.push(`- Line ${rec.line} (matches decision on line ${rec.dliChainToLine}): ${dliSentence()}`);
    }
  }
  L.push('');

  L.push('## Portal step 6 · Attestation');
  L.push('- [ ] Attestation completed — type YOUR name and TODAY\'s date on the portal attestation screen.');
  L.push('');

  // ── Fingerprints + log row ──
  L.push('---');
  L.push('## Template fingerprints (§5 stub)');
  for (const fp of sheet.fingerprints) {
    L.push(`- ${fp.file} (${fp.party}): ${fp.status === 'DEVIATION' ? '🚨 **DEVIATION**' : fp.status} — ${fp.detail}`);
  }
  if (sheet.fingerprints.length === 0) L.push('- no briefs fingerprinted');
  L.push('');

  L.push('## Cases Log row (paste into the IDR Cases Log sheet)');
  L.push('```');
  L.push(sheet.logRowHeader);
  L.push(sheet.logRow);
  L.push('```');
  L.push('');
  L.push(sheet.draftBanner);

  return L.join('\n');
}

/**
 * Ready-to-paste IDR Cases Log row (§1: Dispute, IP, NIP, Arbiter Due,
 * Sent, Batched, Arbiter, PP, Rationale, Completed, NOTES, QC, Sent Date,
 * Rework, File Owner). Fields the engine cannot know are left as
 * placeholders the reviewer fills — a wrong value in the billing
 * reconciliation is worse than a blank.
 */
export function buildLogRow(
  record: AnswerSheet['record'],
  recommendations: LineRecommendation[],
  flags: EdgeFlag[],
): { header: string; row: string } {
  const header = ['Dispute', 'IP', 'NIP', 'Arbiter Due', 'Sent', 'Batched', 'Arbiter', 'PP', 'Rationale', 'Completed', 'NOTES', 'QC', 'Sent Date', 'Rework', 'File Owner'].join('\t');
  const decided = new Set(recommendations.filter((x) => x.recommended !== 'FLAG').map((x) => x.recommended));
  const pp = decided.size === 1 ? [...decided][0] : recommendations.some((x) => x.recommended === 'FLAG') ? '[PENDING — flags]' : '[SPLIT — per line]';
  const notes = flags.map((f) => f.code).join('; ') || '';
  const row = [
    record.disputeNumber ?? record.caseId,
    record.ipName ?? '[fill]',
    record.nipName ?? '[fill]',
    '[due date]',
    '', // Sent
    record.batch ? 'Y' : 'N',
    '[arbiter name]',
    pp,
    'House template — importance-ordered (engine-drafted, arbiter-reviewed)',
    '[completed date]',
    notes,
    '', // QC
    '', // Sent Date
    '', // Rework
    '[file owner]',
  ].join('\t');
  return { header, row };
}
