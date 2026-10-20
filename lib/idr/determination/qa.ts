import { templateKey } from './load';
import { currencyTokens, formatCents, sameMultiset } from './money';
import { fillPhrase, partyName } from './phrases';
import { hitsPhrase } from './schema';
import type {
  AcuityGate,
  DraftPacket,
  Factor7Gate,
  FactorEvidence,
  Figure,
  GateResult,
  IdrDocumentInput,
  IntakeRecord,
  NeutralToneGate,
  QaChecklist,
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
  const expected = templateKey(context.packet.prevailing_party, context.intake.nip_brief, context.intake.shape);
  const phrases = context.checklist.variant_phrases;
  const partyPhrase = context.packet.prevailing_party === 'IP' ? phrases.IP : phrases.NIP;
  const otherParty = context.packet.prevailing_party === 'IP' ? phrases.NIP : phrases.IP;
  const briefPhrase = context.intake.nip_brief === 'present' ? phrases.brief_present : phrases.brief_absent;
  const otherBrief = context.intake.nip_brief === 'present' ? phrases.brief_absent : phrases.brief_present;
  const text = context.packet.text;
  const problems: string[] = [];
  if (context.template.id !== expected || context.packet.stamps.template_id !== expected) {
    problems.push(`template ${context.packet.stamps.template_id} does not match ${expected}`);
  }
  if (context.packet.stamps.template_version !== context.template.version) {
    problems.push('template version stamp does not match the file');
  }
  if (context.packet.stamps.checklist_version !== context.checklist.version) {
    problems.push('checklist version stamp does not match the file');
  }
  if (!text.includes(partyPhrase)) problems.push('prevailing-party sentence is missing');
  if (text.includes(otherParty)) problems.push('the other prevailing-party sentence is present');
  if (!text.includes(briefPhrase)) problems.push('brief sentence is missing');
  if (text.includes(otherBrief)) problems.push('the other brief sentence is present');
  return result(gate.id, gate.label, problems);
}

function acuityGate(context: QaContext): GateResult {
  const gate = gateById(context, 'no_cpt_in_acuity') as AcuityGate;
  const factor = context.factors.find((item) => item.factor_id === gate.factor);
  const narrative = factor?.narrative ?? '';
  const pattern = new RegExp(gate.forbid_pattern, 'i');
  const allowed = [
    context.checklist.phrases.acuity_both,
    context.checklist.phrases.acuity_records,
    context.checklist.phrases.acuity_report,
    context.checklist.phrases.acuity_absent,
  ];
  const problems: string[] = [];
  if (!allowed.includes(narrative)) problems.push('acuity text is not the attachment note');
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
      if (!evidence?.excerpt || !cv.text.includes(evidence.excerpt)) {
        problems.push(`training text for the ${name} is not taken from the curriculum vitae file`);
      } else if (!context.packet.text.includes(evidence.excerpt)) {
        problems.push(`curriculum vitae excerpt for the ${name} is missing from the draft`);
      } else {
        const expected = fillPhrase(context.checklist.phrases.training_from_cv, {
          party: name,
          excerpt: evidence.excerpt,
        });
        if (!context.packet.text.includes(expected)) {
          problems.push(`training sentence for the ${name} was not rendered from the checklist`);
        }
      }
    } else if (evidence?.excerpt) {
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
  const single = context.checklist.variant_phrases.qpa_single;
  const batch = context.checklist.variant_phrases.qpa_batch;
  const wantBatch = context.intake.shape === 'batched';
  const problems: string[] = [];
  if (wantBatch) {
    if (!context.packet.text.includes(batch)) problems.push('batched QPA wording is missing');
    if (context.packet.text.includes(single)) problems.push('single-dispute QPA wording is present on a batch');
    if (context.template.qpa_wording !== 'batch') problems.push('template QPA variant is not batch');
  } else {
    if (!context.packet.text.includes(single)) problems.push('single-dispute QPA wording is missing');
    if (context.packet.text.includes(batch)) problems.push('batched QPA wording is present on a single dispute');
    if (context.template.qpa_wording !== 'single') problems.push('template QPA variant is not single');
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
    problems.push(`factor 7 is credited to the ${gate.never_credit_party}`);
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
