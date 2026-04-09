// Tests for the eFax AI clinical data extractor (demo-mode path only).
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { extractClinicalDataFromFax } from '@/lib/intake/efax/ai-extractor';

const REQUIRED_PARSED_KEYS = [
  'patient_name',
  'patient_dob',
  'patient_member_id',
  'patient_gender',
  'requesting_provider',
  'requesting_provider_npi',
  'requesting_provider_specialty',
  'requesting_provider_fax',
  'requesting_provider_phone',
  'procedure_codes',
  'diagnosis_codes',
  'procedure_description',
  'service_category',
  'review_type',
  'priority',
  'facility_name',
  'facility_type',
  'payer_name',
  'plan_type',
  'raw_text',
  'confidence',
  'needs_manual_review',
  'manual_review_reasons',
];

describe('extractClinicalDataFromFax (demo mode)', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.stubEnv('ANTHROPIC_API_KEY', '');
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('should return demo method with Sarah Johnson / 27447 / M17.11', async () => {
    const result = await extractClinicalDataFromFax({
      ocr_text: 'some ocr text',
      ocr_confidence: 95,
    });
    expect(result.method).toBe('demo');
    expect(result.parsed.patient_name).toContain('Sarah Johnson');
    expect(result.parsed.procedure_codes).toContain('27447');
    expect(result.parsed.diagnosis_codes).toContain('M17.11');
    expect(result.parsed.confidence).toBeGreaterThanOrEqual(1);
    expect(result.parsed.confidence).toBeLessThanOrEqual(100);
    expect(result.parsed.needs_manual_review).toBe(false);
  });

  it('should blend confidence to not exceed ocr_confidence', async () => {
    const result = await extractClinicalDataFromFax({
      ocr_text: 'text',
      ocr_confidence: 50,
    });
    expect(result.parsed.confidence).toBeLessThanOrEqual(50);
  });

  it('should flag manual review when ocr_confidence is below 70', async () => {
    const result = await extractClinicalDataFromFax({
      ocr_text: 'text',
      ocr_confidence: 60,
    });
    expect(result.parsed.needs_manual_review).toBe(true);
    expect(
      result.parsed.manual_review_reasons.some((r) =>
        r.toLowerCase().includes('ocr'),
      ),
    ).toBe(true);
  });

  it('should still return a result for empty ocr_text', async () => {
    const result = await extractClinicalDataFromFax({
      ocr_text: '',
      ocr_confidence: 0,
    });
    expect(result.method).toBe('demo');
    expect(result.parsed.raw_text).toBe('');
    expect(Array.isArray(result.parsed.manual_review_reasons)).toBe(true);
  });

  it('should passthrough raw_text from OCR input', async () => {
    const ocr = 'arbitrary ocr body content 123';
    const result = await extractClinicalDataFromFax({
      ocr_text: ocr,
      ocr_confidence: 95,
    });
    expect(result.parsed.raw_text).toBe(ocr);
  });

  it('should fill requesting_provider_fax from from_number when demo does not override', async () => {
    const result = await extractClinicalDataFromFax({
      ocr_text: 'text',
      ocr_confidence: 95,
      from_number: '+15551234567',
    });
    expect(result.parsed.requesting_provider_fax).toBe('+15551234567');
  });

  it('should return a parsed object with every required ParsedFaxData field', async () => {
    const result = await extractClinicalDataFromFax({
      ocr_text: 'text',
      ocr_confidence: 95,
    });
    for (const key of REQUIRED_PARSED_KEYS) {
      expect(result.parsed).toHaveProperty(key);
    }
  });
});
