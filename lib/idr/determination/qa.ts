import { lineMatchesPrimary } from './draft';
import { acuityTextForParty } from './factors';
import { currencyTokens, formatCents, sameMultiset } from './money';
import { fillPhrase, partyName } from './phrases';
import { identicalOfferLineIds, selectTemplateId } from './select';
import { hitsPhrase } from './schema';
import type {
  AcuityGate,
  DraftPacket,
  Eligibility,
  Factor7Gate,
  FactorEvidence,
  Figure,
  GateResult,
  IdrDocumentInput,
  IntakeRecord,
  NeutralToneGate,
  QaChecklist,
  RawFigure,
  TemplateFile,
} from './types';

/**
 * Paragraph order (chart, initiating party, non-initiating party, winner) is house_style.
 * The written decision duty is public: 45 CFR 149.510(c)(5)(vi).
 * https://www.ecfr.gov/current/title-45/section-149.510
 */
export const PARAGRAPH_ORDER_BASIS = {
  basis: 'house_style',
  citation: '45 CFR 149.510(c)(5)(vi)',
  source_url: 'https://www.ecfr.gov/current/title-45/section-149.510',
} as const;

/**
 * The batch words "same as" plus the primary line id are house_style.
 * Batched items are public: 45 CFR 149.510(c)(4).
 * Selecting an offer for each item is public: 45 CFR 149.510(c)(5)(ii)(A).
 */
export const BATCH_LINK_BASIS = {
  basis: 'house_style',
  citation: '45 CFR 149.510(c)(4)',
  source_url: 'https://www.ecfr.gov/current/title-45/section-149.510',
} as const;

/** The neutral-tone word list is house_style. */
export const BANNED_WORDS_BASIS = {
  basis: 'house_style',
  citation: '45 CFR 149.510(c)(5)(vi)',
  source_url: 'https://www.ecfr.gov/current/title-45/section-149.510',
} as const;

/**
 * Barring CPT and HCPCS tokens from the acuity sentence is house_style.
 * Acuity of the individual or complexity of furnishing is public: 45 CFR 149.510(c)(5)(iii)(B)(3).
 * Prohibited factors, including usual and customary charges and public payor rates: 45 CFR 149.510(c)(5)(v).
 * Surprise billing rules: 86 FR 36872, 86 FR 55980, and 87 FR 52618.
 */
export const NO_CPT_BASIS = {
  basis: 'house_style',
  citation: '45 CFR 149.510(c)(5)(iii)(B)(3)',
  source_url: 'https://www.ecfr.gov/current/title-45/section-149.510',
} as const;

export interface QaContext {
  checklist: QaChecklist;
  template: TemplateFile;
  intake: IntakeRecord;
  figures: readonly Figure[];
  factors: readonly FactorEvidence[];
  documents: readonly IdrDocumentInput[];
  packet: DraftPacket;
  eligibility?: Eligibility;
  briefQpa?: RawFigure | null;
}

export function evaluateGates(context: QaContext): GateResult[] {
  return [
    templateMatch(context),
    acuityGate(context),
    cvGate(context),
    qpaGate(context),
    factor7Gate(context),
    neutralGate(context),
    numbersGate(context),
  ];
}

export function findOpsMarkup(text: string, tokens: readonly string[]): string | null {
  for (const token of tokens) {
    if (text.includes(token)) return token;
  }
  return null;
}

function templateMatch(context: QaContext): GateResult {
  const gate = gateById(context, 'template_match');
  const selected = selectTemplateId({
    party: context.packet.prevailing_party,
    brief: context.intake.nip_brief,
    shape: context.intake.shape,
    lineIds: context.intake.line_items.map((item) => item.line_id),
    figures: context.figures,
    factors: context.factors,
    documentIds: context.documents.map((doc) => doc.doc_id),
    eligibility: context.eligibility,
    briefQpa: context.briefQpa,
  });
  const problems: string[] = [];
  const expected = selected?.id ?? 'unmatched';
  if (!selected || context.template.id !== expected || context.packet.stamps.template_id !== expected) {
    problems.push(`template ${context.packet.stamps.template_id} does not match ${expected}`);
  }
  if (context.packet.nip_branch !== (selected?.branch ?? null)) {
    problems.push('NIP branch stamp does not match the dispute');
  }
  if (context.packet.stamps.template_version !== context.template.version) {
    problems.push('template version stamp does not match the file');
  }
  if (context.packet.stamps.checklist_version !== context.checklist.version) {
    problems.push('checklist version stamp does not match the file');
  }
  const roles = context.packet.paragraph_roles;
  if (roles[0] !== 'chart' || roles[1] !== 'ip' || roles[2] !== 'nip' || roles[3] !== 'winner') {
    problems.push('paragraphs are not in chart, IP, NIP, winner order');
  }
  const [chart, , , winner] = context.packet.paragraphs;
  const partyToken = `prevailing_party:${context.packet.prevailing_party}`;
  const otherParty = context.packet.prevailing_party === 'IP' ? 'prevailing_party:NIP' : 'prevailing_party:IP';
  const briefToken = `nip_brief:${context.intake.nip_brief}`;
  const otherBrief = context.intake.nip_brief === 'present' ? 'nip_brief:absent' : 'nip_brief:present';
  if (!winner.includes(partyToken)) problems.push('winner paragraph is missing the prevailing party');
  if (context.packet.text.includes(otherParty)) problems.push('the other prevailing party is present');
  if (!chart.includes(briefToken)) problems.push('chart paragraph is missing the brief state');
  if (context.packet.text.includes(otherBrief)) problems.push('the other brief state is present');
  if (context.packet.reason && !winner.includes(context.packet.reason)) {
    problems.push('winner paragraph is missing the supplied reason');
  }
  return result(gate.id, gate.label, problems);
}

function acuityGate(context: QaContext): GateResult {
  const gate = gateById(context, 'no_cpt_in_acuity') as AcuityGate;
  const factor = context.factors.find((item) => item.factor_id === gate.factor);
  const pattern = new RegExp(gate.forbid_pattern, 'i');
  const problems: string[] = [];
  for (const party of ['IP', 'NIP'] as const) {
    const expected = acuityTextForParty(context.documents, context.checklist, party);
    const actual = party === 'IP' ? (factor?.ip_narrative ?? '') : (factor?.nip_narrative ?? '');
    const paragraph = party === 'IP' ? context.packet.paragraphs[1] : context.packet.paragraphs[2];
    const name = partyName(party);
    if (!expected) problems.push('no-acuity paragraph is empty');
    else if (actual !== expected) problems.push(`acuity text for the ${name} does not match that party's filings`);
    if (expected && paragraph && !paragraph.includes(expected)) {
      problems.push(`acuity note for the ${name} is missing from that party's paragraph`);
    }
    collectAcuityProblems(problems, actual, gate, pattern);
  }
  collectAcuityProblems(problems, factor?.narrative ?? '', gate, pattern);
  return result(gate.id, gate.label, problems);
}

function collectAcuityProblems(problems: string[], text: string, gate: AcuityGate, pattern: RegExp): void {
  if (pattern.test(text)) problems.push('acuity text contains a CPT code');
  if (gate.forbid_tokens.some((token) => text.toLowerCase().includes(token.toLowerCase()))) {
    problems.push('acuity text contains a code-set token');
  }
  if (gate.argument_forbid.some((phrase) => hitsPhrase(text, phrase))) {
    problems.push('acuity text contains argument');
  }
}

function cvGate(context: QaContext): GateResult {
  const gate = gateById(context, 'cv_from_file');
  const factor = context.factors.find((item) => item.factor_id === 'training_experience');
  const problems: string[] = [];
  for (const party of ['IP', 'NIP'] as const) {
    const cv = context.documents.find((doc) => doc.role === gate.source_role && doc.party === party && doc.text?.trim());
    const evidence = party === 'IP' ? factor?.ip : factor?.nip;
    const name = partyName(party);
    if (cv?.text) {
      const board = evidence?.board_certification?.trim() ?? '';
      const specialty = evidence?.specialty?.trim() ?? '';
      if (!board) problems.push(`board certification for the ${name} is empty`);
      else if (!cv.text.includes(board)) {
        problems.push(`board certification for the ${name} is not in the curriculum vitae file`);
      }
      if (!specialty) problems.push(`specialty for the ${name} is empty`);
      else if (!cv.text.includes(specialty)) {
        problems.push(`specialty for the ${name} is not in the curriculum vitae file`);
      }
      if (board && specialty && cv.text.includes(board) && cv.text.includes(specialty)) {
        const expected = fillPhrase(context.checklist.phrases.training_from_cv, {
          board_certification: board,
          specialty,
        });
        if (!context.packet.text.includes(expected)) {
          problems.push(`CV sentence for the ${name} is missing from the draft`);
        }
      }
    } else if (evidence?.board_certification || evidence?.specialty || evidence?.excerpt) {
      problems.push(`training text for the ${name} has no curriculum vitae file`);
    } else {
      const expected = fillPhrase(context.checklist.phrases.training_absent, { party: name });
      if (!context.packet.text.includes(expected)) {
        problems.push(`missing curriculum vitae sentence for the ${name} is not the checklist sentence`);
      }
    }
  }
  return result(gate.id, gate.label, problems);
}

function qpaGate(context: QaContext): GateResult {
  const gate = gateById(context, 'qpa_variant');
  const link = context.checklist.slots.batch_line_link;
  const primary = context.intake.line_items[0]?.line_id ?? '';
  const problems: string[] = [];
  const chart = context.packet.paragraphs[0];
  if (context.intake.shape === 'batched') {
    const segments = chartSegments(chart);
    const primarySegment = segments.get(primary) ?? '';
    if (primarySegment.includes(link)) problems.push('primary line is linked as a secondary line');
    for (const item of context.intake.line_items.slice(1)) {
      const segment = segments.get(item.line_id) ?? '';
      const matches = lineMatchesPrimary(context.intake.line_items, context.figures, item.line_id);
      const linked = segment.includes(`${link} ${primary}`);
      if (matches && !linked) problems.push(`${item.line_id} matches the primary line and is not linked`);
      if (!matches && segment.includes(link)) problems.push(`${item.line_id} does not match the primary line`);
    }
    if (context.template.qpa_wording === 'single') problems.push('template QPA variant is single on a batch');
  } else {
    if (context.packet.text.includes(link)) problems.push('single dispute uses a batch line link');
    if (context.template.qpa_wording === 'batch') problems.push('template QPA variant is batch on a single dispute');
  }
  return result(gate.id, gate.label, problems);
}

function chartSegments(chart: string): Map<string, string> {
  const segments = new Map<string, string>();
  for (const part of chart.split(/(?=line:)/)) {
    const id = /^line:(\S+)/.exec(part)?.[1];
    if (id) segments.set(id, part);
  }
  return segments;
}

function factor7Gate(context: QaContext): GateResult {
  const gate = gateById(context, 'factor_7_rule') as Factor7Gate;
  const factor = context.factors.find((item) => item.factor_id === gate.factor);
  const spec = context.checklist.factors.find((item) => item.number === 7);
  const problems: string[] = [];
  if (!factor || factor.number !== 7) problems.push('factor 7 is missing from the evidence map');
  if (spec?.never_credit_party !== gate.never_credit_party) {
    problems.push('checklist factor 7 credit rule does not match the gate');
  }
  if (factor?.credited_to === gate.never_credit_party) {
    problems.push('factor 7 is credited to the initiating party');
  }
  if (factor?.chart_support === 'unverified') {
    problems.push('factor 7 chart support is missing the chart');
  }
  if (factor?.chart_support === 'credited' && factor.credited_to !== 'NIP') {
    problems.push('factor 7 chart support did not credit the non-initiating party');
  }
  if (factor?.chart_support === 'absent' && factor.credited_to !== null) {
    problems.push('factor 7 is credited without chart support');
  }
  if (factor?.chart_support === 'credited' && factor.nip_narrative && !context.packet.paragraphs[2].includes(factor.nip_narrative)) {
    problems.push('factor 7 credit to the non-initiating party is missing from the NIP paragraph');
  }
  if (factor?.ip_narrative.includes('credit:NIP') || factor?.ip_narrative.includes('credit:IP')) {
    problems.push('factor 7 credit is on the initiating party narrative');
  }
  for (const pattern of gate.credit_patterns) {
    if (hitsPhrase(context.packet.text, pattern) || (factor && hitsPhrase(factor.narrative, pattern))) {
      problems.push(`factor 7 credit language: ${pattern}`);
    }
  }
  return result(gate.id, gate.label, problems);
}

function neutralGate(context: QaContext): GateResult {
  const gate = gateById(context, 'neutral_tone') as NeutralToneGate;
  const problems = gate.forbid_phrases.filter((phrase) => hitsPhrase(context.packet.text, phrase));
  return result(gate.id, gate.label, problems.map((phrase) => `non-neutral language: ${phrase}`));
}

function numbersGate(context: QaContext): GateResult {
  const gate = gateById(context, 'numbers_match_source');
  const problems: string[] = [];
  const identical = identicalOfferLineIds(
    context.intake.line_items.map((item) => item.line_id),
    context.figures,
  );
  if (identical.length > 0) {
    problems.push(`initiating party and non-initiating party offers are identical on ${identical.join(', ')}`);
  }
  if (context.figures.some((figure) => figure.status !== 'present' || figure.amount_cents === null || !figure.source)) {
    problems.push('a sourced offer or qualifying payment amount is MISSING and was not estimated');
  } else {
    const expected = context.figures.map((figure) => formatCents(figure.amount_cents as number));
    const found = currencyTokens(context.packet.text);
    if (!sameMultiset(expected, found)) {
      problems.push('draft figures do not match the sourced amounts');
    }
  }
  return result(gate.id, gate.label, problems);
}

function gateById<T extends QaChecklist['gates'][number]['id']>(
  context: QaContext,
  id: T,
): Extract<QaChecklist['gates'][number], { id: T }> {
  const gate = context.checklist.gates.find((item) => item.id === id);
  if (!gate) throw new Error(`Checklist is missing gate ${id}.`);
  return gate as Extract<QaChecklist['gates'][number], { id: T }>;
}

function result(id: Exclude<GateResult['id'], 'ops_markup'>, label: string, problems: readonly string[]): GateResult {
  const pass = problems.length === 0;
  return {
    id,
    label,
    blocking: true,
    pass,
    detail: pass ? 'pass' : problems.join('; '),
  };
}

export function gateFailed(gates: readonly GateResult[], id: GateResult['id']): boolean {
  return gates.some((gate) => gate.id === id && !gate.pass);
}
