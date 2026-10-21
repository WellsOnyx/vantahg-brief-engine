import { parseExactCents } from './money';
import { nipTemplateId, templateKey } from './load';
import type {
  BriefState,
  DisputeShape,
  Eligibility,
  FactorEvidence,
  Figure,
  NipBranch,
  Party,
  RawFigure,
} from './types';

export interface SelectionFacts {
  party: Party;
  brief: BriefState;
  shape: DisputeShape;
  lineIds: readonly string[];
  figures: readonly Figure[];
  factors: readonly FactorEvidence[];
  documentIds: readonly string[];
  eligibility?: Eligibility;
  briefQpa?: RawFigure | null;
}

export interface TemplateSelection {
  id: string;
  branch: NipBranch | null;
}

/**
 * Picks the content-file id for this dispute.
 * NIP branches are first-match. An unmatched NIP dispute returns null.
 */
export function selectTemplateId(facts: SelectionFacts): TemplateSelection | null {
  if (facts.party === 'IP') {
    return { id: templateKey('IP', facts.brief, facts.shape), branch: null };
  }
  const branch = selectNipBranch(facts);
  if (!branch) return null;
  return { id: nipTemplateId(branch), branch };
}

/**
 * First match wins:
 * ineligible, zero offer, no QPA, batch QPA discrepancy,
 * QPA higher than the brief, QPA lower than the brief,
 * no substantive factors, NIP offer higher on the primary line.
 */
export function selectNipBranch(facts: SelectionFacts): NipBranch | null {
  if (facts.eligibility === 'ineligible') return 'ineligible';
  if (hasZeroOffer(facts)) return 'zero_offer';
  if (everyQpaMissing(facts)) return 'no_qpa';
  if (hasBatchQpaDiscrepancy(facts)) return 'batch_qpa_discrepancy';
  const compared = comparePrimaryQpaToBrief(facts);
  if (compared === 'higher') return 'qpa_higher_than_brief';
  if (compared === 'lower') return 'qpa_lower_than_brief';
  if (nipHasNoSubstantiveFactors(facts.factors)) return 'no_substantive_factors';
  if (primaryNipOfferHigher(facts)) return 'nip_offer_higher';
  return null;
}

export function identicalOfferLineIds(lineIds: readonly string[], figures: readonly Figure[]): string[] {
  const hits: string[] = [];
  for (const lineId of lineIds) {
    const ip = figureFor(figures, lineId, 'ip_offer');
    const nip = figureFor(figures, lineId, 'nip_offer');
    if (
      ip?.status === 'present' &&
      nip?.status === 'present' &&
      ip.amount_cents !== null &&
      ip.amount_cents === nip.amount_cents
    ) {
      hits.push(lineId);
    }
  }
  return hits;
}

function hasZeroOffer(facts: SelectionFacts): boolean {
  for (const lineId of facts.lineIds) {
    for (const kind of ['ip_offer', 'nip_offer'] as const) {
      const figure = figureFor(facts.figures, lineId, kind);
      if (figure?.status === 'present' && figure.amount_cents === 0) return true;
    }
  }
  return false;
}

function everyQpaMissing(facts: SelectionFacts): boolean {
  return facts.lineIds.every((lineId) => {
    const qpa = figureFor(facts.figures, lineId, 'qpa');
    return !qpa || qpa.status !== 'present' || qpa.amount_cents === null;
  });
}

function hasBatchQpaDiscrepancy(facts: SelectionFacts): boolean {
  if (facts.shape !== 'batched') return false;
  const qpas = facts.lineIds.map((lineId) => figureFor(facts.figures, lineId, 'qpa'));
  const present = qpas.filter((qpa) => qpa && qpa.status === 'present' && qpa.amount_cents !== null);
  const amounts = new Set(present.map((qpa) => qpa?.amount_cents));
  const missingCount = qpas.length - present.length;
  return (missingCount > 0 && present.length > 0) || amounts.size > 1;
}

function comparePrimaryQpaToBrief(facts: SelectionFacts): 'higher' | 'lower' | null {
  const primary = facts.lineIds[0];
  if (!primary) return null;
  const qpa = figureFor(facts.figures, primary, 'qpa');
  if (!qpa || qpa.status !== 'present' || qpa.amount_cents === null) return null;
  const brief = sourcedBriefCents(facts.briefQpa, facts.documentIds);
  if (brief === null || brief === qpa.amount_cents) return null;
  return qpa.amount_cents > brief ? 'higher' : 'lower';
}

function sourcedBriefCents(raw: RawFigure | null | undefined, documentIds: readonly string[]): number | null {
  if (!raw?.doc_id || !documentIds.includes(raw.doc_id)) return null;
  if (raw.page === null || !Number.isInteger(raw.page) || raw.page < 1) return null;
  return parseExactCents(raw.amount);
}

function nipHasNoSubstantiveFactors(factors: readonly FactorEvidence[]): boolean {
  const substantive = factors.filter((factor) => factor.number >= 2);
  return substantive.length > 0 && substantive.every((factor) => !factor.nip.submitted);
}

function primaryNipOfferHigher(facts: SelectionFacts): boolean {
  const primary = facts.lineIds[0];
  if (!primary) return false;
  const ip = figureFor(facts.figures, primary, 'ip_offer');
  const nip = figureFor(facts.figures, primary, 'nip_offer');
  if (!ip || !nip || ip.status !== 'present' || nip.status !== 'present') return false;
  if (ip.amount_cents === null || nip.amount_cents === null) return false;
  return nip.amount_cents > ip.amount_cents;
}

function figureFor(figures: readonly Figure[], lineId: string, kind: Figure['kind']): Figure | undefined {
  return figures.find((figure) => figure.line_id === lineId && figure.kind === kind);
}
