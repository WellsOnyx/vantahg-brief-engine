import { describe, it, expect } from 'vitest';
import {
  validateIntake,
  formatMissingForCaller,
  getRequiredFieldLabels,
  type IntakePayload,
} from '@/lib/founders/required-fields';

const completeCommon: IntakePayload = {
  member_name: 'Jane Doe',
  member_id: 'M1001',
  date_of_service: '2026-06-01',
  procedure_description: 'MRI lumbar spine',
  servicing_provider_npi: '1234567890',
  servicing_provider_address: '123 Main St',
};

describe('validateIntake', () => {
  it('outpatient requires the 3-month service window', () => {
    const result = validateIntake(completeCommon, 'outpatient');
    expect(result.valid).toBe(false);
    const keys = result.missing.map((m) => m.key);
    expect(keys).toContain('service_window_start');
    expect(keys).toContain('service_window_end');
  });

  it('outpatient passes when window is provided', () => {
    const result = validateIntake(
      { ...completeCommon, service_window_start: '2026-06-01', service_window_end: '2026-09-01' },
      'outpatient'
    );
    expect(result.valid).toBe(true);
  });

  it('medication requires drug name, dosage, frequency', () => {
    const result = validateIntake(completeCommon, 'medication');
    expect(result.valid).toBe(false);
    const keys = result.missing.map((m) => m.key);
    expect(keys).toEqual(expect.arrayContaining(['drug_name', 'drug_dosage', 'drug_frequency']));
  });

  it('home_health requires frequency and duration', () => {
    const result = validateIntake(completeCommon, 'home_health');
    expect(result.valid).toBe(false);
    const keys = result.missing.map((m) => m.key);
    expect(keys).toEqual(expect.arrayContaining(['visit_frequency', 'visit_duration']));
  });

  it('therapy uses the same fields as home_health', () => {
    const payload = { ...completeCommon, visit_frequency: '3x/wk', visit_duration: '6 weeks' };
    expect(validateIntake(payload, 'therapy').valid).toBe(true);
  });

  it('inpatient requires facility and admission date', () => {
    const result = validateIntake(completeCommon, 'inpatient');
    expect(result.valid).toBe(false);
    const keys = result.missing.map((m) => m.key);
    expect(keys).toEqual(expect.arrayContaining(['facility_name', 'admission_date']));
  });

  it('dme requires at least one item with code + description', () => {
    const empty = validateIntake(completeCommon, 'dme');
    expect(empty.valid).toBe(false);

    const partial = validateIntake(
      { ...completeCommon, dme_items: [{ description: 'Walker', code: '' }] },
      'dme'
    );
    expect(partial.valid).toBe(false);

    const ok = validateIntake(
      { ...completeCommon, dme_items: [{ description: 'Walker', code: 'E0143' }] },
      'dme'
    );
    expect(ok.valid).toBe(true);
  });

  it('returns missing common fields when nothing is provided', () => {
    const result = validateIntake({}, 'outpatient');
    expect(result.valid).toBe(false);
    const keys = result.missing.map((m) => m.key);
    expect(keys).toContain('member_name');
    expect(keys).toContain('member_id');
    expect(keys).toContain('date_of_service');
    expect(keys).toContain('procedure_description');
    expect(keys).toContain('servicing_provider_npi');
    expect(keys).toContain('servicing_provider_address');
  });

  it('rejects unparseable dates of service', () => {
    const result = validateIntake({ ...completeCommon, date_of_service: 'tomorrow' }, 'outpatient');
    expect(result.valid).toBe(false);
    expect(result.missing.some((m) => m.key === 'date_of_service')).toBe(true);
  });
});

describe('formatMissingForCaller', () => {
  it('handles single, dual, and list cases', () => {
    expect(formatMissingForCaller([])).toBe('');
    expect(formatMissingForCaller([{ key: 'a', label: 'member ID' }])).toBe('member ID');
    expect(formatMissingForCaller([
      { key: 'a', label: 'member ID' },
      { key: 'b', label: 'date of service' },
    ])).toBe('member ID and date of service');
    expect(formatMissingForCaller([
      { key: 'a', label: 'member ID' },
      { key: 'b', label: 'date of service' },
      { key: 'c', label: 'NPI' },
    ])).toBe('member ID, date of service, and NPI');
  });
});

describe('getRequiredFieldLabels', () => {
  it('returns common + service-type-specific labels', () => {
    const labels = getRequiredFieldLabels('inpatient');
    expect(labels).toContain('member ID');
    expect(labels).toContain('facility name');
    expect(labels).toContain('admission date');
  });
});
