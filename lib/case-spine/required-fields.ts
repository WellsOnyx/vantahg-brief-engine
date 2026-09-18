import type { CanonicalCase, IntakePayload } from './types';

/**
 * Minimum viable intake fields from 03. Missing any of these trips R01.
 * Values are tokenized refs / pointers — never raw PHI.
 */
export const REQUIRED_INTAKE_FIELDS = [
  'external_id',
  'member_ref',
  'requesting_provider',
  'service_or_rx',
  'place_of_service',
  'urgency',
  'clinicals_pointer',
  'received_at',
] as const;

export type RequiredIntakeField = (typeof REQUIRED_INTAKE_FIELDS)[number];

export function intakeFromCase(c: CanonicalCase): IntakePayload {
  return {
    external_id: c.external_id ?? c.intake.external_id,
    member_ref: c.intake.member_ref,
    requesting_provider: c.intake.requesting_provider,
    service_or_rx: c.intake.service_or_rx,
    place_of_service: c.intake.place_of_service,
    urgency: c.intake.urgency ?? c.priority,
    clinicals_pointer:
      c.intake.clinicals_pointer ??
      (c.packet_storage_keys.length > 0 ? c.packet_storage_keys[0] : null),
    received_at: c.intake.received_at ?? c.received_at,
    benefit_type: c.intake.benefit_type,
  };
}

export function missingRequiredFields(payload: IntakePayload): RequiredIntakeField[] {
  const missing: RequiredIntakeField[] = [];
  for (const field of REQUIRED_INTAKE_FIELDS) {
    const value = payload[field];
    if (value === null || value === undefined || value === '') {
      missing.push(field);
    }
  }
  return missing;
}

export function isIntakeComplete(payload: IntakePayload): boolean {
  return missingRequiredFields(payload).length === 0;
}
