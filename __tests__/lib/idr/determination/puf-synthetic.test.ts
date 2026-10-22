import { describe, expect, it } from 'vitest';
import {
  PUF_2024_SHARES,
  generateSyntheticDisputes,
  prepareDetermination,
  syntheticDisputeToRequest,
} from '@/lib/idr/determination';
import { approvedDeps, idrActor } from './fixture';

describe('CMS public-use-file synthetic disputes', () => {
  it('draws 5,000 obvious fakes from the published 2024 shares', () => {
    const disputes = generateSyntheticDisputes(5000);
    const again = generateSyntheticDisputes(5000);
    expect(again[0]).toEqual(disputes[0]);
    expect(again[4999]).toEqual(disputes[4999]);
    expect(disputes).toHaveLength(5000);
    expect(new Set(disputes.map((dispute) => dispute.dispute_ref)).size).toBe(5000);
    expect(disputes[0]?.dispute_ref).toBe('DISP-SYN-00001');
    expect(disputes[4999]?.dispute_ref).toBe('DISP-SYN-05000');
    expect(disputes.every((dispute) => /^DISP-SYN-\d{5}$/.test(dispute.dispute_ref))).toBe(true);
    expect(disputes.every((dispute) => dispute.shape === 'single')).toBe(true);
    expect(disputes.every((dispute) => dispute.provider_offer_cents !== dispute.plan_offer_cents)).toBe(true);
    expect(disputes.every((dispute) => dispute.qpa_cents >= 10_000 && dispute.qpa_cents <= 500_000)).toBe(true);

    expectShare(
      pct(disputes.filter((dispute) => dispute.initiating_side === 'provider_or_facility').length, 5000),
      PUF_2024_SHARES.provider_initiated_pct,
    );
    expectShare(
      pct(disputes.filter((dispute) => dispute.service === 'air ambulance service').length, 5000),
      PUF_2024_SHARES.air_ambulance_pct,
    );
    const eligible = disputes.filter((dispute) => dispute.eligibility === 'eligible');
    expectShare(pct(5000 - eligible.length, 5000), PUF_2024_SHARES.ineligible_pct);
    expectShare(
      pct(eligible.filter((dispute) => dispute.prevailing_side === 'provider_or_facility').length, eligible.length),
      PUF_2024_SHARES.provider_prevails_among_determinations_pct,
    );
    expectShare(
      pct(disputes.filter((dispute) => dispute.plan_offer_cents <= dispute.qpa_cents).length, 5000),
      PUF_2024_SHARES.insurer_offer_at_or_below_qpa_pct,
    );
    const selectedAbove = eligible.filter((dispute) => {
      const selected =
        dispute.prevailing_side === 'provider_or_facility' ? dispute.provider_offer_cents : dispute.plan_offer_cents;
      return selected > dispute.qpa_cents;
    }).length;
    expectShare(pct(selectedAbove, eligible.length), PUF_2024_SHARES.selected_offer_above_qpa_pct);
  }, 30_000);

  it('prepares the 5,000-case set without copying a public-use-file row', () => {
    const used = approvedDeps();
    const disputes = generateSyntheticDisputes(5000);
    const codes = new Map<string, number>();
    for (const dispute of disputes) {
      const request = syntheticDisputeToRequest(dispute);
      const result = prepareDetermination(idrActor(), request, used);
      codes.set(result.code, (codes.get(result.code) ?? 0) + 1);
      expect(result.production_allowed).toBe(result.ok);
      expect(result.signed).toBe(false);
      expect(result.submitted).toBe(false);
      const nipHigher =
        request.prevailing_party === 'IP' &&
        request.line_items.some((item) => Number(item.nip_offer.amount) > Number(item.ip_offer.amount));
      if (nipHigher) {
        expect(result.code).toBe('human_decision');
        expect(result.clean_text).toBeNull();
        expect(result.stamps).toBeNull();
      } else {
        expect(result.code).toBe('ready');
      }
    }
    expect((codes.get('ready') ?? 0) + (codes.get('human_decision') ?? 0)).toBe(5000);
    expect(codes.get('human_decision') ?? 0).toBeGreaterThan(0);
    const ineligible = disputes.find((dispute) => dispute.eligibility === 'ineligible');
    if (!ineligible) throw new Error('expected an ineligible synthetic dispute');
    const sample = prepareDetermination(idrActor(), syntheticDisputeToRequest(ineligible), used);
    expect(sample.stamps?.template_id).toBe('nip-ineligible');
    expect(sample.clean_text).not.toContain('TODO-LIVE-TEXT');
  }, 120_000);
});

function pct(count: number, total: number): number {
  return (count / total) * 100;
}

function expectShare(actual: number, target: number): void {
  expect(Math.abs(actual - target), `${actual.toFixed(2)} vs ${target}`).toBeLessThanOrEqual(2);
}
