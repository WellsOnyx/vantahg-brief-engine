import { describe, it, expect } from 'vitest';
import { findKnownGuideline, isRecognizedRegulatoryFormat } from '@/lib/known-guidelines';

describe('findKnownGuideline', () => {
  it('matches InterQual by name', () => {
    const result = findKnownGuideline('InterQual Criteria');
    expect(result).not.toBeNull();
    expect(result?.name).toBe('InterQual');
  });

  it('matches MCG by alias', () => {
    const result = findKnownGuideline('mcg guidelines');
    expect(result).not.toBeNull();
    expect(result?.organization).toBe('Milliman');
  });

  it('matches ACR by partial name', () => {
    const result = findKnownGuideline('ACR Appropriateness Criteria - Low Back Pain');
    expect(result).not.toBeNull();
  });

  it('matches NCCN', () => {
    const result = findKnownGuideline('nccn compendium');
    expect(result).not.toBeNull();
    expect(result?.organization).toContain('Cancer Network');
  });

  it('returns null for fabricated guidelines', () => {
    const result = findKnownGuideline('Totally Made Up Guidelines Board');
    expect(result).toBeNull();
  });

  it('is case insensitive', () => {
    const result = findKnownGuideline('INTERQUAL');
    expect(result).not.toBeNull();
  });
});

describe('isRecognizedRegulatoryFormat', () => {
  it('recognizes CMS LCD format', () => {
    expect(isRecognizedRegulatoryFormat('CMS LCD L33718')).toBe(true);
  });

  it('recognizes CFR references', () => {
    expect(isRecognizedRegulatoryFormat('42 CFR 482.43')).toBe(true);
  });

  it('recognizes state regulation patterns', () => {
    expect(isRecognizedRegulatoryFormat('state regulation requirement')).toBe(true);
  });

  it('recognizes known org abbreviations', () => {
    expect(isRecognizedRegulatoryFormat('NCCN Clinical Practice Guidelines')).toBe(true);
  });

  it('rejects random text', () => {
    expect(isRecognizedRegulatoryFormat('Random text with no regulatory meaning')).toBe(false);
  });
});
