import { z } from 'zod';
import {
  FACTOR_IDS,
  PHRASE_KEYS,
  REQUIRED_GATE_IDS,
  type AcuityGate,
  type ChecklistFactor,
  type Factor7Gate,
  type GateDef,
  LIVE_TEXT_MARKER,
  NIP_BRANCHES,
  type NeutralToneGate,
  type PhraseKey,
  type QaChecklist,
} from './types';
import { parseYaml, YamlParseError } from './yaml';

export class IdrContentError extends Error {
  readonly code = 'idr_content_invalid';

  constructor(message: string) {
    super(message);
    this.name = 'IdrContentError';
  }
}

const VersionSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}\.\d+$/);

const FactorSchema = z
  .object({
    id: z.enum(FACTOR_IDS),
    number: z.number().int().min(1).max(7),
    label: z.string().min(1),
    never_credit_party: z.literal('IP').optional(),
  })
  .strict();

const TemplateMatchSchema = z
  .object({
    id: z.literal('template_match'),
    blocking: z.literal(true),
    label: z.string().min(1),
  })
  .strict();

const AcuitySchema = z
  .object({
    id: z.literal('no_cpt_in_acuity'),
    blocking: z.literal(true),
    label: z.string().min(1),
    factor: z.literal('acuity_complexity'),
    forbid_pattern: z.string().min(1),
    forbid_tokens: z.array(z.string().min(1)).min(1),
    argument_forbid: z.array(z.string().min(1)).min(1),
  })
  .strict();

const CvSchema = z
  .object({
    id: z.literal('cv_from_file'),
    blocking: z.literal(true),
    label: z.string().min(1),
    factor: z.literal('training_experience'),
    source_role: z.literal('cv'),
  })
  .strict();

const QpaSchema = z
  .object({
    id: z.literal('qpa_variant'),
    blocking: z.literal(true),
    label: z.string().min(1),
  })
  .strict();

const Factor7Schema = z
  .object({
    id: z.literal('factor_7_rule'),
    blocking: z.literal(true),
    label: z.string().min(1),
    factor: z.literal('additional_information'),
    never_credit_party: z.string().min(1),
    credit_patterns: z.array(z.string().min(1)).min(1),
  })
  .strict();

const NeutralSchema = z
  .object({
    id: z.literal('neutral_tone'),
    blocking: z.literal(true),
    label: z.string().min(1),
    forbid_phrases: z.array(z.string().min(1)).min(1),
  })
  .strict();

const NumbersSchema = z
  .object({
    id: z.literal('numbers_match_source'),
    blocking: z.literal(true),
    label: z.string().min(1),
  })
  .strict();

const GateSchema = z.discriminatedUnion('id', [
  TemplateMatchSchema,
  AcuitySchema,
  CvSchema,
  QpaSchema,
  Factor7Schema,
  NeutralSchema,
  NumbersSchema,
]);

const PhraseSchema = z
  .object({
    training_from_cv: z.string().min(1),
    training_absent: z.string().min(1),
    acuity_both: z.string().min(1),
    acuity_records: z.string().min(1),
    acuity_report: z.string().min(1),
    acuity_absent: z.string().min(1),
    party_submitted: z.string().min(1),
    party_absent: z.string().min(1),
    factor_7: z.string().min(1),
    qpa_factor: z.string().min(1),
  })
  .strict();

const SlotsSchema = z
  .object({
    live_text_marker: z.literal(LIVE_TEXT_MARKER),
    batch_line_link: z.literal('same as'),
    no_acuity_paragraph: z.string().min(1),
    paragraph_roles: z.tuple([z.literal('chart'), z.literal('ip'), z.literal('nip'), z.literal('winner')]),
  })
  .strict();

const ChecklistSchema = z
  .object({
    version: VersionSchema,
    schema: z.literal('idr-qa-checklist'),
    factors: z.array(FactorSchema).length(FACTOR_IDS.length),
    gates: z.array(GateSchema).min(1),
    slots: SlotsSchema,
    phrases: PhraseSchema,
    ops_markup: z.array(z.string().min(1)).min(1),
  })
  .strict();

const TemplateMetaSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9-]+$/),
    version: VersionSchema,
    party_variant: z.enum(['IP', 'NIP']),
    nip_branch: z.enum(['none', ...NIP_BRANCHES]),
    nip_brief: z.enum(['present', 'absent', 'any']),
    dispute_shape: z.enum(['single', 'batched', 'any']),
    qpa_wording: z.enum(['single', 'batch', 'any']),
  })
  .strict();

export function parseChecklistDocument(source: string, path: string): QaChecklist {
  let raw: unknown;
  try {
    raw = parseYaml(source);
  } catch (error) {
    const message = error instanceof YamlParseError ? error.message : 'Checklist YAML could not be parsed.';
    throw new IdrContentError(`${path}: ${message}`);
  }
  const parsed = ChecklistSchema.safeParse(raw);
  if (!parsed.success) {
    throw new IdrContentError(`${path}: ${formatZod(parsed.error)}`);
  }
  const factors = validateFactors(parsed.data.factors, path);
  const gates = validateGates(parsed.data.gates, path);
  validatePhrases(parsed.data.phrases, gates, path);
  validateSlots(parsed.data.slots, gates, path);
  validateOps(parsed.data.ops_markup, path);
  const phrases = parsed.data.phrases as Record<PhraseKey, string>;
  for (const key of PHRASE_KEYS) {
    if (!phrases[key]) throw new IdrContentError(`${path}: missing phrase ${key}.`);
  }
  if (!phrases.training_from_cv.includes('{{board_certification}}') || !phrases.training_from_cv.includes('{{specialty}}')) {
    throw new IdrContentError(`${path}: the CV sentence slot needs board certification and specialty.`);
  }
  return {
    version: parsed.data.version,
    schema: 'idr-qa-checklist',
    factors,
    gates,
    slots: parsed.data.slots,
    phrases,
    ops_markup: parsed.data.ops_markup,
    path,
  };
}

export function parseTemplateMeta(source: string, path: string) {
  let raw: unknown;
  try {
    raw = parseYaml(source);
  } catch (error) {
    const message = error instanceof YamlParseError ? error.message : 'Template frontmatter could not be parsed.';
    throw new IdrContentError(`${path}: ${message}`);
  }
  const parsed = TemplateMetaSchema.safeParse(raw);
  if (!parsed.success) {
    throw new IdrContentError(`${path}: ${formatZod(parsed.error)}`);
  }
  validateTemplateShape(parsed.data, path);
  return parsed.data;
}

function validateTemplateShape(meta: z.infer<typeof TemplateMetaSchema>, path: string): void {
  if (meta.party_variant === 'IP') {
    if (meta.nip_branch !== 'none') {
      throw new IdrContentError(`${path}: an initiating-party template has no NIP branch.`);
    }
    if (meta.nip_brief === 'any' || meta.dispute_shape === 'any' || meta.qpa_wording === 'any') {
      throw new IdrContentError(`${path}: an initiating-party template names a brief and a dispute shape.`);
    }
    if ((meta.dispute_shape === 'single') !== (meta.qpa_wording === 'single')) {
      throw new IdrContentError(`${path}: qpa_wording does not match dispute_shape.`);
    }
    return;
  }
  if (meta.nip_branch === 'none') {
    throw new IdrContentError(`${path}: a non-initiating-party template names a branch.`);
  }
  if (meta.nip_branch === 'batch_qpa_discrepancy') {
    if (meta.dispute_shape !== 'batched' || meta.qpa_wording !== 'batch') {
      throw new IdrContentError(`${path}: batch QPA discrepancy is a batched template.`);
    }
    return;
  }
  if (meta.dispute_shape !== 'any' || meta.qpa_wording !== 'any' || meta.nip_brief !== 'any') {
    throw new IdrContentError(`${path}: this NIP branch is not tied to one brief or dispute shape.`);
  }
}

function validateFactors(factors: readonly ChecklistFactor[], path: string): ChecklistFactor[] {
  const seen = new Set<string>();
  const numbers = new Set<number>();
  for (const factor of factors) {
    if (seen.has(factor.id)) throw new IdrContentError(`${path}: duplicate factor ${factor.id}.`);
    seen.add(factor.id);
    if (numbers.has(factor.number)) throw new IdrContentError(`${path}: duplicate factor number ${factor.number}.`);
    numbers.add(factor.number);
    if (factor.id === 'additional_information') {
      if (factor.number !== 7 || factor.never_credit_party !== 'IP') {
        throw new IdrContentError(`${path}: factor 7 is never credited to the initiating party.`);
      }
    } else if (factor.never_credit_party) {
      throw new IdrContentError(`${path}: never_credit_party is only valid on factor 7.`);
    }
  }
  for (const id of FACTOR_IDS) {
    if (!seen.has(id)) throw new IdrContentError(`${path}: missing factor ${id}.`);
  }
  return [...factors].sort((a, b) => a.number - b.number);
}

function validateGates(gates: readonly z.infer<typeof GateSchema>[], path: string): GateDef[] {
  const seen = new Set<string>();
  for (const gate of gates) {
    if (seen.has(gate.id)) throw new IdrContentError(`${path}: duplicate gate ${gate.id}.`);
    seen.add(gate.id);
    if (gate.blocking !== true) throw new IdrContentError(`${path}: ${gate.id} must be a hard stop.`);
  }
  for (const id of REQUIRED_GATE_IDS) {
    if (!seen.has(id)) throw new IdrContentError(`${path}: missing gate ${id}.`);
  }
  const factor7 = gates.find((gate) => gate.id === 'factor_7_rule');
  if (factor7 && factor7.never_credit_party !== 'IP') {
    throw new IdrContentError(`${path}: factor 7 is never credited to the initiating party.`);
  }
  const acuity = gates.find((gate) => gate.id === 'no_cpt_in_acuity');
  if (!acuity || acuity.id !== 'no_cpt_in_acuity') {
    throw new IdrContentError(`${path}: missing acuity gate.`);
  }
  try {
    // Compile once so a reviewer edit cannot ship a broken pattern.
    new RegExp(acuity.forbid_pattern, 'i');
  } catch {
    throw new IdrContentError(`${path}: acuity forbid_pattern is not a valid regular expression.`);
  }
  return REQUIRED_GATE_IDS.map((id) => {
    const gate = gates.find((item) => item.id === id);
    if (!gate) throw new IdrContentError(`${path}: missing gate ${id}.`);
    if (gate.id === 'factor_7_rule') {
      return { ...gate, never_credit_party: 'IP' as const };
    }
    return gate;
  }) as GateDef[];
}

function validatePhrases(
  phrases: Record<PhraseKey, string>,
  gates: readonly GateDef[],
  path: string,
): void {
  const acuity = gates.find((gate): gate is AcuityGate => gate.id === 'no_cpt_in_acuity');
  const neutral = gates.find((gate): gate is NeutralToneGate => gate.id === 'neutral_tone');
  const factor7 = gates.find((gate): gate is Factor7Gate => gate.id === 'factor_7_rule');
  if (!acuity || !neutral || !factor7) return;
  const pattern = new RegExp(acuity.forbid_pattern, 'i');
  const acuityKeys: PhraseKey[] = ['acuity_both', 'acuity_records', 'acuity_report', 'acuity_absent'];
  for (const key of acuityKeys) {
    const sentence = phrases[key];
    if (pattern.test(sentence) || acuity.forbid_tokens.some((token) => sentence.toLowerCase().includes(token.toLowerCase()))) {
      throw new IdrContentError(`${path}: acuity phrase "${key}" contains a CPT marker.`);
    }
    if (acuity.argument_forbid.some((phrase) => sentence.toLowerCase().includes(phrase.toLowerCase()))) {
      throw new IdrContentError(`${path}: acuity phrase "${key}" contains argument language.`);
    }
  }
  if (factor7.credit_patterns.some((phrase) => phrases.factor_7.toLowerCase().includes(phrase.toLowerCase()))) {
    throw new IdrContentError(`${path}: the factor 7 sentence matches a credit pattern.`);
  }
  if (neutral.forbid_phrases.some((phrase) => hitsPhrase(phrases.factor_7, phrase))) {
    throw new IdrContentError(`${path}: the factor 7 sentence is not neutral.`);
  }
}

function validateSlots(
  slots: z.infer<typeof SlotsSchema>,
  gates: readonly GateDef[],
  path: string,
): void {
  if (!slots.no_acuity_paragraph.trim()) {
    throw new IdrContentError(`${path}: the no-acuity paragraph slot is empty.`);
  }
  const acuity = gates.find((gate): gate is AcuityGate => gate.id === 'no_cpt_in_acuity');
  if (!acuity) return;
  const pattern = new RegExp(acuity.forbid_pattern, 'i');
  const sentence = slots.no_acuity_paragraph;
  if (pattern.test(sentence) || acuity.forbid_tokens.some((token) => sentence.toLowerCase().includes(token.toLowerCase()))) {
    throw new IdrContentError(`${path}: the no-acuity paragraph contains a CPT marker.`);
  }
  if (acuity.argument_forbid.some((phrase) => sentence.toLowerCase().includes(phrase.toLowerCase()))) {
    throw new IdrContentError(`${path}: the no-acuity paragraph contains argument language.`);
  }
}

function validateOps(tokens: readonly string[], path: string): void {
  for (const required of ['MISSING', '{{', '}}', LIVE_TEXT_MARKER]) {
    if (!tokens.includes(required)) {
      throw new IdrContentError(`${path}: ops_markup must include ${required}.`);
    }
  }
  if (tokens.includes('TODO')) {
    throw new IdrContentError(`${path}: ops_markup lists TODO, which matches the live-text marker. List ${LIVE_TEXT_MARKER}.`);
  }
}

export function hitsPhrase(text: string, phrase: string): boolean {
  const hay = text.toLowerCase();
  const needle = phrase.toLowerCase();
  if (/^[a-z0-9]+$/i.test(phrase)) {
    const re = new RegExp(`\\b${escapeRegExp(needle)}\\b`, 'i');
    return re.test(text);
  }
  return hay.includes(needle);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function formatZod(error: z.ZodError): string {
  return error.issues.map((issue) => `${issue.path.join('.') || 'document'}: ${issue.message}`).join('; ');
}
