import { describe, expect, it } from 'vitest';
import { buildFactorEvidence, loadIdrCatalog, prepareDetermination, renderPartyParagraph } from '@/lib/idr/determination';
import { approvedDeps, batchRequest, deps, figure, idrActor, singleRequest } from './fixture';

describe('IDR ops QA regressions', () => {
  const checklist = loadIdrCatalog().checklist;

  it('does not give the NIP the IP acuity attachments when the NIP filed none', () => {
    const factors = buildFactorEvidence(singleRequest(), checklist);
    const acuity = factors.find((factor) => factor.factor_id === 'acuity_complexity');
    expect(acuity?.ip_narrative).toBe('acuity_attachments:records,op_report');
    expect(acuity?.nip_narrative).toBe('acuity:absent party:non-initiating party');
    const nip = renderPartyParagraph(factors, 'NIP');
    expect(nip).toContain('acuity:absent party:non-initiating party');
    expect(nip).not.toContain('acuity_attachments');

    const onlyNipReport = singleRequest({
      documents: singleRequest().documents.map((doc) =>
        doc.role === 'records' || doc.role === 'op_report' ? { ...doc, party: 'NIP' as const } : doc,
      ),
    });
    const flipped = buildFactorEvidence(onlyNipReport, checklist).find((factor) => factor.factor_id === 'acuity_complexity');
    expect(flipped?.nip_narrative).toBe('acuity_attachments:records,op_report');
    expect(flipped?.ip_narrative).toBe('acuity:absent party:initiating party');
    expect(flipped?.ip_narrative).not.toContain('acuity_attachments');
  });

  it('links a batch line only when its offers, QPA, and service label match the primary line', () => {
    const differing = prepareDetermination(idrActor(), batchRequest(), approvedDeps());
    const differingChart = differing.clean_text?.split(/\n\s*\n/)[0] ?? '';
    expect(differing.ok).toBe(true);
    expect(differingChart).not.toContain('same as');
    expect(differingChart).toContain('line:LI-SYN-A');
    expect(differingChart).toContain('ip_offer:$1,500.00');
    expect(differingChart).toContain('line:LI-SYN-B ip_offer:$2,000.00 nip_offer:$1,200.00 qpa:$1,100.00');

    const primary = batchRequest().line_items[0];
    const matched = batchRequest();
    matched.prevailing_party = 'IP';
    matched.line_items = [
      primary,
      {
        line_id: 'LI-SYN-B',
        label: primary.label,
        ip_offer: figure('1500.00', 'DOC-SYN-IP-OFFER', 4),
        nip_offer: figure('1000.00', 'DOC-SYN-NIP-OFFER', 5),
        qpa: figure('900.00', 'DOC-SYN-QPA', 2),
      },
      {
        line_id: 'LI-SYN-C',
        label: 'Synthetic service C',
        ip_offer: figure('1500.00', 'DOC-SYN-IP-OFFER', 6),
        nip_offer: figure('1000.00', 'DOC-SYN-NIP-OFFER', 7),
        qpa: figure('900.00', 'DOC-SYN-QPA', 3),
      },
    ];
    const result = prepareDetermination(idrActor(), matched, approvedDeps());
    expect(result.ok).toBe(true);
    const chart = result.clean_text?.split(/\n\s*\n/)[0] ?? '';
    expect(chart.split('line:LI-SYN-B')[0]).not.toContain('same as');
    expect(chart).toContain('line:LI-SYN-B same as LI-SYN-A ip_offer:$1,500.00 nip_offer:$1,000.00 qpa:$900.00');
    expect(chart).toContain('line:LI-SYN-C ip_offer:$1,500.00 nip_offer:$1,000.00 qpa:$900.00');
    expect(chart.split('line:LI-SYN-C')[1]).not.toContain('same as');
  });

  it('does not choose wording when the NIP offer is higher and the IP still prevails', () => {
    const request = singleRequest({
      line_items: [{ ...singleRequest().line_items[0], nip_offer: figure('2000.00', 'DOC-SYN-NIP-OFFER', 3) }],
    });
    const result = prepareDetermination(idrActor(), request, approvedDeps());
    expect(result.ok).toBe(false);
    expect(result.code).toBe('human_decision');
    expect(result.production_allowed).toBe(false);
    expect(result.clean_text).toBeNull();
    expect(result.board).toBeNull();
    expect(result.stamps).toBeNull();
    expect(result.message).toMatch(/person decides the wording/i);
    expect(result.signed).toBe(false);
    expect(result.submitted).toBe(false);

    const secondaryOnly = batchRequest();
    secondaryOnly.prevailing_party = 'IP';
    secondaryOnly.line_items = [
      secondaryOnly.line_items[0],
      { ...secondaryOnly.line_items[1], nip_offer: figure('4000.00', 'DOC-SYN-NIP-OFFER', 5) },
    ];
    const secondary = prepareDetermination(idrActor(), secondaryOnly, deps());
    expect(secondary.code).toBe('human_decision');
    expect(secondary.stamps).toBeNull();

    const nipPrevails = prepareDetermination(
      idrActor(),
      { ...request, prevailing_party: 'NIP' },
      approvedDeps(),
    );
    expect(nipPrevails.stamps?.template_id).toBe('nip-nip-offer-higher');
    expect(nipPrevails.code).not.toBe('human_decision');
  });
});
