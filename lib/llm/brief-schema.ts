/**
 * AIBrief schema — single source of truth for the brief contract.
 *
 * Three things are exported:
 *   - `AIBriefSchema`: zod schema for runtime validation of model output.
 *   - `BRIEF_TOOL_INPUT_SCHEMA`: JSON Schema for Anthropic tool-use, so the
 *     model is constrained to emit a structured payload rather than free-text
 *     JSON we have to parse.
 *   - `validateAIBrief()`: convenience wrapper that returns either a parsed
 *     brief or a stable, low-cardinality reason string for retry feedback.
 *
 * Why both schemas: the JSON Schema goes into the tool definition (Anthropic's
 * API only accepts JSON Schema), and the zod schema validates what came back
 * (Anthropic enforces the schema's shape but its enums and constraints aren't
 * guaranteed on every field — we re-validate to be safe). Both are derived
 * from the same TypeScript `AIBrief` shape in lib/types.ts.
 */

import { z } from 'zod';
import type { AIBrief } from '../types';

// ── zod schema ─────────────────────────────────────────────────────────────

const RecommendationEnum = z.enum(['approve', 'deny', 'pend', 'peer_to_peer_recommended']);
const ConfidenceEnum = z.enum(['high', 'medium', 'low']);
const ComplexityEnum = z.enum(['routine', 'moderate', 'complex']);

export const AIBriefSchema = z.object({
  clinical_question: z.string().min(1),
  patient_summary: z.string().min(1),
  diagnosis_analysis: z.object({
    primary_diagnosis: z.string(),
    secondary_diagnoses: z.array(z.string()),
    diagnosis_procedure_alignment: z.string(),
  }),
  procedure_analysis: z.object({
    codes: z.array(z.string()),
    clinical_rationale: z.string(),
    complexity_level: ComplexityEnum,
    setting_appropriateness: z.string(),
  }),
  criteria_match: z.object({
    guideline_source: z.string(),
    applicable_guideline: z.string(),
    criteria_met: z.array(z.string()),
    criteria_not_met: z.array(z.string()),
    criteria_unable_to_assess: z.array(z.string()),
    conservative_alternatives: z.array(z.string()),
  }),
  documentation_review: z.object({
    documents_provided: z.string(),
    key_findings: z.array(z.string()),
    missing_documentation: z.array(z.string()),
  }),
  ai_recommendation: z.object({
    recommendation: RecommendationEnum,
    confidence: ConfidenceEnum,
    rationale: z.string(),
    key_considerations: z.array(z.string()),
    if_modify_suggestion: z.string().nullable(),
  }),
  reviewer_action: z.object({
    decision_required: z.string(),
    time_sensitivity: z.string(),
    peer_to_peer_suggested: z.boolean(),
    additional_info_needed: z.array(z.string()),
    state_specific_requirements: z.array(z.string()),
  }),
});

export type ValidatedAIBrief = z.infer<typeof AIBriefSchema>;

// ── JSON Schema for tool definition ────────────────────────────────────────

const stringArray = { type: 'array', items: { type: 'string' } } as const;

export const BRIEF_TOOL_INPUT_SCHEMA = {
  type: 'object',
  properties: {
    clinical_question: { type: 'string' },
    patient_summary: { type: 'string' },
    diagnosis_analysis: {
      type: 'object',
      properties: {
        primary_diagnosis: { type: 'string' },
        secondary_diagnoses: stringArray,
        diagnosis_procedure_alignment: { type: 'string' },
      },
      required: ['primary_diagnosis', 'secondary_diagnoses', 'diagnosis_procedure_alignment'],
    },
    procedure_analysis: {
      type: 'object',
      properties: {
        codes: stringArray,
        clinical_rationale: { type: 'string' },
        complexity_level: { type: 'string', enum: ['routine', 'moderate', 'complex'] },
        setting_appropriateness: { type: 'string' },
      },
      required: ['codes', 'clinical_rationale', 'complexity_level', 'setting_appropriateness'],
    },
    criteria_match: {
      type: 'object',
      properties: {
        guideline_source: { type: 'string' },
        applicable_guideline: { type: 'string' },
        criteria_met: stringArray,
        criteria_not_met: stringArray,
        criteria_unable_to_assess: stringArray,
        conservative_alternatives: stringArray,
      },
      required: [
        'guideline_source',
        'applicable_guideline',
        'criteria_met',
        'criteria_not_met',
        'criteria_unable_to_assess',
        'conservative_alternatives',
      ],
    },
    documentation_review: {
      type: 'object',
      properties: {
        documents_provided: { type: 'string' },
        key_findings: stringArray,
        missing_documentation: stringArray,
      },
      required: ['documents_provided', 'key_findings', 'missing_documentation'],
    },
    ai_recommendation: {
      type: 'object',
      properties: {
        recommendation: {
          type: 'string',
          enum: ['approve', 'deny', 'pend', 'peer_to_peer_recommended'],
        },
        confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
        rationale: { type: 'string' },
        key_considerations: stringArray,
        if_modify_suggestion: { type: ['string', 'null'] },
      },
      required: ['recommendation', 'confidence', 'rationale', 'key_considerations', 'if_modify_suggestion'],
    },
    reviewer_action: {
      type: 'object',
      properties: {
        decision_required: { type: 'string' },
        time_sensitivity: { type: 'string' },
        peer_to_peer_suggested: { type: 'boolean' },
        additional_info_needed: stringArray,
        state_specific_requirements: stringArray,
      },
      required: [
        'decision_required',
        'time_sensitivity',
        'peer_to_peer_suggested',
        'additional_info_needed',
        'state_specific_requirements',
      ],
    },
  },
  required: [
    'clinical_question',
    'patient_summary',
    'diagnosis_analysis',
    'procedure_analysis',
    'criteria_match',
    'documentation_review',
    'ai_recommendation',
    'reviewer_action',
  ],
} as const;

// ── Validation helper ──────────────────────────────────────────────────────

export interface BriefValidationOk {
  ok: true;
  brief: AIBrief;
}

export interface BriefValidationErr {
  ok: false;
  /**
   * Low-cardinality summary of what failed: top-level field paths only, no
   * raw values. Safe to include in a retry prompt back to the model.
   */
  reason: string;
}

export type BriefValidationResult = BriefValidationOk | BriefValidationErr;

export function validateAIBrief(raw: unknown): BriefValidationResult {
  const parsed = AIBriefSchema.safeParse(raw);
  if (parsed.success) {
    return { ok: true, brief: parsed.data as AIBrief };
  }

  // Reduce zod issues to a "field: code" list. We deliberately drop the
  // received value because it may contain PHI from the model's output.
  const issues = parsed.error.issues.slice(0, 8).map((i) => {
    const path = i.path.length > 0 ? i.path.join('.') : '<root>';
    return `${path}: ${i.code}`;
  });
  return { ok: false, reason: issues.join('; ') };
}
