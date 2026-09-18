import {
  DENY_REASON_CODES,
  type CmFlag,
  type CriteriaResult,
  type DenyReasonCode,
  type SpineDetermination,
} from './types';

export function isDenyReasonCode(value: unknown): value is DenyReasonCode {
  return typeof value === 'string' && (DENY_REASON_CODES as readonly string[]).includes(value);
}

/**
 * Normalize a deny reason for 08 reporting. Non-deny determinations
 * never carry a code. Explicit MD override wins; otherwise map from
 * criteria / CM flags.
 */
export function normalizeDenyReason(input: {
  determination: SpineDetermination;
  deny_reason_code?: DenyReasonCode | string | null;
  criteria_result?: CriteriaResult | null;
  cm_flags?: CmFlag[];
}): DenyReasonCode | null {
  if (input.determination !== 'deny') return null;
  if (isDenyReasonCode(input.deny_reason_code)) return input.deny_reason_code;
  if (input.cm_flags?.includes('deny_with_alternative')) return 'alternative_available';
  if (input.criteria_result === 'fail') return 'criteria_not_met';
  if (input.criteria_result === 'gray') return 'insufficient_documentation';
  return 'medical_necessity';
}
