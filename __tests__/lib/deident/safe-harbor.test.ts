import { describe, it, expect } from 'vitest';
import {
  collectIdentifiers,
  deidentifyText,
  deidentifyDeep,
  ageFromDob,
  safeHarborAge,
  yearOf,
  DEIDENT_METHOD,
} from '@/lib/deident/safe-harbor';

/**
 * Compliance-critical suite. These assertions are the line between a
 * de-identified training set and a PHI leak, so they carry the most weight in
 * the whole test suite. Two properties matter:
 *   1. Every Safe Harbor identifier category is removed from free text.
 *   2. The clinical signal we WANT (CPT/ICD codes, ages <= 89, sex, year) is
 *      preserved — over-redaction that nukes codes would gut the dataset.
 */

const CASE = {
  id: 'case-xyz',
  patient_name: 'Maria Gonzalez',
  patient_dob: '1980-04-12',
  patient_member_id: 'MBR-99887766',
  patient_gender: 'female',
  patient_phone: '+1 (203) 555-1234',
  patient_address: '742 Evergreen Terrace',
  requesting_provider: 'Dr. Alan Grant',
  requesting_provider_npi: '1982736450',
  facility_name: 'Mercy General Hospital',
  case_number: 'UM-2024-0001',
  authorization_number: 'AUTH-5551212',
};

describe('collectIdentifiers', () => {
  it('categorizes the PHI fields off a case row', () => {
    const ids = collectIdentifiers(CASE);
    expect(ids.patientNames).toContain('Maria Gonzalez');
    expect(ids.providerNames).toContain('Dr. Alan Grant');
    expect(ids.providerNames).toContain('Mercy General Hospital');
    expect(ids.memberIds).toContain('MBR-99887766');
    expect(ids.memberIds).toContain('AUTH-5551212');
    expect(ids.numericIds).toContain('1982736450');
    expect(ids.phones).toContain('+1 (203) 555-1234');
    expect(ids.addresses).toContain('742 Evergreen Terrace');
  });

  it('ignores empty / non-string fields', () => {
    const ids = collectIdentifiers({ patient_name: '', requesting_provider: null });
    expect(ids.patientNames).toHaveLength(0);
    expect(ids.providerNames).toHaveLength(0);
  });
});

describe('deidentifyText — targeted literal redaction', () => {
  const ids = collectIdentifiers(CASE);

  it('redacts the patient name and its parts', () => {
    const out = deidentifyText('Maria was seen; Gonzalez reports improvement.', ids)!;
    expect(out).not.toMatch(/Maria/i);
    expect(out).not.toMatch(/Gonzalez/i);
    expect(out).toContain('[PATIENT]');
  });

  it('redacts provider and facility names', () => {
    const out = deidentifyText('Referred by Dr. Alan Grant at Mercy General Hospital.', ids)!;
    expect(out).not.toMatch(/Grant/);
    expect(out).not.toMatch(/Mercy/);
    expect(out).toContain('[PROVIDER]');
  });

  it('redacts member id verbatim and digits-only', () => {
    const out = deidentifyText('Member MBR-99887766 (id 99887766) approved.', ids)!;
    expect(out).not.toMatch(/99887766/);
    expect(out).toContain('[MEMBER_ID]');
  });

  it('redacts the NPI', () => {
    const out = deidentifyText('NPI 1982736450 on file.', ids)!;
    expect(out).not.toMatch(/1982736450/);
  });
});

describe('deidentifyText — regex safety net', () => {
  const ids = collectIdentifiers({ id: 'x' }); // no literals — force the net to work alone

  it('scrubs emails', () => {
    expect(deidentifyText('contact jane.doe@hospital.org please', ids)).toContain('[EMAIL]');
  });

  it('scrubs URLs', () => {
    expect(deidentifyText('see https://portal.example.com/x', ids)).toContain('[URL]');
  });

  it('scrubs SSNs', () => {
    expect(deidentifyText('SSN 123-45-6789 noted', ids)).toContain('[SSN]');
  });

  it('scrubs phone numbers in common formats', () => {
    expect(deidentifyText('call 203-555-1234', ids)).toContain('[PHONE]');
    expect(deidentifyText('call (203) 555-1234', ids)).toContain('[PHONE]');
  });

  it('scrubs dates but keeps a bare year', () => {
    expect(deidentifyText('DOS 01/02/2024', ids)).toContain('[DATE]');
    expect(deidentifyText('admitted 2024-01-02', ids)).toContain('[DATE]');
    expect(deidentifyText('seen January 5, 2024', ids)).toContain('[DATE]');
    // A bare year is permitted under Safe Harbor and must survive.
    expect(deidentifyText('program started in 2024', ids)).toContain('2024');
  });

  it('scrubs IP addresses', () => {
    expect(deidentifyText('from 192.168.1.100', ids)).toContain('[IP]');
  });

  it('aggregates ages over 89 but keeps ages <= 89', () => {
    expect(deidentifyText('a 92-year-old male', ids)).toContain('90+');
    expect(deidentifyText('a 92-year-old male', ids)).not.toMatch(/92/);
    expect(deidentifyText('age 91', ids)).toContain('90+');
    // Ages 0-89 are permitted demographics — must NOT be redacted.
    expect(deidentifyText('a 45-year-old male', ids)).toContain('45');
  });

  it('scrubs long numeric ids (>=7 digits) but PRESERVES 5-digit CPT codes', () => {
    const out = deidentifyText('MRN 7654321 for procedure 27447', ids)!;
    expect(out).not.toMatch(/7654321/); // MRN gone
    expect(out).toContain('27447'); // CPT code kept — this is the signal
  });

  it('preserves ICD-10 style codes', () => {
    const out = deidentifyText('Diagnosis M17.11 confirmed', ids)!;
    expect(out).toContain('M17.11');
  });

  it('returns null/empty unchanged', () => {
    expect(deidentifyText(null, ids)).toBeNull();
    expect(deidentifyText(undefined, ids)).toBeNull();
    expect(deidentifyText('', ids)).toBe('');
  });
});

describe('deidentifyDeep', () => {
  it('walks nested objects and arrays, scrubbing strings only', () => {
    const ids = collectIdentifiers(CASE);
    const input = {
      summary: 'Maria Gonzalez, DOB 1980-04-12',
      codes: ['27447', '99213'],
      nested: { note: 'call 203-555-1234', score: 82, flag: true },
    };
    const out = deidentifyDeep(input, ids) as any;
    expect(out.summary).not.toMatch(/Gonzalez/);
    expect(out.summary).toContain('[DATE]');
    expect(out.codes).toEqual(['27447', '99213']); // codes untouched
    expect(out.nested.note).toContain('[PHONE]');
    expect(out.nested.score).toBe(82); // numbers pass through
    expect(out.nested.flag).toBe(true);
  });
});

describe('age + date generalization', () => {
  it('computes age from DOB as of a fixed reference date', () => {
    expect(ageFromDob('1980-04-12', new Date('2024-05-01'))).toBe(44);
    expect(ageFromDob('1980-04-12', new Date('2024-04-01'))).toBe(43); // birthday not yet reached
  });

  it('returns null for unparseable / absent DOB', () => {
    expect(ageFromDob(null)).toBeNull();
    expect(ageFromDob('not-a-date')).toBeNull();
  });

  it('caps Safe Harbor age at 90+', () => {
    expect(safeHarborAge('1980-04-12', new Date('2024-05-01'))).toBe(44);
    expect(safeHarborAge('1930-01-01', new Date('2024-05-01'))).toBe('90+');
  });

  it('extracts only the year from a timestamp', () => {
    expect(yearOf('2024-06-15T10:30:00Z')).toBe(2024);
    expect(yearOf(null)).toBeNull();
  });
});

describe('provenance', () => {
  it('exposes the de-identification method tag', () => {
    expect(DEIDENT_METHOD).toBe('safe_harbor_v1');
  });
});
