/**
 * Map fax / email extractor output to a First Mover intake payload.
 *
 * The existing eFax pipeline (lib/intake/efax/ai-extractor.ts) returns
 * ParsedFaxData — patient name, member ID, CPT/ICD codes, facility info,
 * service category, etc. This module bridges that output to the First
 * Mover IntakePayload shape so the concierge form (or auto-create path)
 * can consume it without re-extraction.
 *
 * Two responsibilities:
 *   1. Field mapping: ParsedFaxData → Partial<IntakePayload>
 *   2. Service-type classification: which First Mover service type this
 *      case looks like (drives which required-fields schema applies).
 *
 * Most fax extractions won't have every First Mover-required field
 * (drug dosage, outpatient service window, admission date, etc.). The
 * mapper returns what it can; the caller checks completeness via
 * validateIntake() and routes to either auto-create or the pre-filled
 * concierge form.
 */

import type { ParsedFaxData } from '@/lib/intake/efax-parser';
import type { IntakePayload, IntakeServiceType } from '@/lib/firstmover/required-fields';

export interface ExtractionToPayloadResult {
  payload: Partial<IntakePayload>;
  service_type_guess: IntakeServiceType;
  /** Confidence in the service-type classification (0..1). */
  service_type_confidence: number;
  /** Which fields the mapper supplied vs left null/empty. Useful for UI hints. */
  supplied_fields: string[];
}

/**
 * Best-effort classifier from extracted fax/email fields to First Mover
 * service type. Order matters — earlier rules win. Conservative when
 * ambiguous (defaults to outpatient).
 */
export function classifyServiceType(parsed: Partial<ParsedFaxData>): {
  type: IntakeServiceType;
  confidence: number;
  reason: string;
} {
  const codes = parsed.procedure_codes || [];
  const facility = parsed.facility_type;
  const category = parsed.service_category;
  const desc = (parsed.procedure_description || '').toLowerCase();
  const text = (parsed.raw_text || '').toLowerCase();

  // Rule 1: facility-type inpatient is a strong signal
  if (facility === 'inpatient') {
    return { type: 'inpatient', confidence: 0.95, reason: 'Facility type is inpatient.' };
  }

  // Rule 2: HCPCS E-prefix is DME
  if (codes.some((c) => /^E\d/.test(c))) {
    return { type: 'dme', confidence: 0.9, reason: 'HCPCS E-code (DME) detected.' };
  }
  if (category === 'dme') {
    return { type: 'dme', confidence: 0.85, reason: 'Service category is DME.' };
  }

  // Rule 3: HCPCS J-codes (drugs) or Q-codes (biologics) → medication
  if (codes.some((c) => /^J\d/.test(c) || /^Q\d/.test(c))) {
    return { type: 'medication', confidence: 0.9, reason: 'HCPCS J/Q-code (drug) detected.' };
  }
  if (category === 'infusion') {
    return { type: 'medication', confidence: 0.85, reason: 'Service category is infusion.' };
  }

  // Rule 4: home health / skilled nursing
  if (category === 'home_health' || category === 'skilled_nursing') {
    return { type: 'home_health', confidence: 0.9, reason: `Service category: ${category}.` };
  }

  // Rule 5: therapy
  if (category === 'rehab_therapy') {
    return { type: 'therapy', confidence: 0.9, reason: 'Service category: rehab_therapy.' };
  }

  // Rule 6: text-mention fallbacks
  if (/admit|admission|hospital stay|inpatient/i.test(desc + text)) {
    return { type: 'inpatient', confidence: 0.6, reason: 'Text mentions admission/inpatient.' };
  }
  if (/physical therapy|occupational therapy|speech therapy|\b(?:pt|ot|st)\b/i.test(desc)) {
    return { type: 'therapy', confidence: 0.7, reason: 'Description mentions PT/OT/ST.' };
  }

  // Default: outpatient
  return { type: 'outpatient', confidence: 0.65, reason: 'Default routing for prior auth.' };
}

/**
 * Map a fax/email extraction to a First Mover IntakePayload (partial).
 * Caller is responsible for filling gaps via the concierge form or
 * deciding the case can't auto-create.
 */
export function mapExtractionToPayload(parsed: Partial<ParsedFaxData>): ExtractionToPayloadResult {
  const supplied: string[] = [];
  const payload: Partial<IntakePayload> = {};

  if (parsed.patient_name) {
    payload.member_name = parsed.patient_name;
    supplied.push('member_name');
  }
  if (parsed.patient_member_id) {
    payload.member_id = parsed.patient_member_id;
    supplied.push('member_id');
  }
  if (parsed.patient_dob) {
    payload.member_dob = parsed.patient_dob;
    supplied.push('member_dob');
  }
  if (parsed.procedure_description) {
    payload.procedure_description = parsed.procedure_description;
    supplied.push('procedure_description');
  }
  if (parsed.procedure_codes && parsed.procedure_codes.length > 0) {
    payload.procedure_codes = parsed.procedure_codes;
    supplied.push('procedure_codes');
  }
  // Note: extractor returns *requesting* provider; First Mover wants
  // *servicing* provider for in-network check. We surface what we have
  // and the nurse confirms — different field, intentional.
  if (parsed.requesting_provider) {
    payload.servicing_provider = parsed.requesting_provider;
    supplied.push('servicing_provider');
  }
  if (parsed.requesting_provider_npi) {
    payload.servicing_provider_npi = parsed.requesting_provider_npi;
    supplied.push('servicing_provider_npi');
  }

  // Service-type-specific fields the extractor may have surfaced
  if (parsed.facility_name) {
    payload.facility_name = parsed.facility_name;
    supplied.push('facility_name');
  }

  // DME items: convert procedure_codes if classified as DME
  const classification = classifyServiceType(parsed);
  if (classification.type === 'dme' && payload.procedure_codes && payload.procedure_codes.length > 0) {
    payload.dme_items = payload.procedure_codes
      .filter((c) => /^E\d/.test(c) || /^K\d/.test(c))
      .map((code) => ({ description: parsed.procedure_description || `Item ${code}`, code }));
    if ((payload.dme_items || []).length > 0) supplied.push('dme_items');
  }

  return {
    payload,
    service_type_guess: classification.type,
    service_type_confidence: classification.confidence,
    supplied_fields: supplied,
  };
}
