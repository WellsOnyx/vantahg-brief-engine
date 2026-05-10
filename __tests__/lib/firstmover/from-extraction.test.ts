import { describe, it, expect } from 'vitest';
import { mapExtractionToPayload, classifyServiceType } from '@/lib/firstmover/from-extraction';
import type { ParsedFaxData } from '@/lib/intake/efax-parser';

const baseParsed: Partial<ParsedFaxData> = {
  patient_name: 'Jane Doe',
  patient_member_id: 'M1001',
  patient_dob: '1980-01-01',
  procedure_description: 'MRI lumbar spine without contrast',
  procedure_codes: ['72148'],
  diagnosis_codes: ['M54.5'],
  requesting_provider: 'Dr. Patel',
  requesting_provider_npi: '1234567890',
  facility_type: 'outpatient',
  service_category: 'imaging',
  raw_text: 'Member ID: M1001 ... MRI lumbar spine ...',
};

describe('classifyServiceType', () => {
  it('inpatient facility → inpatient', () => {
    const r = classifyServiceType({ ...baseParsed, facility_type: 'inpatient' });
    expect(r.type).toBe('inpatient');
    expect(r.confidence).toBeGreaterThan(0.9);
  });

  it('HCPCS E-code → dme', () => {
    const r = classifyServiceType({ ...baseParsed, procedure_codes: ['E0143'] });
    expect(r.type).toBe('dme');
  });

  it('service_category dme → dme', () => {
    const r = classifyServiceType({ ...baseParsed, service_category: 'dme', procedure_codes: ['72148'] });
    expect(r.type).toBe('dme');
  });

  it('HCPCS J-code → medication', () => {
    const r = classifyServiceType({ ...baseParsed, procedure_codes: ['J9035'] });
    expect(r.type).toBe('medication');
  });

  it('infusion category → medication', () => {
    const r = classifyServiceType({ ...baseParsed, service_category: 'infusion', procedure_codes: [] });
    expect(r.type).toBe('medication');
  });

  it('home_health category → home_health', () => {
    const r = classifyServiceType({ ...baseParsed, service_category: 'home_health' });
    expect(r.type).toBe('home_health');
  });

  it('rehab_therapy → therapy', () => {
    const r = classifyServiceType({ ...baseParsed, service_category: 'rehab_therapy' });
    expect(r.type).toBe('therapy');
  });

  it('PT/OT/ST mention falls through to therapy', () => {
    const r = classifyServiceType({
      patient_name: '',
      procedure_description: 'Outpatient physical therapy 3x/week',
      procedure_codes: [],
      diagnosis_codes: [],
    });
    expect(r.type).toBe('therapy');
  });

  it('admit text mention → inpatient (lower confidence)', () => {
    const r = classifyServiceType({
      patient_name: '',
      procedure_description: 'Patient admitted for hospital stay',
      procedure_codes: [],
      diagnosis_codes: [],
    });
    expect(r.type).toBe('inpatient');
    expect(r.confidence).toBeLessThan(0.9);
  });

  it('default → outpatient', () => {
    const r = classifyServiceType(baseParsed);
    expect(r.type).toBe('outpatient');
  });
});

describe('mapExtractionToPayload', () => {
  it('maps the common patient + procedure fields', () => {
    const r = mapExtractionToPayload(baseParsed);
    expect(r.payload.member_name).toBe('Jane Doe');
    expect(r.payload.member_id).toBe('M1001');
    expect(r.payload.member_dob).toBe('1980-01-01');
    expect(r.payload.procedure_description).toMatch(/MRI lumbar spine/);
    expect(r.payload.procedure_codes).toEqual(['72148']);
    expect(r.supplied_fields).toEqual(
      expect.arrayContaining([
        'member_name',
        'member_id',
        'member_dob',
        'procedure_description',
        'procedure_codes',
        'servicing_provider',
        'servicing_provider_npi',
      ])
    );
  });

  it('surfaces requesting provider as servicing provider for the nurse to confirm', () => {
    const r = mapExtractionToPayload(baseParsed);
    expect(r.payload.servicing_provider).toBe('Dr. Patel');
    expect(r.payload.servicing_provider_npi).toBe('1234567890');
  });

  it('returns service_type_guess from the classifier', () => {
    const r = mapExtractionToPayload(baseParsed);
    expect(r.service_type_guess).toBe('outpatient');
    expect(r.service_type_confidence).toBeGreaterThan(0.5);
  });

  it('builds dme_items when classified as DME', () => {
    const r = mapExtractionToPayload({
      ...baseParsed,
      service_category: 'dme',
      procedure_codes: ['E0143', 'E0260'],
      procedure_description: 'Walker + hospital bed',
    });
    expect(r.service_type_guess).toBe('dme');
    expect(r.payload.dme_items).toHaveLength(2);
    expect(r.payload.dme_items?.[0].code).toBe('E0143');
  });

  it('handles empty input gracefully', () => {
    const r = mapExtractionToPayload({});
    expect(r.payload).toEqual({});
    expect(r.service_type_guess).toBe('outpatient');
    expect(r.supplied_fields).toEqual([]);
  });

  it('does not invent fields the extractor did not provide', () => {
    const r = mapExtractionToPayload({ patient_member_id: 'M1001' });
    expect(r.payload.member_id).toBe('M1001');
    expect(r.payload.member_name).toBeUndefined();
    expect(r.payload.date_of_service).toBeUndefined();
    expect(r.supplied_fields).toEqual(['member_id']);
  });

  it('captures facility_name when present', () => {
    const r = mapExtractionToPayload({ ...baseParsed, facility_name: 'Tampa General Hospital' });
    expect(r.payload.facility_name).toBe('Tampa General Hospital');
    expect(r.supplied_fields).toContain('facility_name');
  });
});
