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
  const narrative = factor?.narrative ?? '';
  const pattern = new RegExp(gate.forbid_pattern, 'i');
  const hasRecords = context.documents.some((doc) => doc.role === 'records');
  const hasReport = context.documents.some((doc) => doc.role === 'op_report');
  const problems: string[] = [];
  if (!hasRecords && !hasReport) {
    const slot = context.checklist.slots.no_acuity_paragraph.trim();
    if (!slot) problems.push('no-acuity paragraph is empty');
    else if (narrative.trim() !== slot) problems.push('no-acuity paragraph does not match the checklist slot');
  } else {
    const expected =
      hasRecords && hasReport
        ? context.checklist.phrases.acuity_both
        : hasRecords
          ? context.checklist.phrases.acuity_records
          : context.checklist.phrases.acuity_report;
    if (narrative !== expected) problems.push('acuity text is not the attachment note');
  }
  if (pattern.test(narrative)) problems.push('acuity text contains a CPT code');
  if (gate.forbid_tokens.some((token) => narrative.toLowerCase().includes(token.toLowerCase()))) {
    problems.push('acuity text contains a code-set token');
  }
  if (gate.argument_forbid.some((phrase) => hitsPhrase(narrative, phrase))) {
    problems.push('acuity text contains argument');
  }
  if (narrative && !context.packet.text.includes(narrative)) problems.push('acuity note is missing from the draft');
  return result(gate.id, gate.label, problems);
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
    const needle = `${link} ${primary}`;
    const count = chart.split(needle).length - 1;
    if (count !== context.intake.line_items.length - 1) {
      problems.push('batch lines do not link to the primary line');
    }
    const second = context.intake.line_items[1]?.line_id;
    const primarySegment = second ? chart.split(second)[0] : chart;
    if (primarySegment.includes(link)) problems.push('primary line is linked as a secondary line');
    if (context.template.qpa_wording === 'single') problems.push('template QPA variant is single on a batch');
  } else {
    if (context.packet.text.includes(link)) problems.push('single dispute uses a batch line link');
    if (context.template.qpa_wording === 'batch') problems.push('template QPA variant is batch on a single dispute');
  }
  return result(gate.id, gate.label, problems);
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
