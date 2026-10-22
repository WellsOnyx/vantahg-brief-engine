import { describe, expect, it } from 'vitest';
import { demoCriteriaFor } from '@/lib/vhg/criteria-demo';
import { getMedReviewDemoCase, panelFromCase } from '@/lib/vhg/portfolio';
import { VHG_BRAND, VHG_SCORE_LABEL } from '@/lib/vhg/brand';
import { bandForScore, scoreVhgCase } from '@/lib/vhg/score';
import type { VhgScoreInput } from '@/lib/vhg/types';

const base: VhgScoreInput = {
  network_status: 'in_network',
  specialty: 'orthopedics',
  cpt: '99213',
  service_line: 'Orthopedics',
  billed_amount: 280,
  qpa_amount: 250,
  state: 'MN',
  facility_type: 'office',
  encounter: 'scheduled',
};

describe('VHG score demo model', () => {
  it('marks the model as an unvalidated demo and keeps the physician in charge', () => {
    const score = scoreVhgCase(base);
    expect(score.model_status).toBe('demo_not_validated');
    expect(score.model_id).toBe('vhg-score-cms-puf-v1');
    expect(score.data_source).toBe('CMS public IDR PUF');
    expect(score.label).toBe(VHG_SCORE_LABEL);
    expect(score.label).toBe(`${VHG_BRAND} Score`);
    expect(score.label).not.toMatch(/VHG(?!\u2122)/);
    expect(score.trademark).toBe('TM');
    expect(score.advisory).toMatch(/doctor decides/i);
    expect(score.score).toBeGreaterThanOrEqual(0);
    expect(score.score).toBeLessThanOrEqual(100);
  });

  it('scores the featured out-of-network emergency case above the in-network office case', () => {
    const high = panelFromCase(getMedReviewDemoCase('vhg-mr-0101')!, false);
    const mid = panelFromCase(getMedReviewDemoCase('vhg-mr-0102')!, false);
    const low = panelFromCase(getMedReviewDemoCase('vhg-mr-0103')!, false);
    expect(high.score.band).toBe('high');
    expect(mid.score.band).toBe('medium');
    expect(low.score.band).toBe('low');
    expect(high.score.score).toBeGreaterThan(mid.score.score);
    expect(mid.score.score).toBeGreaterThan(low.score.score);
    expect(high.score.drivers.some((driver) => driver.label === 'Out-of-network provider')).toBe(true);
    expect(high.criteria.label).toBe('criteria result (demo)');
    expect(high.criteria.source_note).toMatch(/not InterQual/i);
    expect(high.criteria.items.map((item) => item.text).join(' ')).not.toMatch(/InterQual|MCG/i);
  });

  it('raises the score when the same case is out of network', () => {
    const inn = scoreVhgCase(base);
    const oon = scoreVhgCase({ ...base, network_status: 'out_of_network' });
    expect(oon.score).toBeGreaterThan(inn.score);
  });

  it('raises the score as the billed-to-QPA ratio climbs', () => {
    const lowRatio = scoreVhgCase({ ...base, network_status: 'out_of_network', billed_amount: 400, qpa_amount: 300 });
    const highRatio = scoreVhgCase({ ...base, network_status: 'out_of_network', billed_amount: 4000, qpa_amount: 300 });
    expect(highRatio.score).toBeGreaterThan(lowRatio.score);
  });

  it('is deterministic and uses the published bands', () => {
    expect(scoreVhgCase(base)).toEqual(scoreVhgCase(base));
    expect(bandForScore(39)).toBe('low');
    expect(bandForScore(40)).toBe('medium');
    expect(bandForScore(69)).toBe('medium');
    expect(bandForScore(70)).toBe('high');
  });

  it('uses placeholder criteria language only', () => {
    const criteria = demoCriteriaFor({
      ...base,
      network_status: 'out_of_network',
      encounter: 'emergency',
      facility_type: 'freestanding_er',
    });
    expect(criteria.source_note).toMatch(/not InterQual/i);
    expect(criteria.items.length).toBeGreaterThan(0);
  });
});
