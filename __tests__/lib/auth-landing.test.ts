import { describe, it, expect } from 'vitest';
import { landingPathForRole } from '@/lib/auth-landing';

describe('landingPathForRole', () => {
  it('routes clinical and client roles to app surfaces (never /)', () => {
    expect(landingPathForRole('admin')).toBe('/mission-control');
    expect(landingPathForRole('client')).toBe('/client/cases');
    expect(landingPathForRole('reviewer')).toBe('/cases');
    expect(landingPathForRole('concierge')).toBe('/cases');
    expect(landingPathForRole(null)).toBe('/cases');
  });
});
