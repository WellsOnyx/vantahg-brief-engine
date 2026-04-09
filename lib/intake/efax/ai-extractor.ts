/**
 * AI-powered clinical data extractor for inbound e-fax authorization requests.
 *
 * This is the successor to the regex parser in `lib/intake/efax-parser.ts`. It
 * consumes OCR text (plus optional metadata) and produces a `ParsedFaxData`
 * object in the exact shape that `app/api/intake/efax/route.ts` already
 * consumes, so it's a drop-in replacement.
 *
 * Decision tree:
 *   1. Demo mode OR missing ANTHROPIC_API_KEY -> return a deterministic canned
 *      extraction matching the OCR demo stub (Sarah Johnson / CPT 27447 / M17.11).
 *      method = 'demo'.
 *   2. Otherwise, call the Anthropic Messages API (claude-opus-4-6) with a
 *      single tool (`record_fax_extraction`) whose input_schema is a strict
 *      JSON Schema mirror of ParsedFaxData. `tool_choice` forces the model to
 *      emit that tool call, so we get guaranteed structured output.
 *      method = 'ai'.
 *   3. If the API call throws or returns something malformed, fall back to the
 *      existing regex parser via `parseEfaxPayload()`. method = 'regex_fallback'
 *      and the error is surfaced in `warnings`.
 *
 * This module is a pure function of its inputs: no logging, no storage, no
 * database side effects. `warnings` are returned in-memory and may contain
 * PHI, so callers must NOT write them to the audit log.
 */

import Anthropic from '@anthropic-ai/sdk';
import type {
  ServiceCategory,
  ReviewType,
  CasePriority,
  FacilityType,
} from '../../types';
import {
  parseEfaxPayload,
  type EfaxPayload,
  type ParsedFaxData,
} from '../efax-parser';
import { isDemoMode } from '../../demo-mode';

// ── Public types ────────────────────────────────────────────────────────────

export interface AiExtractorInput {
  ocr_text: string;
  ocr_confidence: number;
  from_number?: string | null;
  page_count?: number | null;
}

export interface AiExtractorResult {
  parsed: ParsedFaxData;
  method: 'ai' | 'regex_fallback' | 'demo';
  model?: string;
  tokens_used?: number;
  warnings: string[];
}

// ── Constants ───────────────────────────────────────────────────────────────

const MODEL = 'claude-opus-4-6';
const MAX_TOKENS = 2000;
const TOOL_NAME = 'record_fax_extraction';

const SERVICE_CATEGORY_VALUES: ServiceCategory[] = [
  'imaging',
  'surgery',
  'specialty_referral',
  'dme',
  'infusion',
  'behavioral_health',
  'rehab_therapy',
  'home_health',
  'skilled_nursing',
  'transplant',
  'genetic_testing',
  'pain_management',
  'cardiology',
  'oncology',
  'ophthalmology',
  'workers_comp',
  'emergency_medicine',
  'internal_medicine',
  'other',
];

const REVIEW_TYPE_VALUES: ReviewType[] = [
  'prior_auth',
  'medical_necessity',
  'concurrent',
  'retrospective',
  'peer_to_peer',
  'appeal',
  'second_level_review',
];

const PRIORITY_VALUES: CasePriority[] = ['standard', 'urgent', 'expedited'];

const FACILITY_TYPE_VALUES: FacilityType[] = [
  'inpatient',
  'outpatient',
  'asc',
  'office',
  'home',
];

// ── JSON Schema for the structured tool call ──────────────────────────────

const EXTRACTION_TOOL_SCHEMA = {
  type: 'object' as const,
  properties: {
    patient_name: { type: ['string', 'null'] },
    patient_dob: { type: ['string', 'null'] },
    patient_member_id: { type: ['string', 'null'] },
    patient_gender: { type: ['string', 'null'] },

    requesting_provider: { type: ['string', 'null'] },
    requesting_provider_npi: {
      type: ['string', 'null'],
      description: '10-digit NPI number, no separators',
    },
    requesting_provider_specialty: { type: ['string', 'null'] },
    requesting_provider_fax: { type: ['string', 'null'] },
    requesting_provider_phone: { type: ['string', 'null'] },

    procedure_codes: {
      type: 'array',
      items: { type: 'string' },
      description: 'Array of CPT (5-digit) or HCPCS (letter+4-digit) codes',
    },
    diagnosis_codes: {
      type: 'array',
      items: { type: 'string' },
      description: 'Array of ICD-10 codes (e.g. M17.11, G47.33)',
    },
    procedure_description: { type: ['string', 'null'] },

    service_category: {
      type: ['string', 'null'],
      enum: [...SERVICE_CATEGORY_VALUES, null],
    },
    review_type: {
      type: ['string', 'null'],
      enum: [...REVIEW_TYPE_VALUES, null],
    },
    priority: {
      type: 'string',
      enum: PRIORITY_VALUES,
    },
    facility_name: { type: ['string', 'null'] },
    facility_type: {
      type: ['string', 'null'],
      enum: [...FACILITY_TYPE_VALUES, null],
    },

    payer_name: { type: ['string', 'null'] },
    plan_type: { type: ['string', 'null'] },

    confidence: {
      type: 'number',
      minimum: 0,
      maximum: 100,
      description: 'AI self-assessed confidence 0-100 in the extraction',
    },
    needs_manual_review: { type: 'boolean' },
    manual_review_reasons: {
      type: 'array',
      items: { type: 'string' },
    },
  },
  required: [
    'patient_name',
    'patient_dob',
    'patient_member_id',
    'patient_gender',
    'requesting_provider',
    'requesting_provider_npi',
    'requesting_provider_specialty',
    'requesting_provider_fax',
    'requesting_provider_phone',
    'procedure_codes',
    'diagnosis_codes',
    'procedure_description',
    'service_category',
    'review_type',
    'priority',
    'facility_name',
    'facility_type',
    'payer_name',
    'plan_type',
    'confidence',
    'needs_manual_review',
    'manual_review_reasons',
  ],
};

const SYSTEM_PROMPT = `You are a utilization-review intake assistant. You are reading an OCR transcription of an authorization-request fax sent from a healthcare provider to a payer. Your job is to extract structured clinical data.

CRITICAL RULES:
- Extract conservatively. Null is always better than a hallucinated value.
- Only return values that are explicitly present in the text.
- Procedure codes must be valid CPT (5 digits, e.g. "27447") or HCPCS (letter + 4 digits, e.g. "E0601"). Do not guess.
- Diagnosis codes must be valid ICD-10 format (letter + 2 digits + optional dot + more chars, e.g. "M17.11", "G47.33").
- NPI is a 10-digit number.
- Classify service_category, review_type, priority, and facility_type using only the provided enum values.
- Default review_type to "prior_auth" when the fax is clearly an auth request but no explicit review type is stated.
- Default priority to "standard" unless the fax says urgent/stat/expedited.
- Set needs_manual_review=true if any important field (patient name, procedure code, provider) is missing or ambiguous.
- Self-report your confidence (0-100) based on OCR clarity and completeness of the fax.
- Call the record_fax_extraction tool exactly once with your extraction. Do not reply with any other text.`;

// ── Main entry point ───────────────────────────────────────────────────────

export async function extractClinicalDataFromFax(
  input: AiExtractorInput
): Promise<AiExtractorResult> {
  const warnings: string[] = [];

  // 1) Demo path
  if (isDemoMode() || !process.env.ANTHROPIC_API_KEY) {
    const parsed = buildDemoParsedFax(input);
    return {
      parsed,
      method: 'demo',
      warnings,
    };
  }

  // 2) AI path
  try {
    const aiResult = await callAnthropicExtractor(input);
    const parsed = finalizeParsedFax(aiResult.extraction, input, warnings);
    return {
      parsed,
      method: 'ai',
      model: MODEL,
      tokens_used: aiResult.tokensUsed,
      warnings,
    };
  } catch (err) {
    // 3) Regex fallback path
    const message = err instanceof Error ? err.message : String(err);
    warnings.push(`AI extraction failed, falling back to regex parser: ${message}`);

    const fallbackPayload: EfaxPayload = {
      fax_id: '',
      from_number: input.from_number ?? '',
      to_number: '',
      received_at: new Date().toISOString(),
      page_count: input.page_count ?? 0,
      ocr_text: input.ocr_text,
      ocr_confidence: input.ocr_confidence,
    };
    const parsed = parseEfaxPayload(fallbackPayload);
    // Ensure passthroughs
    parsed.raw_text = input.ocr_text;
    if (!parsed.requesting_provider_fax && input.from_number) {
      parsed.requesting_provider_fax = input.from_number;
    }
    applyManualReviewGates(parsed, input.ocr_confidence);
    return {
      parsed,
      method: 'regex_fallback',
      warnings,
    };
  }
}

// ── Anthropic call (exported-ish for testability) ──────────────────────────

interface AnthropicExtractionResult {
  extraction: RawAiExtraction;
  tokensUsed: number;
}

interface RawAiExtraction {
  patient_name: string | null;
  patient_dob: string | null;
  patient_member_id: string | null;
  patient_gender: string | null;
  requesting_provider: string | null;
  requesting_provider_npi: string | null;
  requesting_provider_specialty: string | null;
  requesting_provider_fax: string | null;
  requesting_provider_phone: string | null;
  procedure_codes: string[];
  diagnosis_codes: string[];
  procedure_description: string | null;
  service_category: ServiceCategory | null;
  review_type: ReviewType | null;
  priority: CasePriority;
  facility_name: string | null;
  facility_type: FacilityType | null;
  payer_name: string | null;
  plan_type: string | null;
  confidence: number;
  needs_manual_review: boolean;
  manual_review_reasons: string[];
}

async function callAnthropicExtractor(
  input: AiExtractorInput
): Promise<AnthropicExtractionResult> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const userContent = `OCR confidence: ${input.ocr_confidence}
Fax from number: ${input.from_number ?? 'unknown'}
Page count: ${input.page_count ?? 'unknown'}

----- BEGIN OCR TEXT -----
${input.ocr_text}
----- END OCR TEXT -----

Call the record_fax_extraction tool with the extracted structured data.`;

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system: SYSTEM_PROMPT,
    tools: [
      {
        name: TOOL_NAME,
        description:
          'Record the structured clinical data extracted from an authorization fax.',
        input_schema: EXTRACTION_TOOL_SCHEMA,
      },
    ],
    tool_choice: { type: 'tool', name: TOOL_NAME },
    messages: [{ role: 'user', content: userContent }],
  });

  const toolUse = response.content.find(
    (block): block is Extract<typeof block, { type: 'tool_use' }> =>
      block.type === 'tool_use' && block.name === TOOL_NAME
  );

  if (!toolUse) {
    throw new Error('Model did not return a record_fax_extraction tool_use block');
  }

  const extraction = coerceExtraction(toolUse.input);
  const tokensUsed =
    (response.usage?.input_tokens ?? 0) + (response.usage?.output_tokens ?? 0);

  return { extraction, tokensUsed };
}

// ── Coercion / validation ──────────────────────────────────────────────────

function coerceExtraction(raw: unknown): RawAiExtraction {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Tool input was not an object');
  }
  const r = raw as Record<string, unknown>;

  const asStringOrNull = (v: unknown): string | null =>
    typeof v === 'string' && v.trim().length > 0 ? v.trim() : null;

  const asStringArray = (v: unknown): string[] =>
    Array.isArray(v)
      ? v.filter((x): x is string => typeof x === 'string' && x.length > 0)
      : [];

  const asEnum = <T extends string>(v: unknown, allowed: readonly T[]): T | null => {
    if (typeof v !== 'string') return null;
    return (allowed as readonly string[]).includes(v) ? (v as T) : null;
  };

  const priority =
    asEnum(r.priority, PRIORITY_VALUES) ?? ('standard' as CasePriority);

  const confidenceNum =
    typeof r.confidence === 'number' && Number.isFinite(r.confidence)
      ? Math.max(0, Math.min(100, r.confidence))
      : 0;

  return {
    patient_name: asStringOrNull(r.patient_name),
    patient_dob: asStringOrNull(r.patient_dob),
    patient_member_id: asStringOrNull(r.patient_member_id),
    patient_gender: asStringOrNull(r.patient_gender),
    requesting_provider: asStringOrNull(r.requesting_provider),
    requesting_provider_npi: asStringOrNull(r.requesting_provider_npi),
    requesting_provider_specialty: asStringOrNull(r.requesting_provider_specialty),
    requesting_provider_fax: asStringOrNull(r.requesting_provider_fax),
    requesting_provider_phone: asStringOrNull(r.requesting_provider_phone),
    procedure_codes: asStringArray(r.procedure_codes),
    diagnosis_codes: asStringArray(r.diagnosis_codes),
    procedure_description: asStringOrNull(r.procedure_description),
    service_category: asEnum(r.service_category, SERVICE_CATEGORY_VALUES),
    review_type: asEnum(r.review_type, REVIEW_TYPE_VALUES),
    priority,
    facility_name: asStringOrNull(r.facility_name),
    facility_type: asEnum(r.facility_type, FACILITY_TYPE_VALUES),
    payer_name: asStringOrNull(r.payer_name),
    plan_type: asStringOrNull(r.plan_type),
    confidence: confidenceNum,
    needs_manual_review: Boolean(r.needs_manual_review),
    manual_review_reasons: asStringArray(r.manual_review_reasons),
  };
}

// ── Finalization ───────────────────────────────────────────────────────────

function finalizeParsedFax(
  ai: RawAiExtraction,
  input: AiExtractorInput,
  warnings: string[]
): ParsedFaxData {
  const blendedConfidence = Math.min(input.ocr_confidence, ai.confidence);

  const parsed: ParsedFaxData = {
    patient_name: ai.patient_name,
    patient_dob: ai.patient_dob,
    patient_member_id: ai.patient_member_id,
    patient_gender: ai.patient_gender,

    requesting_provider: ai.requesting_provider,
    requesting_provider_npi: ai.requesting_provider_npi,
    requesting_provider_specialty: ai.requesting_provider_specialty,
    requesting_provider_fax: ai.requesting_provider_fax ?? input.from_number ?? null,
    requesting_provider_phone: ai.requesting_provider_phone,

    procedure_codes: ai.procedure_codes,
    diagnosis_codes: ai.diagnosis_codes,
    procedure_description: ai.procedure_description,

    service_category: ai.service_category,
    review_type: ai.review_type,
    priority: ai.priority,
    facility_name: ai.facility_name,
    facility_type: ai.facility_type,

    payer_name: ai.payer_name,
    plan_type: ai.plan_type,

    raw_text: input.ocr_text,
    confidence: blendedConfidence,

    needs_manual_review: ai.needs_manual_review,
    manual_review_reasons: [...ai.manual_review_reasons],
  };

  if (ai.confidence < input.ocr_confidence) {
    warnings.push(
      `Blended confidence lowered to ${blendedConfidence} (OCR ${input.ocr_confidence}, AI ${ai.confidence}).`
    );
  }

  applyManualReviewGates(parsed, input.ocr_confidence);
  return parsed;
}

function applyManualReviewGates(parsed: ParsedFaxData, ocrConfidence: number): void {
  const reasons = new Set(parsed.manual_review_reasons);
  let needsReview = parsed.needs_manual_review;

  if (ocrConfidence < 70) {
    reasons.add('Low OCR confidence');
    needsReview = true;
  }
  if (!parsed.patient_name) {
    reasons.add('Patient name not extracted');
    needsReview = true;
  }
  if (parsed.procedure_codes.length === 0) {
    reasons.add('No procedure codes found');
    needsReview = true;
  }
  if (parsed.confidence < 75) {
    reasons.add('Blended confidence below 75');
    needsReview = true;
  }

  parsed.needs_manual_review = needsReview;
  parsed.manual_review_reasons = Array.from(reasons);
}

// ── Demo mode canned extraction ────────────────────────────────────────────

function buildDemoParsedFax(input: AiExtractorInput): ParsedFaxData {
  const parsed: ParsedFaxData = {
    patient_name: 'Sarah Johnson',
    patient_dob: '1962-03-15',
    patient_member_id: 'WET-8472910',
    patient_gender: 'Female',

    requesting_provider: 'Dr. Michael Chen, MD',
    requesting_provider_npi: '1841293756',
    requesting_provider_specialty: 'Orthopedic Surgery',
    requesting_provider_fax: input.from_number ?? '+15558675309',
    requesting_provider_phone: '+15558675300',

    procedure_codes: ['27447'],
    diagnosis_codes: ['M17.11'],
    procedure_description:
      'Total knee arthroplasty, right knee, for primary osteoarthritis',

    service_category: 'surgery',
    review_type: 'prior_auth',
    priority: 'standard',
    facility_name: 'Pacific Regional Medical Center',
    facility_type: 'inpatient',

    payer_name: 'Western Employers Trust',
    plan_type: 'PPO',

    raw_text: input.ocr_text,
    confidence: Math.min(input.ocr_confidence || 95, 95),

    needs_manual_review: false,
    manual_review_reasons: [],
  };

  applyManualReviewGates(parsed, input.ocr_confidence || 95);
  return parsed;
}
