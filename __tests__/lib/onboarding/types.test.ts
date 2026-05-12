import { describe, it, expect } from 'vitest';
import { nextIncompleteStep, STEP_KEYS } from '@/lib/onboarding/types';

describe('nextIncompleteStep', () => {
  it('returns the first key for an empty payload', () => {
    expect(nextIncompleteStep({})).toBe('brand');
  });

  it('skips steps that have at least one populated field', () => {
    expect(nextIncompleteStep({ brand: { display_name: 'Acme' } })).toBe('team');
  });

  it('treats an empty step object as incomplete', () => {
    expect(nextIncompleteStep({ brand: {} })).toBe('brand');
  });

  it('returns null when every step has content', () => {
    expect(
      nextIncompleteStep({
        brand: { display_name: 'A' },
        team: { operations_lead: { name: 'n', email: 'e@x.test' } },
        intake: { channels: ['portal'] },
        clinical: { primary_guideline: 'interqual' },
        kickoff: { target_go_live_date: '2026-06-01' },
      }),
    ).toBeNull();
  });

  it('STEP_KEYS is in the expected order', () => {
    expect(STEP_KEYS).toEqual(['brand', 'team', 'intake', 'clinical', 'kickoff']);
  });
});
