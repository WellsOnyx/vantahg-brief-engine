/**
 * Shared mapping from a Gravity Rail handoff payload (Channel A,
 * docs/INTAKE_CONTRACT.md) into the case-row fields the brief engine owns.
 *
 * Prefers structured `field_values` (canonical keys). Falls back to the
 * shared text extractor over the transcript. Does not log payload contents.
 */

import { parseEmailPayload, type EmailPayload, type ParsedEmailData } from '@/lib/intake/email-parser';

export interface GrHandoffPayload {
  event?: string;
  chat_id?: number | string;
  workspace_id?: string;
  wid?: string;
  workflow_id?: number | string;
  member?: { email?: string; name?: string };
  transcript?: string | Array<{ role?: string; content: string }>;
  field_values?: Record<string, unknown>;
  from_number?: string;
  title?: string;
}

export interface GrHandoffCaseFields {
  patient_name: string;
  patient_dob: string | null;
  patient_member_id: string | null;
  procedure_codes: string[];
  diagnosis_codes: string[];
  procedure_description: string;
  clinical_question: string | null;
  requesting_provider: string | null;
  requesting_provider_npi: string | null;
  facility_name: string | null;
  payer_name: string | null;
  priority: 'standard' | 'urgent' | 'expedited';
  extraction_source: 'field_values' | 'transcript';
}

function transcriptToText(transcript: GrHandoffPayload['transcript']): string {
  if (typeof transcript === 'string') return transcript;
  if (!Array.isArray(transcript)) return '';
  return transcript
    .filter((m) => m && typeof m.content === 'string')
    .map((m) => `${m.role ?? 'speaker'}: ${m.content}`)
    .join('\n');
}

function asArr(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(String).map((s) => s.trim()).filter(Boolean);
  if (typeof v === 'string' && v.trim()) {
    return v.split(/[,;\s]+/).map((s) => s.trim()).filter(Boolean);
  }
  return [];
}

function asPriority(v: unknown): 'standard' | 'urgent' | 'expedited' | undefined {
  return v === 'standard' || v === 'urgent' || v === 'expedited' ? v : undefined;
}

/**
 * Map a Channel A handoff body onto the case insert shape. Unknown
 * field_values keys are ignored. Missing clinical fields fall back to
 * transcript extraction, then to a non-PHI placeholder name.
 */
export function normalizeGrHandoff(payload: GrHandoffPayload): GrHandoffCaseFields {
  const fv = payload.field_values ?? {};
  const transcriptText =
    transcriptToText(payload.transcript) ||
    (typeof fv.transcript === 'string' ? fv.transcript : '');

  const emailPayload: EmailPayload = {
    from: payload.from_number || 'gr-handoff@vantaum.com',
    to: 'intake@vantaum.com',
    subject: payload.title || 'Gravity Rail intake',
    text: transcriptText,
    attachments: 0,
  };
  const parsed: ParsedEmailData = parseEmailPayload(emailPayload);

  const procedureCodes = asArr(fv.procedure_codes);
  const diagnosisCodes = asArr(fv.diagnosis_codes);
  const fvName = typeof fv.patient_name === 'string' ? fv.patient_name.trim() : '';
  const memberName = payload.member?.name?.trim() || '';
  const hasStructured =
    Object.keys(fv).length > 0 &&
    (fvName || procedureCodes.length > 0 || typeof fv.clinical_summary === 'string');

  return {
    patient_name: fvName || parsed.patient_name || memberName || 'GR Member',
    patient_dob:
      (typeof fv.patient_dob === 'string' && fv.patient_dob.trim()) || parsed.patient_dob || null,
    patient_member_id:
      (typeof fv.member_id === 'string' && fv.member_id.trim()) || parsed.member_id || null,
    procedure_codes: procedureCodes.length > 0 ? procedureCodes : parsed.procedure_codes,
    diagnosis_codes: diagnosisCodes.length > 0 ? diagnosisCodes : parsed.diagnosis_codes,
    procedure_description:
      (typeof fv.clinical_summary === 'string' && fv.clinical_summary.trim()) ||
      parsed.clinical_notes ||
      payload.title ||
      'Gravity Rail intake',
    clinical_question: parsed.clinical_notes || null,
    requesting_provider:
      (typeof fv.provider_name === 'string' && fv.provider_name.trim()) || parsed.provider_name || null,
    requesting_provider_npi:
      (typeof fv.provider_npi === 'string' && fv.provider_npi.trim()) || parsed.provider_npi || null,
    facility_name:
      (typeof fv.facility_name === 'string' && fv.facility_name.trim()) || parsed.facility_name || null,
    payer_name: (typeof fv.payer_name === 'string' && fv.payer_name.trim()) || parsed.payer_name || null,
    priority: asPriority(fv.priority) ?? parsed.priority,
    extraction_source: hasStructured ? 'field_values' : 'transcript',
  };
}
