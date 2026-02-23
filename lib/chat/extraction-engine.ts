import type { CaseFormData } from '@/lib/types';
import type { RequiredFieldStatus } from './types';

// ── Required Fields Definition ──────────────────────────────────────────────

const REQUIRED_FIELDS: { field: keyof CaseFormData; label: string }[] = [
  { field: 'patient_name', label: 'Patient Name' },
  { field: 'patient_dob', label: 'Date of Birth' },
  { field: 'patient_member_id', label: 'Member ID' },
  { field: 'service_category', label: 'Service Category' },
  { field: 'review_type', label: 'Review Type' },
  { field: 'priority', label: 'Priority' },
  { field: 'requesting_provider', label: 'Requesting Provider' },
  { field: 'requesting_provider_npi', label: 'Provider NPI' },
  { field: 'facility_type', label: 'Facility Type' },
  { field: 'procedure_codes', label: 'Procedure Codes' },
  { field: 'procedure_description', label: 'Procedure Description' },
  { field: 'clinical_question', label: 'Clinical Question' },
  { field: 'payer_name', label: 'Payer Name' },
];

// ── Merge Extractions ───────────────────────────────────────────────────────

/**
 * Merges new extraction data into the running state.
 * Array fields (procedure_codes, diagnosis_codes) are appended with dedup.
 * Scalar fields are overwritten.
 */
export function mergeExtraction(
  current: Partial<CaseFormData>,
  incoming: Partial<CaseFormData>
): Partial<CaseFormData> {
  const merged = { ...current };

  for (const [key, value] of Object.entries(incoming)) {
    if (value === null || value === undefined) continue;

    const k = key as keyof CaseFormData;

    // Array fields: append and deduplicate
    if (k === 'procedure_codes' || k === 'diagnosis_codes') {
      const existing = (merged[k] as string[]) || [];
      const incoming = Array.isArray(value) ? value : [value];
      merged[k] = [...new Set([...existing, ...incoming])] as string[];
      continue;
    }

    // Scalar fields: overwrite
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (merged as any)[k] = value;
  }

  return merged;
}

// ── Required Fields Status ──────────────────────────────────────────────────

/**
 * Returns the status of each required field (filled/not filled).
 */
export function getRequiredFieldsStatus(
  data: Partial<CaseFormData>
): RequiredFieldStatus[] {
  return REQUIRED_FIELDS.map(({ field, label }) => {
    const value = data[field];
    let filled = false;

    if (Array.isArray(value)) {
      filled = value.length > 0;
    } else if (typeof value === 'string') {
      filled = value.trim().length > 0;
    } else if (value !== null && value !== undefined) {
      filled = true;
    }

    return { field: field as string, label, filled };
  });
}

/**
 * Returns true when all required fields are populated.
 */
export function isReadyForSubmission(data: Partial<CaseFormData>): boolean {
  return getRequiredFieldsStatus(data).every((f) => f.filled);
}

/**
 * Returns completion percentage (0-100).
 */
export function getCompletionPercent(data: Partial<CaseFormData>): number {
  const statuses = getRequiredFieldsStatus(data);
  const filled = statuses.filter((f) => f.filled).length;
  return Math.round((filled / statuses.length) * 100);
}

/**
 * Returns a natural language hint about what information is still needed.
 * Used in the system prompt to guide Claude's follow-up questions.
 */
export function getNextPromptHint(data: Partial<CaseFormData>): string {
  const missing = getRequiredFieldsStatus(data).filter((f) => !f.filled);

  if (missing.length === 0) {
    return 'All required fields have been collected. You can ask the user to review and confirm before submission.';
  }

  if (missing.length <= 3) {
    const names = missing.map((f) => f.label).join(', ');
    return `Almost there! Still need: ${names}.`;
  }

  // Group by category for a more natural prompt
  const patientFields = missing.filter((f) =>
    ['Patient Name', 'Date of Birth', 'Member ID'].includes(f.label)
  );
  const clinicalFields = missing.filter((f) =>
    ['Procedure Codes', 'Procedure Description', 'Clinical Question', 'Service Category', 'Review Type'].includes(f.label)
  );
  const providerFields = missing.filter((f) =>
    ['Requesting Provider', 'Provider NPI', 'Facility Type'].includes(f.label)
  );

  const hints: string[] = [];
  if (patientFields.length > 0) {
    hints.push(`Patient info (${patientFields.map((f) => f.label).join(', ')})`);
  }
  if (clinicalFields.length > 0) {
    hints.push(`Clinical details (${clinicalFields.map((f) => f.label).join(', ')})`);
  }
  if (providerFields.length > 0) {
    hints.push(`Provider info (${providerFields.map((f) => f.label).join(', ')})`);
  }
  const payerMissing = missing.find((f) => f.label === 'Payer Name');
  if (payerMissing) hints.push('Payer Name');
  const priorityMissing = missing.find((f) => f.label === 'Priority');
  if (priorityMissing) hints.push('Priority');

  return `Still needed: ${hints.join('; ')}.`;
}
