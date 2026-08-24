import { describe, it, expect } from 'vitest';
import {
  RATE_CARD,
  RATE_CARD_VERSION,
  UM_PEPM_USD,
  UM_PEPM_CENTS,
  UM_CORRIDOR,
  SERVICE_LINE_RATE_KEYS,
  PRODUCT_LINE_KEYS,
  rateForServiceLine,
  usdToCents,
} from '@/lib/billing/rate-card-v2';

describe('rate card v2.0 — locked lines', () => {
  it('is version 2.0', () => {
    expect(RATE_CARD_VERSION).toBe('2.0');
  });

  it('UM PEPM is $2.50 with 1.65 corridor', () => {
    expect(RATE_CARD.um_pepm.amount).toBe(2.5);
    expect(UM_PEPM_USD).toBe(2.5);
    expect(UM_PEPM_CENTS).toBe(250);
    expect(RATE_CARD.um_pepm.unit).toBe('pepm');
    expect(RATE_CARD.um_pepm.hourly).toBe(false);
    expect(RATE_CARD.um_pepm.corridor).toBe(1.65);
    expect(UM_CORRIDOR).toBe(1.65);
  });

  it('UM PEPM attaches to both UM service-line settings', () => {
    expect(SERVICE_LINE_RATE_KEYS.um_with_mr).toBe('um_pepm');
    expect(SERVICE_LINE_RATE_KEYS.um_without_mr).toBe('um_pepm');
    expect(rateForServiceLine('um_with_mr')?.amount).toBe(2.5);
    expect(rateForServiceLine('um_without_mr')?.amount).toBe(2.5);
    expect(rateForServiceLine('idr')).toBeNull();
    expect(rateForServiceLine('iro_ire')).toBeNull();
    expect(rateForServiceLine('credentialing')).toBeNull();
  });

  it('readmission is $0.95 PEPM', () => {
    expect(RATE_CARD.readmission.amount).toBe(0.95);
    expect(RATE_CARD.readmission.unit).toBe('pepm');
    expect(RATE_CARD.readmission.hourly).toBe(false);
  });

  it('care management is $3.75 PEPM', () => {
    expect(RATE_CARD.care_management.amount).toBe(3.75);
    expect(RATE_CARD.care_management.unit).toBe('pepm');
    expect(RATE_CARD.care_management.hourly).toBe(false);
  });

  it('nurse line is $0.75 PEPM', () => {
    expect(RATE_CARD.nurse_line.amount).toBe(0.75);
    expect(RATE_CARD.nurse_line.unit).toBe('pepm');
    expect(RATE_CARD.nurse_line.hourly).toBe(false);
  });

  it('disease management PEPM is $1.95', () => {
    expect(RATE_CARD.disease_management_pepm.amount).toBe(1.95);
    expect(RATE_CARD.disease_management_pepm.unit).toBe('pepm');
    expect(RATE_CARD.disease_management_pepm.hourly).toBe(false);
  });

  it('disease management engaged is $175', () => {
    expect(RATE_CARD.disease_management_engaged.amount).toBe(175);
    expect(RATE_CARD.disease_management_engaged.unit).toBe('per_engaged');
    expect(RATE_CARD.disease_management_engaged.hourly).toBe(false);
  });

  it('disease management engaged hourly is $145/hr — the only hourly rate', () => {
    expect(RATE_CARD.disease_management_engaged_hourly.amount).toBe(145);
    expect(RATE_CARD.disease_management_engaged_hourly.unit).toBe('per_hour');
    expect(RATE_CARD.disease_management_engaged_hourly.hourly).toBe(true);
    const hourlyKeys = Object.values(RATE_CARD).filter((l) => l.hourly).map((l) => l.key);
    expect(hourlyKeys).toEqual(['disease_management_engaged_hourly']);
  });

  it('nurse review is $55 per review', () => {
    expect(RATE_CARD.nurse_review.amount).toBe(55);
    expect(RATE_CARD.nurse_review.unit).toBe('per_review');
    expect(RATE_CARD.nurse_review.hourly).toBe(false);
  });

  it('MD review is $250 per review', () => {
    expect(RATE_CARD.md_review.amount).toBe(250);
    expect(RATE_CARD.md_review.unit).toBe('per_review');
    expect(RATE_CARD.md_review.hourly).toBe(false);
  });

  it('specialist review is $300 per review', () => {
    expect(RATE_CARD.specialist_review.amount).toBe(300);
    expect(RATE_CARD.specialist_review.unit).toBe('per_review');
    expect(RATE_CARD.specialist_review.hourly).toBe(false);
  });

  it('P2P is $225 / $150 per review', () => {
    expect(RATE_CARD.p2p_md.amount).toBe(225);
    expect(RATE_CARD.p2p_md.unit).toBe('per_review');
    expect(RATE_CARD.p2p_md.hourly).toBe(false);
    expect(RATE_CARD.p2p_followup.amount).toBe(150);
    expect(RATE_CARD.p2p_followup.unit).toBe('per_review');
    expect(RATE_CARD.p2p_followup.hourly).toBe(false);
  });

  it('expedite is +25%', () => {
    expect(RATE_CARD.expedite.amount).toBe(0.25);
    expect(RATE_CARD.expedite.unit).toBe('surcharge_multiplier');
    expect(RATE_CARD.expedite.hourly).toBe(false);
  });

  it('appeals use the same rate as the underlying review', () => {
    expect(RATE_CARD.appeals.unit).toBe('same_as_underlying_review');
    expect(RATE_CARD.appeals.hourly).toBe(false);
  });

  it('high-dollar is 22.5% of verified allowed with clawback', () => {
    expect(RATE_CARD.high_dollar.amount).toBe(0.225);
    expect(RATE_CARD.high_dollar.unit).toBe('percent_of_verified_allowed');
    expect(RATE_CARD.high_dollar.clawback).toBe(true);
    expect(RATE_CARD.high_dollar.hourly).toBe(false);
  });

  it('TPA-only reprice is 15%', () => {
    expect(RATE_CARD.tpa_only_reprice.amount).toBe(0.15);
    expect(RATE_CARD.tpa_only_reprice.unit).toBe('percent_of_savings');
    expect(RATE_CARD.tpa_only_reprice.hourly).toBe(false);
  });

  it('dialysis is $3500 PPPM', () => {
    expect(RATE_CARD.dialysis.amount).toBe(3500);
    expect(RATE_CARD.dialysis.unit).toBe('pppm');
    expect(RATE_CARD.dialysis.hourly).toBe(false);
  });

  it('maternity is $850 per episode', () => {
    expect(RATE_CARD.maternity.amount).toBe(850);
    expect(RATE_CARD.maternity.unit).toBe('per_episode');
    expect(RATE_CARD.maternity.hourly).toBe(false);
  });

  it('does not invent a $12 PEPM', () => {
    const pepmAmounts = Object.values(RATE_CARD)
      .filter((l) => l.unit === 'pepm')
      .map((l) => l.amount);
    expect(pepmAmounts).not.toContain(12);
    expect(usdToCents(UM_PEPM_USD)).toBe(250);
  });

  it('missing product lines exist as config, not runtime service lines', () => {
    expect(PRODUCT_LINE_KEYS).toEqual(expect.arrayContaining([
      'readmission',
      'care_management',
      'nurse_line',
      'disease_management',
      'dialysis',
      'maternity',
    ]));
  });
});
