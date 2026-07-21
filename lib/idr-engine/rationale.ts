import { factorDef, IMPORTANCE_ORDER } from './factors';
import type { CaseRecord, FactorFinding, FactorGrid, LineRecommendation, Party } from './types';

/**
 * Stage 7 — Draft (spec §4): the iMPROve house rationale template,
 * hard-won with Charlene — deviate at your peril.
 *
 *   ¶1 — standard, PORTAL-INJECTED and uneditable → not rendered here.
 *   ¶2 — standard reference to the factor chart (editable house language).
 *   ¶3+ — IP discussion: what the IP ACTUALLY submitted, factor by
 *         factor, ORDERED BY IMPORTANCE (5 first, 3 second), with CMS
 *         weight language. Parties get furious when their arguments go
 *         unacknowledged — the rationale must prove the brief was read.
 *   ¶  — NIP discussion, same treatment (frequently short).
 *   ¶  — CLOSE: standard verbatim house language with the prevailing
 *         party inserted (the PP is then entered in TWO portal places).
 *
 * BUILD NOTE from the spec, honored here: the exact house paragraphs must
 * be verified verbatim against a completed case in the workspace — the
 * spec text came from a transcript. Sentinels below mark what to verify.
 */

const P2_STANDARD =
  'In reaching this determination, the certified IDR entity considered the offers submitted by both parties, ' +
  'the qualifying payment amount, and the additional credible information submitted by the parties as reflected ' +
  'in the factor selections noted above.';

function closeParagraph(pp: Party | '[ARBITER TO SELECT: IP/NIP]'): string {
  const label = pp === 'IP' ? 'IP' : pp === 'NIP' ? 'NIP' : pp;
  return (
    `On balance, after considering the offers, the QPA, and the additional information submitted by the parties, ` +
    `the ${label} has presented sufficient credible evidence to substantiate its offer. Accordingly, the ${label}'s ` +
    `offer is selected as the out-of-network rate that best represents the value of the qualified IDR service at ` +
    `issue in the dispute.`
  );
}

function partyDiscussion(party: Party, findings: FactorFinding[], partyName: string | null): string {
  const label = party === 'IP' ? `the Initiating Party${partyName ? ` (${partyName})` : ''}` : `the Non-Initiating Party${partyName ? ` (${partyName})` : ''}`;
  const raised = IMPORTANCE_ORDER
    .map((n) => findings.find((f) => f.factor === n))
    .filter((f): f is FactorFinding => !!f && f.raised);

  if (raised.length === 0) {
    // The frequent short NIP shape from the spec.
    return `${label.charAt(0).toUpperCase() + label.slice(1)} submitted an objection statement without supporting evidence addressing the statutory factors.`;
  }

  const sentences = raised.map((f) => {
    const def = factorDef(f.factor);
    const factorPhrase = def.proseTitle ?? def.title.toLowerCase();
    const argued = f.summary ?? `an argument addressing ${factorPhrase}`;
    const cite = f.evidence[0] ? ` (see ${f.evidence[0].file}, p. ${f.evidence[0].page})` : '';
    const weight = f.suggestedWeight ?? 'modest weight';
    return `With respect to ${factorPhrase} (factor ${f.factor}), ${label} submitted ${argued}${cite}; this consideration was given ${weight}.`;
  });

  return sentences.join(' ');
}

export function renderRationale(
  record: CaseRecord,
  grid: FactorGrid,
  recommendations: LineRecommendation[],
): string {
  const decided = recommendations.filter((r) => r.recommended !== 'FLAG');
  const parties = new Set(decided.map((r) => r.recommended as Party));
  const pp: Party | '[ARBITER TO SELECT: IP/NIP]' =
    parties.size === 1 ? (decided[0].recommended as Party) : '[ARBITER TO SELECT: IP/NIP]';

  const blocks = [
    '[¶1 is portal-injected and uneditable — do not paste anything above this line]',
    P2_STANDARD,
    partyDiscussion('IP', grid.ip, record.ipName),
    partyDiscussion('NIP', grid.nip, record.nipName),
    closeParagraph(pp),
  ];

  const notes: string[] = [];
  if (parties.size > 1) {
    notes.push(
      'SPLIT DECISION: prevailing party differs across lines — this close paragraph applies to the first divergent group only; each divergent line needs its own full rationale.',
    );
  }
  notes.push('VERIFY-VERBATIM: ¶2 and the close paragraph must be checked once against a completed case in the workspace (spec §4 build note) before first live use.');

  return blocks.join('\n\n') + '\n\n---\n' + notes.map((n) => `[NOTE — NOT FOR PASTING: ${n}]`).join('\n');
}

/** Pre-staged DLI sentence (§2) — the number is typed by the human, from the portal screen. */
export function dliSentence(): string {
  return 'The decision is the same as DLI [____ ← read the DLI number off the portal screen and type it here].';
}
