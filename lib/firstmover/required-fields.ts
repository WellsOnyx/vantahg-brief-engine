/**
 * Required-fields gate for First Mover intake.
 *
 * Encodes Santana Anderson's rules from the May 7 2026 ops call: don't open
 * an authorization (and don't start the SLA clock) until the caller has
 * provided the minimum data set for the service type. Incomplete callers
 * are advised to call back rather than entering a half-baked case.
 *
 * Source taxonomy: outpatient | medication | home_health | therapy |
 * inpatient | dme. Every service type inherits the COMMON fields and adds
 * its own.
 */

export type IntakeServiceType =
  | 'outpatient'
  | 'medication'
  | 'home_health'
  | 'therapy'
  | 'inpatient'
  | 'dme';

export interface IntakePayload {
  // Common
  member_name?: string;
  member_id?: string;
  member_dob?: string;
  date_of_service?: string;
  procedure_description?: string;
  procedure_codes?: string[];
  servicing_provider?: string;
  servicing_provider_npi?: string;
  servicing_provider_address?: string;

  // Outpatient
  service_window_start?: string;
  service_window_end?: string;

  // Medication
  drug_name?: string;
  drug_dosage?: string;
  drug_frequency?: string;

  // Home health / therapy
  visit_frequency?: string;
  visit_duration?: string;

  // Inpatient
  facility_name?: string;
  admission_date?: string;

  // DME — codes already covered by procedure_codes; checked separately for "every item"
  dme_items?: Array<{ description: string; code: string }>;
}

interface FieldSpec {
  /** Key in the payload */
  key: keyof IntakePayload;
  /** Caller-friendly label, used in scripts */
  label: string;
  /** Optional validator beyond presence. Returns true when valid. */
  validate?: (value: unknown) => boolean;
}

const isNonEmptyString = (v: unknown): v is string =>
  typeof v === 'string' && v.trim().length > 0;

const isNonEmptyArray = (v: unknown): v is unknown[] =>
  Array.isArray(v) && v.length > 0;

const isISODate = (v: unknown): boolean => {
  if (!isNonEmptyString(v)) return false;
  // Accept YYYY-MM-DD or full ISO. Don't be picky — caller may have just typed.
  return !Number.isNaN(Date.parse(v));
};

const COMMON_FIELDS: FieldSpec[] = [
  { key: 'member_name', label: 'member name', validate: isNonEmptyString },
  { key: 'member_id', label: 'member ID', validate: isNonEmptyString },
  { key: 'date_of_service', label: 'date of service', validate: isISODate },
  { key: 'procedure_description', label: 'procedure or service description', validate: isNonEmptyString },
  { key: 'servicing_provider_npi', label: 'servicing provider NPI', validate: isNonEmptyString },
  { key: 'servicing_provider_address', label: 'service location address', validate: isNonEmptyString },
];

const SERVICE_TYPE_FIELDS: Record<IntakeServiceType, FieldSpec[]> = {
  outpatient: [
    { key: 'service_window_start', label: 'start of 3-month service window', validate: isISODate },
    { key: 'service_window_end', label: 'end of 3-month service window', validate: isISODate },
  ],
  medication: [
    { key: 'drug_name', label: 'drug name', validate: isNonEmptyString },
    { key: 'drug_dosage', label: 'dosage', validate: isNonEmptyString },
    { key: 'drug_frequency', label: 'frequency', validate: isNonEmptyString },
  ],
  home_health: [
    { key: 'visit_frequency', label: 'visit frequency', validate: isNonEmptyString },
    { key: 'visit_duration', label: 'duration of services', validate: isNonEmptyString },
  ],
  therapy: [
    { key: 'visit_frequency', label: 'visit frequency', validate: isNonEmptyString },
    { key: 'visit_duration', label: 'duration of therapy', validate: isNonEmptyString },
  ],
  inpatient: [
    { key: 'facility_name', label: 'facility name', validate: isNonEmptyString },
    { key: 'admission_date', label: 'admission date', validate: isISODate },
  ],
  dme: [
    {
      key: 'dme_items',
      label: 'CPT/HCPCS code for each DME item',
      validate: (v) => isNonEmptyArray(v) && (v as unknown[]).every((item) => {
        const obj = item as { description?: unknown; code?: unknown };
        return isNonEmptyString(obj?.description) && isNonEmptyString(obj?.code);
      }),
    },
  ],
};

export interface ValidationResult {
  valid: boolean;
  missing: { key: string; label: string }[];
}

export function validateIntake(
  payload: IntakePayload,
  serviceType: IntakeServiceType
): ValidationResult {
  const required = [...COMMON_FIELDS, ...SERVICE_TYPE_FIELDS[serviceType]];
  const missing = required
    .filter((spec) => {
      const value = payload[spec.key];
      if (value === undefined || value === null) return true;
      if (spec.validate) return !spec.validate(value);
      return !isNonEmptyString(value);
    })
    .map((spec) => ({ key: String(spec.key), label: spec.label }));

  return { valid: missing.length === 0, missing };
}

/**
 * Caller-friendly script. The concierge reads this aloud when refusing to
 * open the auth: "We need a few more things before we can submit this.
 * Please call back with: member ID, date of service, and the servicing
 * provider's NPI."
 */
export function formatMissingForCaller(
  missing: ValidationResult['missing']
): string {
  if (missing.length === 0) return '';
  const labels = missing.map((m) => m.label);
  if (labels.length === 1) return labels[0];
  if (labels.length === 2) return `${labels[0]} and ${labels[1]}`;
  return `${labels.slice(0, -1).join(', ')}, and ${labels[labels.length - 1]}`;
}

export function getRequiredFieldLabels(
  serviceType: IntakeServiceType
): string[] {
  return [...COMMON_FIELDS, ...SERVICE_TYPE_FIELDS[serviceType]].map((s) => s.label);
}
