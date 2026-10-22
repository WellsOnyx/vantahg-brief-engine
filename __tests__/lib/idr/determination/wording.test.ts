import { describe, expect, it } from 'vitest';
import { loadIdrCatalogFromFiles, prepareDetermination, readIdrContentFiles, LIVE_TEXT_MARKER } from '@/lib/idr/determination';
import { approvedDeps, batchRequest, deps, figure, idrActor, singleRequest } from './fixture';

function nip(request = singleRequest()) {
  return { ...request, prevailing_party: 'NIP' as const };
}

describe('IDR wording QA', () => {
  it('keeps chart, IP, NIP, and winner as separate paragraphs', () => {
    const result = prepareDetermination(idrActor(), singleRequest(), approvedDeps());
    expect(result.ok).toBe(true);
    const parts = result.clean_text?.split(/\n\s*\n/) ?? [];
    expect(parts).toHaveLength(4);
    expect(parts[0]).toContain('line:');
    expect(parts[1]).toContain('factor:');
    expect(parts[2]).toContain('factor:');
    expect(parts[1]).not.toContain('prevailing_party:');
    expect(parts[3]).toContain('prevailing_party:IP');
    expect(parts[1]).not.toBe(parts[2]);
  });

  it('ships neutral public-source drafts that are not approved for production', () => {
    const files = readIdrContentFiles();
    const templates = Object.entries(files).filter(([path]) => path.startsWith('config/idr/templates/'));
    expect(templates).toHaveLength(12);
    for (const [path, source] of templates) {
      expect(source, path).toContain('status: draft_pending_human_approval');
      expect(source, path).toContain('approved_for_production: false');
      expect(source, path).not.toContain(LIVE_TEXT_MARKER);
      expect(source, path).not.toContain('offer is selected');
    }
  });

  it.each([
    ['ineligible', 'nip-ineligible'],
    ['zero_offer', 'nip-zero-offer'],
    ['no_qpa', 'nip-no-qpa'],
    ['batch_qpa_discrepancy', 'nip-batch-qpa-discrepancy'],
    ['qpa_higher_than_brief', 'nip-qpa-higher-than-brief'],
    ['qpa_lower_than_brief', 'nip-qpa-lower-than-brief'],
    ['no_substantive_factors', 'nip-no-substantive-factors'],
    ['nip_offer_higher', 'nip-nip-offer-higher'],
  ] as const)('selects the %s NIP branch', (branch, templateId) => {
    const result = prepareDetermination(idrActor(), requestFor(branch), approvedDeps());
    expect(result.stamps?.template_id).toBe(templateId);
    expect(result.code).not.toBe('nip_branch_unmatched');
    if (branch === 'no_qpa') {
      expect(result.ok).toBe(false);
      expect(result.code).toBe('qa_failed');
      expect(result.clean_text).toBeNull();
      const qpa = result.figures?.find((item) => item.kind === 'qpa' && item.line_id === 'LI-SYN-A');
      expect(qpa).toMatchObject({ status: 'MISSING', amount_cents: null, source: null });
      expect(qpa?.amount_cents).not.toBe(150000);
    } else {
      expect(result.ok).toBe(true);
      expect(result.clean_text).not.toContain(LIVE_TEXT_MARKER);
    }
  });

  it('applies NIP branch precedence without guessing', () => {
    const ineligibleAndZero = prepareDetermination(
      idrActor(),
      nip(singleRequest({ eligibility: 'ineligible', line_items: [zeroLine()] })),
      deps(),
    );
    expect(ineligibleAndZero.stamps?.template_id).toBe('nip-ineligible');

    const zeroAndMissingQpa = prepareDetermination(
      idrActor(),
      nip(singleRequest({ line_items: [{ ...zeroLine(), qpa: { amount: null, doc_id: null, page: null } }] })),
      deps(),
    );
    expect(zeroAndMissingQpa.stamps?.template_id).toBe('nip-zero-offer');

    const batchMissingQpa = prepareDetermination(
      idrActor(),
      nip({
        ...batchRequest(),
        line_items: batchRequest().line_items.map((item) => ({ ...item, qpa: { amount: null, doc_id: null, page: null } })),
      }),
      deps(),
    );
    expect(batchMissingQpa.stamps?.template_id).toBe('nip-no-qpa');

    const discrepancyBeatsHigherOffer = prepareDetermination(
      idrActor(),
      {
        ...batchRequest(),
        line_items: batchRequest().line_items.map((item, index) =>
          index === 0 ? { ...item, nip_offer: figure('4000.00', 'DOC-SYN-NIP-OFFER', 3) } : item,
        ),
      },
      deps(),
    );
    expect(discrepancyBeatsHigherOffer.stamps?.template_id).toBe('nip-batch-qpa-discrepancy');

    const higherBeatsNoFactors = prepareDetermination(
      idrActor(),
      nip(
        singleRequest({
          factor_materials: singleRequest().factor_materials.filter((item) => item.party !== 'NIP'),
          brief_qpa: figure('800.00', 'DOC-SYN-BRIEF', 1),
        }),
      ),
      deps(),
    );
    expect(higherBeatsNoFactors.stamps?.template_id).toBe('nip-qpa-higher-than-brief');

    const noFactorsBeatsHigherOffer = prepareDetermination(
      idrActor(),
      nip(
        singleRequest({
          factor_materials: singleRequest().factor_materials.filter((item) => item.party !== 'NIP'),
          line_items: [{ ...singleRequest().line_items[0], nip_offer: figure('4000.00', 'DOC-SYN-NIP-OFFER', 3) }],
        }),
      ),
      deps(),
    );
    expect(noFactorsBeatsHigherOffer.stamps?.template_id).toBe('nip-no-substantive-factors');

    const unmatched = prepareDetermination(idrActor(), nip(), deps());
    expect(unmatched.code).toBe('nip_branch_unmatched');
    expect(unmatched.clean_text).toBeNull();
    expect(unmatched.stamps).toBeNull();
  });

  it('hard-stops identical offers before a winner paragraph is issued', () => {
    const request = singleRequest({
      line_items: [{ ...singleRequest().line_items[0], nip_offer: figure('1500.00', 'DOC-SYN-NIP-OFFER', 3) }],
    });
    const result = prepareDetermination(idrActor(), request, deps());
    expect(result.ok).toBe(false);
    expect(result.code).toBe('identical_offers');
    expect(result.clean_text).toBeNull();
    expect(result.board).toBeNull();
    expect(result.message).toMatch(/identical/i);
  });

  it('credits factor 7 to the NIP when the chart supports it and refuses IP credit language', () => {
    const request = singleRequest({
      chart_supports_factor_7_nip: true,
      documents: [
        ...singleRequest().documents,
        {
          doc_id: 'DOC-SYN-CHART',
          role: 'chart' as const,
          party: 'NIP' as const,
          label: 'Chart',
          text: 'Synthetic chart support note that must stay out of the draft.',
        },
      ],
    });
    const result = prepareDetermination(idrActor(), request, approvedDeps());
    expect(result.ok).toBe(true);
    const parts = result.clean_text?.split(/\n\s*\n/) ?? [];
    expect(parts[2]).toContain('credit:NIP');
    expect(parts[1]).not.toContain('credit:NIP');
    expect(result.clean_text).not.toContain('must stay out');
    expect(result.factors?.find((factor) => factor.factor_id === 'additional_information')?.credited_to).toBe('NIP');

    const unverified = prepareDetermination(idrActor(), singleRequest({ chart_supports_factor_7_nip: true }), deps());
    expect(unverified.ok).toBe(false);
    expect(unverified.code).toBe('qa_failed');
    expect(unverified.gates.find((gate) => gate.id === 'factor_7_rule')?.detail).toMatch(/chart/i);
  });

  it('uses the public no-acuity draft and blocks production until a person approves', () => {
    const withoutAcuity = singleRequest({
      documents: singleRequest().documents.filter((doc) => doc.role !== 'records' && doc.role !== 'op_report'),
    });
    const pending = prepareDetermination(idrActor(), withoutAcuity, deps());
    expect(pending.ok).toBe(false);
    expect(pending.code).toBe('draft_pending_human_approval');
    expect(pending.production_allowed).toBe(false);
    expect(pending.clean_text).toBeNull();
    expect(pending.gates.every((gate) => gate.pass)).toBe(true);

    const files = readIdrContentFiles();
    files['config/idr/qa-checklist.yaml'] = files['config/idr/qa-checklist.yaml'].replace(
      /no_acuity_paragraph: ".*"/,
      'no_acuity_paragraph: "acuity:none"',
    );
    const filled = prepareDetermination(
      idrActor(),
      withoutAcuity,
      approvedDeps({ catalog: loadIdrCatalogFromFiles(files) }),
    );
    expect(filled.ok).toBe(true);
    expect(filled.production_allowed).toBe(true);
    expect(filled.clean_text).toContain('acuity:none');
    expect(filled.clean_text).not.toContain('are attached');
    expect(filled.clean_text).not.toContain(LIVE_TEXT_MARKER);
  });

  it('records the completed date in America/New_York', () => {
    const evening = prepareDetermination(
      idrActor(),
      singleRequest(),
      approvedDeps({ now: () => '2026-10-21T00:30:00.000Z' }),
    );
    expect(evening.ok).toBe(true);
    expect(evening.board?.date_completed).toBe('2026-10-20');

    const nextMorning = prepareDetermination(
      idrActor(),
      singleRequest(),
      approvedDeps({ now: () => '2026-10-21T12:30:00.000Z' }),
    );
    expect(nextMorning.board?.date_completed).toBe('2026-10-21');
  });
});

function requestFor(branch: string) {
  if (branch === 'ineligible') return nip(singleRequest({ eligibility: 'ineligible' }));
  if (branch === 'zero_offer') return nip(singleRequest({ line_items: [zeroLine()] }));
  if (branch === 'no_qpa') {
    const line = { ...singleRequest().line_items[0], qpa: { amount: null, doc_id: 'DOC-SYN-QPA', page: 1 } };
    return nip(singleRequest({ line_items: [line] }));
  }
  if (branch === 'batch_qpa_discrepancy') return batchRequest();
  if (branch === 'qpa_higher_than_brief') return nip(singleRequest({ brief_qpa: figure('800.00', 'DOC-SYN-BRIEF', 1) }));
  if (branch === 'qpa_lower_than_brief') return nip(singleRequest({ brief_qpa: figure('950.00', 'DOC-SYN-BRIEF', 1) }));
  if (branch === 'no_substantive_factors') {
    return nip(
      singleRequest({ factor_materials: singleRequest().factor_materials.filter((item) => item.party !== 'NIP') }),
    );
  }
  if (branch === 'nip_offer_higher') {
    const line = { ...singleRequest().line_items[0], nip_offer: figure('2000.00', 'DOC-SYN-NIP-OFFER', 3) };
    return nip(singleRequest({ line_items: [line] }));
  }
  throw new Error(branch);
}

function zeroLine() {
  return { ...singleRequest().line_items[0], nip_offer: figure('0.00', 'DOC-SYN-NIP-OFFER', 3) };
}
