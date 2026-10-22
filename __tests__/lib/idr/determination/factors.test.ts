import { describe, expect, it } from 'vitest';
import { buildFactorEvidence, loadIdrCatalog, renderPartyParagraph } from '@/lib/idr/determination';
import { CV_EXCERPT, singleRequest } from './fixture';

describe('statutory factor evidence', () => {
  const checklist = loadIdrCatalog().checklist;

  it('records what each party submitted and quotes training text only from the CV file', () => {
    const factors = buildFactorEvidence(singleRequest(), checklist);
    expect(factors.map((factor) => factor.number)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    const training = factors.find((factor) => factor.factor_id === 'training_experience');
    expect(training?.ip.board_certification).toBe('board certification');
    expect(training?.ip.specialty).toBe('demonstration specialty');
    expect(training?.ip.excerpt_in_file).toBe(true);
    expect(training?.ip.document_ids).toEqual(['DOC-SYN-CV']);
    expect(training?.ip_narrative).toContain('board_certification:board certification');
    expect(training?.ip_narrative).toContain('specialty:demonstration specialty');
    expect(training?.nip.submitted).toBe(false);
    expect(training?.nip.board_certification).toBeNull();
    expect(training?.nip.specialty).toBeNull();
    expect(training?.nip_narrative).toContain('training:absent non-initiating party');
    expect(training?.narrative).toContain(CV_EXCERPT.split(' ').slice(1, 3).join(' '));

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
    expect(acuity?.ip_narrative).toBe(checklist.phrases.acuity_both);
    expect(acuity?.nip_narrative).toBe('acuity:absent party:non-initiating party');
    expect(acuity?.nip_narrative).not.toContain('acuity_attachments');
    expect(acuity?.nip.submitted).toBe(false);
    expect(acuity?.nip.document_ids).toEqual([]);
    expect(acuity?.narrative).not.toMatch(/\b\d{5}\b/);
    expect(acuity?.narrative).not.toContain('CPT');
    expect(acuity?.narrative).not.toContain('warrants');
    expect(acuity?.ip.document_ids).toEqual(['DOC-SYN-RECORDS', 'DOC-SYN-OP']);

    const factor7 = factors.find((factor) => factor.factor_id === 'additional_information');
    expect(factor7?.number).toBe(7);
    expect(factor7?.credited_to).toBeNull();
    expect(factor7?.chart_support).toBe('absent');
    expect(factor7?.ip.submitted).toBe(true);
    expect(factor7?.ip_narrative).toContain('credit:none');
    expect(factor7?.nip_narrative).toContain('credit:none');
    expect(factor7?.narrative).not.toContain('supports the initiating party');
    expect(factor7?.narrative).not.toContain('credited to the initiating party');
    expect(factor7?.ip_narrative).not.toContain('credit:NIP');

    const ipParagraph = renderPartyParagraph(factors, 'IP');
    const nipParagraph = renderPartyParagraph(factors, 'NIP');
    expect(ipParagraph).not.toBe(nipParagraph);
    expect(ipParagraph).not.toContain('CPT');
    expect(nipParagraph).not.toContain('99285');
    expect(ipParagraph).not.toContain('clearly');
    expect(ipParagraph).not.toContain('\n');
    expect(nipParagraph).not.toContain('\n');
  });

  it('credits factor 7 to the non-initiating party only when a chart is on the request', () => {
    const supported = singleRequest({
      chart_supports_factor_7_nip: true,
      documents: [
        ...singleRequest().documents,
        {
          doc_id: 'DOC-SYN-CHART',
          role: 'chart',
          party: 'NIP',
          label: 'Chart',
          text: 'Synthetic chart support note that must stay out of the draft.',
        },
      ],
    });
    const credited = buildFactorEvidence(supported, checklist).find((factor) => factor.factor_id === 'additional_information');
    expect(credited?.chart_support).toBe('credited');
    expect(credited?.credited_to).toBe('NIP');
    expect(credited?.nip_narrative).toContain('credit:NIP');
    expect(credited?.ip_narrative).toContain('credit:none');
    expect(credited?.narrative).not.toContain('must stay out');

    const missingChart = buildFactorEvidence(
      singleRequest({ chart_supports_factor_7_nip: true }),
      checklist,
    ).find((factor) => factor.factor_id === 'additional_information');
    expect(missingChart?.chart_support).toBe('unverified');
    expect(missingChart?.credited_to).toBeNull();
  });

  it('does not invent training text when the supplied excerpt is not in the CV file', () => {
    const request = singleRequest();
    request.documents = request.documents.map((doc) =>
      doc.role === 'cv'
        ? { ...doc, board_certification: 'Invented fellowship at a synthetic academy.', specialty: 'demonstration specialty' }
        : doc,
    );
    const training = buildFactorEvidence(request, checklist).find((factor) => factor.factor_id === 'training_experience');
    expect(training?.ip.excerpt_in_file).toBe(false);
    expect(training?.ip.board_certification).toBe('Invented fellowship at a synthetic academy.');
    expect(training?.ip_narrative).toContain('Invented fellowship at a synthetic academy.');
    expect(training?.ip_narrative).not.toContain('board_certification:board certification');
  });
});
