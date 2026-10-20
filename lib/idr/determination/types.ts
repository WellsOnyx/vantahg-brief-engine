/**
 * Federal IDR determination workflow types.
 * Records are tagged to the IDR line. IRO and Medical Review do not share them.
 * The system prepares a draft. A human reviewer signs and submits.
 */

import type { LineOfBusiness } from '@/lib/lines';

export const PARTIES = ['IP', 'NIP'] as const;
export type Party = (typeof PARTIES)[number];

export const DISPUTE_SHAPES = ['single', 'batched'] as const;
export type DisputeShape = (typeof DISPUTE_SHAPES)[number];

export const BRIEF_STATES = ['present', 'absent'] as const;
export type BriefState = (typeof BRIEF_STATES)[number];

export const QPA_WORDINGS = ['single', 'batch'] as const;
export type QpaWording = (typeof QPA_WORDINGS)[number];

export const FIGURE_KINDS = ['ip_offer', 'nip_offer', 'qpa'] as const;
export type FigureKind = (typeof FIGURE_KINDS)[number];

export const DOCUMENT_ROLES = [
  'nip_brief',
  'ip_brief',
  'cv',
  'records',
  'op_report',
  'offer_sheet',
  'qpa_statement',
  'other',
] as const;
export type DocumentRole = (typeof DOCUMENT_ROLES)[number];

export const FACTOR_IDS = [
  'qpa',
  'training_experience',
  'market_share',
  'acuity_complexity',
  'teaching_case_mix',
  'good_faith_efforts',
  'additional_information',
] as const;
export type FactorId = (typeof FACTOR_IDS)[number];

export const REQUIRED_GATE_IDS = [
  'template_match',
  'no_cpt_in_acuity',
  'cv_from_file',
  'qpa_variant',
  'factor_7_rule',
  'neutral_tone',
  'numbers_match_source',
] as const;
export type GateId = (typeof REQUIRED_GATE_IDS)[number];

export const PHRASE_KEYS = [
  'training_from_cv',
  'training_absent',
  'acuity_both',
  'acuity_records',
  'acuity_report',
  'acuity_absent',
  'party_submitted',
  'party_absent',
  'factor_7',
  'qpa_factor',
] as const;
export type PhraseKey = (typeof PHRASE_KEYS)[number];

export interface SourcePointer {
  doc_id: string;
  page: number;
}

export interface RawFigure {
  amount: string | null;
  doc_id: string | null;
  page: number | null;
}

export interface LineItemInput {
  line_id: string;
  label: string;
  ip_offer: RawFigure;
  nip_offer: RawFigure;
  qpa: RawFigure;
}

export interface IdrDocumentInput {
  doc_id: string;
  role: DocumentRole;
  party: Party;
  label: string;
  /** Full text of the file when the role is a curriculum vitae. */
  text?: string;
  /**
   * Exact substring of `text` to quote for training and experience.
   * Ignored unless it is contained in `text`.
   */
  excerpt?: string;
}

export interface FactorMaterialInput {
  factor_id: FactorId;
  party: Party;
  document_ids: readonly string[];
  /** Not copied into the determination. Acuity and Factor 7 credit ignore it. */
  note?: string;
  /** Ignored. Factor 7 is never credited to the initiating party. */
  credit_to?: Party;
}

export interface DeterminationRequest {
  case_id: string;
  dispute_ref: string;
  line_items: readonly LineItemInput[];
  documents: readonly IdrDocumentInput[];
  factor_materials: readonly FactorMaterialInput[];
  asserted_shape?: DisputeShape;
  asserted_nip_brief?: BriefState;
  prevailing_party: Party | null;
  reason: string | null;
}

export interface RecordedLineItem {
  line_id: string;
  label: string;
}

export interface IntakeRecord {
  case_id: string;
  dispute_ref: string;
  shape: DisputeShape;
  nip_brief: BriefState;
  line_items: readonly RecordedLineItem[];
  document_ids: readonly string[];
}

export interface Figure {
  line_id: string;
  kind: FigureKind;
  status: 'present' | 'MISSING';
  amount_cents: number | null;
  source: SourcePointer | null;
}

export interface PartyFactorEvidence {
  party: Party;
  submitted: boolean;
  document_ids: readonly string[];
  excerpt: string | null;
  excerpt_in_file: boolean | null;
}

export interface FactorEvidence {
  factor_id: FactorId;
  number: number;
  label: string;
  ip: PartyFactorEvidence;
  nip: PartyFactorEvidence;
  narrative: string;
  credited_to: Party | null;
}

export interface TemplateMeta {
  id: string;
  version: string;
  party_variant: Party;
  nip_brief: BriefState;
  dispute_shape: DisputeShape;
  qpa_wording: QpaWording;
  path: string;
}

export interface TemplateFile extends TemplateMeta {
  body: string;
  paragraphs: readonly [string, string, string, string];
}

export interface GateDefBase {
  id: GateId;
  blocking: true;
  label: string;
}

export interface TemplateMatchGate extends GateDefBase {
  id: 'template_match';
}

export interface AcuityGate extends GateDefBase {
  id: 'no_cpt_in_acuity';
  factor: 'acuity_complexity';
  forbid_pattern: string;
  forbid_tokens: readonly string[];
  argument_forbid: readonly string[];
}

export interface CvGate extends GateDefBase {
  id: 'cv_from_file';
  factor: 'training_experience';
  source_role: 'cv';
}

export interface QpaVariantGate extends GateDefBase {
  id: 'qpa_variant';
}

export interface Factor7Gate extends GateDefBase {
  id: 'factor_7_rule';
  factor: 'additional_information';
  never_credit_party: 'IP';
  credit_patterns: readonly string[];
}

export interface NeutralToneGate extends GateDefBase {
  id: 'neutral_tone';
  forbid_phrases: readonly string[];
}

export interface NumbersGate extends GateDefBase {
  id: 'numbers_match_source';
}

export type GateDef =
  | TemplateMatchGate
  | AcuityGate
  | CvGate
  | QpaVariantGate
  | Factor7Gate
  | NeutralToneGate
  | NumbersGate;

export interface ChecklistFactor {
  id: FactorId;
  number: number;
  label: string;
  never_credit_party?: 'IP';
}

export interface VariantPhrases {
  IP: string;
  NIP: string;
  brief_present: string;
  brief_absent: string;
  qpa_single: string;
  qpa_batch: string;
}

export interface QaChecklist {
  version: string;
  schema: 'idr-qa-checklist';
  factors: readonly ChecklistFactor[];
  gates: readonly GateDef[];
  variant_phrases: VariantPhrases;
  phrases: Record<PhraseKey, string>;
  ops_markup: readonly string[];
  path: string;
}

export interface IdrContentCatalog {
  checklist: QaChecklist;
  templates: readonly TemplateFile[];
  byId: ReadonlyMap<string, TemplateFile>;
}

export interface DraftStamp {
  template_id: string;
  template_version: string;
  template_path: string;
  checklist_version: string;
  checklist_path: string;
}

export interface GateResult {
  id: GateId | 'ops_markup';
  label: string;
  blocking: true;
  pass: boolean;
  detail: string;
}

export interface BoardFields {
  prevailing_party: Party;
  reason: string;
  date_completed: string;
  note: 'ready for review';
  status: 'ready_for_review';
}

export interface DraftPacket {
  text: string;
  paragraphs: readonly [string, string, string, string];
  factor_block: string;
  stamps: DraftStamp;
  prevailing_party: Party;
  reason: string;
}

export interface IdrDeterminationRecord {
  id: string;
  case_id: string;
  company: 'VANTA_HG';
  line_of_business: Extract<LineOfBusiness, 'IDR'>;
  kind: 'workflow';
  dispute_ref: string;
  status: 'blocked' | 'ready_for_review';
}

export interface DeterminationAuditEvent {
  at: string;
  actor_id: string;
  case_id: string;
  action: 'prepare' | 'sign' | 'submit';
  code: string;
  ok: boolean;
}

export interface ContentProposal {
  ok: true;
  applies_to_runtime_code: false;
  path: string;
  diff: string;
  reviewer_ref: string;
  comment: string;
  schema_valid: true;
}

export interface ContentProposalRefusal {
  ok: false;
  applies_to_runtime_code: false;
  code: 'path_not_content' | 'edit_not_unique' | 'schema_invalid' | 'runtime_path' | 'empty_edit';
  message: string;
}
