import { factorDef, IMPORTANCE_ORDER } from './factors';
import type { CaseRecord, FactorFinding, FactorGrid, LineRecommendation, Party } from './types';

/**
 * Stage 7 — Draft (spec §4): the certified IDR entity's house rationale
 * template — deviate at your peril. House paragraphs below are VERBATIM
 * from the live portal walkthrough (they replaced the transcript-derived
 * placeholders; the VERIFY-VERBATIM sentinel is retired).
 *
 *   ¶1 — standard NSA paragraph. Portal-injected as the first paragraph
 *        the parties see — rendered here for comparison, NOT re-pasted.
 *   ¶2 — standard chart-reference paragraph (pasted).
 *   ¶3+ — IP discussion: what the IP ACTUALLY submitted, factor by
 *         factor, ORDERED BY IMPORTANCE (5 first, 3 second), each with
 *         one rung of the weight ladder: modest / some / less.
 *   ¶  — NIP discussion, same treatment (frequently short).
 *   ¶  — CLOSE: verbatim house language with the prevailing party
 *         substituted (full name first mention, IP/NIP second); the PP
 *         is then entered in TWO portal places.
 */

const P1_PORTAL_INJECTED =
  'According to the Federal No Surprises Act ("NSA") and its implementing regulations, the arbiter must select one of ' +
  'two proposed payment amounts while taking into account evidence submitted by both parties. Furthermore, the NSA ' +
  'prohibits the arbiter from considering certain factors, such as usual and customary charges, the amount the ' +
  'provider or facility would have billed in the absence of the NSA, or payment or reimbursement rates under the ' +
  'Medicare, Medicaid, Children’s Health Insurance, or TRICARE programs. These prohibited factors have not been considered.';

const P2_STANDARD =
  'The chart above indicates the relevant factors that can be considered in rendering the final determination in this ' +
  'case and whether the Initiating Party (IP) and/or the Non-Initiating Party (NIP) submitted evidence in support of ' +
  'the factors. The evidence submitted for each factor listed in this case has been reviewed and considered.';

function closeParagraph(pp: Party | 'ARBITER_SELECTS'): string {
  const fullName =
    pp === 'IP' ? 'Initiating Party' : pp === 'NIP' ? 'Non-Initiating Party' : '[Initiating Party / Non-Initiating Party — ARBITER TO SELECT]';
  const shortName = pp === 'IP' || pp === 'NIP' ? pp : '[IP/NIP]';
  return (
    `On balance, after considering the offers, the QPA, and the additional information submitted by the parties, the ` +
    `${fullName} has presented sufficient credible evidence to substantiate its offer. Accordingly, the ${shortName}'s ` +
    `offer is selected as the out-of-network rate that best represents the value of the qualified IDR service at ` +
    `issue in this dispute.`
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

export interface RationaleSections {
  p1_portal_injected: string;
  p2_standard: string;
  ip_discussion: string;
  nip_discussion: string;
  close: string;
  notes: string[];
}

export function buildRationaleSections(
  record: CaseRecord,
  grid: FactorGrid,
  recommendations: LineRecommendation[],
): RationaleSections {
  const decided = recommendations.filter((r) => r.recommended === 'IP' || r.recommended === 'NIP');
  const parties = new Set(decided.map((r) => r.recommended as Party));
  const pp: Party | 'ARBITER_SELECTS' = parties.size === 1 ? (decided[0].recommended as Party) : 'ARBITER_SELECTS';

  const notes: string[] = [];
  if (parties.size > 1) {
    notes.push(
      'SPLIT DECISION: prevailing party differs across lines — this close paragraph applies to the first divergent group only; each divergent line needs its own full rationale.',
    );
  }

  return {
    p1_portal_injected: P1_PORTAL_INJECTED,
    p2_standard: P2_STANDARD,
    ip_discussion: partyDiscussion('IP', grid.ip, record.ipName),
    nip_discussion: partyDiscussion('NIP', grid.nip, record.nipName),
    close: closeParagraph(pp),
    notes,
  };
}

export function renderRationale(
  record: CaseRecord,
  grid: FactorGrid,
  recommendations: LineRecommendation[],
): string {
  const s = buildRationaleSections(record, grid, recommendations);
  const blocks = [
    `[PORTAL-INJECTED ¶1 — appears automatically, do NOT re-paste; shown to verify it matches:]\n${s.p1_portal_injected}`,
    '[PASTE FROM HERE DOWN]',
    s.p2_standard,
    s.ip_discussion,
    s.nip_discussion,
    s.close,
  ];
  const tail = s.notes.length ? '\n\n---\n' + s.notes.map((n) => `[NOTE — NOT FOR PASTING: ${n}]`).join('\n') : '';
  return blocks.join('\n\n') + tail;
}

/** Pre-staged DLI sentence (§2) — the number is typed by the human, from the portal screen. */
export function dliSentence(): string {
  return 'The decision is the same as DLI [____ ← read the DLI number off the portal screen and type it here].';
}
