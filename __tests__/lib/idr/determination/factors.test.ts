import { describe, expect, it } from 'vitest';
import { buildFactorEvidence, loadIdrCatalog, renderFactorBlock } from '@/lib/idr/determination';
import { CV_EXCERPT, singleRequest } from './fixture';

describe('statutory factor evidence', () => {
  const checklist = loadIdrCatalog().checklist;

  it('records what each party submitted and quotes training text only from the CV file', () => {
    const factors = buildFactorEvidence(singleRequest(), checklist);
    expect(factors.map((factor) => factor.number)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    const training = factors.find((factor) => factor.factor_id === 'training_experience');
    expect(training?.ip.excerpt).toBe(CV_EXCERPT);
    expect(training?.ip.excerpt_in_file).toBe(true);
    expect(training?.ip.document_ids).toEqual(['DOC-SYN-CV']);
    expect(training?.nip.submitted).toBe(false);
    expect(training?.nip.excerpt).toBeNull();
    expect(training?.narrative).toContain(CV_EXCERPT);
    expect(training?.narrative).toContain('submitted no curriculum vitae');

    const market = factors.find((factor) => factor.factor_id === 'market_share');
    expect(market?.ip.submitted).toBe(true);
    expect(market?.nip.submitted).toBe(false);
    expect(market?.narrative).not.toContain('dominant');
    expect(market?.narrative).not.toContain('excessive');

    const teaching = factors.find((factor) => factor.factor_id === 'teaching_case_mix');
    expect(teaching?.ip.submitted).toBe(false);
    expect(teaching?.nip.submitted).toBe(false);
  });

  it('limits acuity to the attachment note and does not credit factor 7 to the initiating party', () => {
    const request = singleRequest();
    const factors = buildFactorEvidence(request, checklist);
    const acuity = factors.find((factor) => factor.factor_id === 'acuity_complexity');
    expect(acuity?.narrative).toBe(checklist.phrases.acuity_both);
    expect(acuity?.narrative).not.toMatch(/\b\d{5}\b/);
    expect(acuity?.narrative).not.toContain('CPT');
    expect(acuity?.narrative).not.toContain('warrants');
    expect(acuity?.ip.document_ids).toEqual(['DOC-SYN-RECORDS', 'DOC-SYN-OP']);

    const factor7 = factors.find((factor) => factor.factor_id === 'additional_information');
    expect(factor7?.number).toBe(7);
    expect(factor7?.credited_to).toBeNull();
    expect(factor7?.ip.submitted).toBe(true);
    expect(factor7?.narrative).not.toContain('supports the initiating party');
    expect(factor7?.narrative).not.toContain('credited to the initiating party');
    expect(factor7?.narrative.toLowerCase()).toContain('not used as support for the initiating party offer');

    const block = renderFactorBlock(factors);
    expect(block).not.toContain('CPT');
    expect(block).not.toContain('99285');
    expect(block).not.toContain('clearly');
    expect(block).not.toContain('\n\n');
  });

  it('does not invent training text when the supplied excerpt is not in the CV file', () => {
    const request = singleRequest();
    request.documents = request.documents.map((doc) =>
      doc.role === 'cv' ? { ...doc, excerpt: 'Invented fellowship at a synthetic academy.' } : doc,
    );
    const training = buildFactorEvidence(request, checklist).find((factor) => factor.factor_id === 'training_experience');
    expect(training?.ip.excerpt_in_file).toBe(false);
    expect(training?.ip.excerpt).toBe('Invented fellowship at a synthetic academy.');
    expect(training?.narrative).not.toContain('board certification');
  });
});
