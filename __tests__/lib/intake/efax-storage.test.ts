// Tests for eFax storage helpers and submission fingerprinting.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  computeSubmissionFingerprint,
  fetchAndStoreDocument,
  getStoredDocumentBytes,
  findDuplicateCase,
} from '@/lib/intake/efax/storage';

describe('computeSubmissionFingerprint', () => {
  const baseInput = {
    patient_name: 'Sarah Johnson',
    patient_dob: '1978-04-12',
    patient_member_id: 'BCBS-44219008',
    procedure_codes: ['27447'],
    from_number: '+14155551234',
  };

  it('should return a 64-char hex SHA-256 string for valid input', () => {
    const fp = computeSubmissionFingerprint(baseInput);
    expect(fp).toMatch(/^[a-f0-9]{64}$/);
  });

  it('should normalize whitespace in patient name', () => {
    const a = computeSubmissionFingerprint({
      ...baseInput,
      patient_name: '  Sarah Johnson  ',
    });
    const b = computeSubmissionFingerprint({
      ...baseInput,
      patient_name: 'sarahjohnson',
    });
    expect(a).toBe(b);
  });

  it('should normalize phone formatting', () => {
    const a = computeSubmissionFingerprint({
      ...baseInput,
      from_number: '+1 (415) 555-1234',
    });
    const b = computeSubmissionFingerprint({
      ...baseInput,
      from_number: '4155551234',
    });
    expect(a).toBe(b);
  });

  it('should ignore procedure code order', () => {
    const a = computeSubmissionFingerprint({
      ...baseInput,
      procedure_codes: ['27447', '99213'],
    });
    const b = computeSubmissionFingerprint({
      ...baseInput,
      procedure_codes: ['99213', '27447'],
    });
    expect(a).toBe(b);
  });

  it('should collapse duplicate procedure codes', () => {
    const a = computeSubmissionFingerprint({
      ...baseInput,
      procedure_codes: ['27447', '27447'],
    });
    const b = computeSubmissionFingerprint({
      ...baseInput,
      procedure_codes: ['27447'],
    });
    expect(a).toBe(b);
  });

  it('should return null without name or member_id', () => {
    expect(
      computeSubmissionFingerprint({
        patient_name: null,
        patient_dob: '1978-04-12',
        patient_member_id: null,
        procedure_codes: ['27447'],
      }),
    ).toBeNull();
  });

  it('should return null without procedure codes', () => {
    expect(
      computeSubmissionFingerprint({
        ...baseInput,
        procedure_codes: [],
      }),
    ).toBeNull();
  });

  it('should succeed with only member_id and procedure codes', () => {
    const fp = computeSubmissionFingerprint({
      patient_name: null,
      patient_dob: null,
      patient_member_id: 'ABC123',
      procedure_codes: ['27447'],
    });
    expect(fp).toMatch(/^[a-f0-9]{64}$/);
  });

  it('should produce different fingerprints for different inputs', () => {
    const a = computeSubmissionFingerprint(baseInput);
    const b = computeSubmissionFingerprint({
      ...baseInput,
      patient_name: 'Different Person',
    });
    expect(a).not.toBe(b);
  });
});

describe('fetchAndStoreDocument (demo mode)', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.stubGlobal('fetch', vi.fn());
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('should short-circuit in demo mode without network calls', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const result = await fetchAndStoreDocument('fax123', 'https://example.com/doc.pdf');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.storage_bytes).toBeGreaterThanOrEqual(0);
    expect(typeof result.storage_path).toBe('string');
    expect(result.content_type).toBe('application/pdf');
  });

  it.todo('integration: non-demo path uploads bytes to the efax-documents bucket');
});

describe('getStoredDocumentBytes (demo mode)', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  it('should return an empty Buffer in demo mode', async () => {
    const bytes = await getStoredDocumentBytes('efax/demo/foo.pdf');
    expect(Buffer.isBuffer(bytes)).toBe(true);
    expect(bytes.byteLength).toBe(0);
  });

  it.todo('integration: non-demo path downloads bytes from Supabase storage');
});

describe('findDuplicateCase (demo mode)', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  it('should return null regardless of fingerprint in demo mode', async () => {
    const result = await findDuplicateCase('a'.repeat(64));
    expect(result).toBeNull();
  });

  it.todo('integration: non-demo path queries the cases table');
});
