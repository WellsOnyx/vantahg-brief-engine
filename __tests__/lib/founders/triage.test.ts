import { describe, it, expect } from 'vitest';
import { triageCase, triageBatch, summarizeBatch, laneToReviewerRole } from '@/lib/founders/triage';
import type { Case } from '@/lib/types';

const baseCase: Partial<Case> & { id?: string } = {
  id: 'case-1',
  priority: 'standard',
  service_category: 'imaging',
  facility_type: 'outpatient',
  procedure_codes: ['72148'],
  diagnosis_codes: ['M54.5'],
  review_type: 'prior_auth',
};

describe('triageCase — defects route to CSR', () => {
  it('eligibility red dot is a hard stop', () => {
    const d = triageCase(baseCase, { eligibility_red: true });
    expect(d.lane).toBe('csr_review');
    expect(d.blocker).toBe('eligibility_red');
    expect(d.confidence).toBe(1);
  });

  it('missing fields → CSR review', () => {
    const d = triageCase(baseCase, { has_missing_fields: true });
    expect(d.lane).toBe('csr_review');
    expect(d.blocker).toBe('missing_fields');
  });

  it('duplicate fingerprint → CSR review', () => {
    const d = triageCase(baseCase, { duplicate_fingerprint: true });
    expect(d.lane).toBe('csr_review');
    expect(d.blocker).toBe('duplicate');
  });
});

describe('triageCase — MD lane', () => {
  it('inpatient routes to MD with urgent priority', () => {
    const d = triageCase({ ...baseCase, facility_type: 'inpatient' });
    expect(d.lane).toBe('md');
    expect(d.priority).toBe('urgent');
    expect(d.reasons.join(' ')).toMatch(/inpatient/i);
  });

  it('oncology routes to MD with urgent priority', () => {
    const d = triageCase({ ...baseCase, service_category: 'oncology' });
    expect(d.lane).toBe('md');
    expect(d.priority).toBe('urgent');
  });

  it('peer-to-peer routes to MD', () => {
    const d = triageCase({ ...baseCase, review_type: 'peer_to_peer' });
    expect(d.lane).toBe('md');
  });

  it('appeal routes to MD', () => {
    const d = triageCase({ ...baseCase, review_type: 'appeal' });
    expect(d.lane).toBe('md');
  });

  it('chemotherapy CPT routes to MD', () => {
    const d = triageCase({ ...baseCase, procedure_codes: ['J9035'] });
    expect(d.lane).toBe('md');
  });

  it('cancer diagnosis routes to MD', () => {
    const d = triageCase({ ...baseCase, diagnosis_codes: ['C50.9'] });
    expect(d.lane).toBe('md');
  });

  it('MD lane with multiple flags has confidence 1', () => {
    const d = triageCase({ ...baseCase, facility_type: 'inpatient', service_category: 'oncology' });
    expect(d.lane).toBe('md');
    expect(d.confidence).toBe(1);
  });
});

describe('triageCase — RN lane', () => {
  it('medication intake → RN', () => {
    const d = triageCase({ ...baseCase, intake_service_type: 'medication' });
    expect(d.lane).toBe('rn');
  });

  it('home_health service category → RN', () => {
    const d = triageCase({ ...baseCase, service_category: 'home_health' });
    expect(d.lane).toBe('rn');
  });

  it('concurrent review → RN', () => {
    const d = triageCase({ ...baseCase, review_type: 'concurrent' });
    expect(d.lane).toBe('rn');
  });
});

describe('triageCase — LPN lane (default)', () => {
  it('clean outpatient imaging → LPN', () => {
    const d = triageCase(baseCase);
    expect(d.lane).toBe('lpn');
    expect(d.priority).toBe('standard');
  });

  it('routine DME → LPN', () => {
    const d = triageCase({ ...baseCase, service_category: 'dme' });
    expect(d.lane).toBe('lpn');
  });

  it('LPN routing has lower confidence than MD multi-flag', () => {
    const lpn = triageCase(baseCase);
    const md = triageCase({ ...baseCase, facility_type: 'inpatient', service_category: 'oncology' });
    expect(lpn.confidence).toBeLessThan(md.confidence);
  });
});

describe('triageCase — SLA-driven priority escalation', () => {
  it('case with <24h on SLA escalates to expedited', () => {
    const now = new Date('2026-05-10T12:00:00Z');
    const deadline = new Date(now.getTime() + 12 * 60 * 60 * 1000);
    const d = triageCase({ ...baseCase, turnaround_deadline: deadline.toISOString() }, { now });
    expect(d.priority).toBe('expedited');
  });

  it('overdue case escalates and goes to MD', () => {
    const now = new Date('2026-05-10T12:00:00Z');
    const deadline = new Date(now.getTime() - 60 * 60 * 1000);
    const d = triageCase({ ...baseCase, turnaround_deadline: deadline.toISOString() }, { now });
    expect(d.priority).toBe('expedited');
    expect(d.lane).toBe('md');
  });
});

describe('triageBatch + summarize', () => {
  it('summarizes a mix correctly', () => {
    const cases: Array<{ case: Partial<Case> & { id?: string } }> = [
      { case: { ...baseCase, id: 'a' } },                                           // LPN
      { case: { ...baseCase, id: 'b', facility_type: 'inpatient' } },               // MD
      { case: { ...baseCase, id: 'c', intake_service_type: 'medication' } },        // RN
      { case: { ...baseCase, id: 'd' } },                                           // LPN
    ];
    const decisions = triageBatch(cases);
    const sum = summarizeBatch(decisions);

    expect(sum.total).toBe(4);
    expect(sum.byLane.lpn).toBe(2);
    expect(sum.byLane.md).toBe(1);
    expect(sum.byLane.rn).toBe(1);
    expect(sum.blocked).toBe(0);
    expect(sum.averageConfidence).toBeGreaterThan(0);
  });

  it('counts blockers separately', () => {
    const cases: Array<{ case: Partial<Case> & { id?: string }; ctx?: { eligibility_red?: boolean } }> = [
      { case: { ...baseCase, id: 'a' }, ctx: { eligibility_red: true } },
      { case: { ...baseCase, id: 'b' } },
    ];
    const decisions = triageBatch(cases);
    const sum = summarizeBatch(decisions);
    expect(sum.blocked).toBe(1);
    expect(sum.byLane.csr_review).toBe(1);
  });
});

describe('laneToReviewerRole', () => {
  it('maps correctly', () => {
    expect(laneToReviewerRole('lpn')).toBe('lpn');
    expect(laneToReviewerRole('rn')).toBe('rn');
    expect(laneToReviewerRole('md')).toBe('md');
    expect(laneToReviewerRole('csr_review')).toBe('admin');
    expect(laneToReviewerRole('auto_approve')).toBe('admin');
  });
});
