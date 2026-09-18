import { describe, it, expect } from 'vitest';
import {
  mapMetadataToCognitoAttributes,
  roleFromCognitoClaims,
} from '@/lib/adapters/auth/cognito';

describe('Cognito custom attribute mapping', () => {
  it('maps role → custom:org_role and drops undeclared keys', () => {
    const attrs = mapMetadataToCognitoAttributes({
      role: 'client',
      name: 'should-not-become-custom',
      signup_id: 'abc',
      extra: 'nope',
    });
    const byName = Object.fromEntries(attrs.map((a) => [a.Name, a.Value]));
    expect(byName['custom:org_role']).toBe('client');
    expect(byName['custom:signup_id']).toBe('abc');
    expect(byName['custom:name']).toBeUndefined();
    expect(byName['custom:extra']).toBeUndefined();
    expect(byName['custom:role']).toBeUndefined();
  });

  it('skips nullish values', () => {
    expect(mapMetadataToCognitoAttributes({ org_role: undefined, client_id: '' })).toEqual([
      { Name: 'custom:client_id', Value: '' },
    ]);
  });

  it('prefers custom:org_role over legacy custom:role on the id token', () => {
    expect(
      roleFromCognitoClaims({ 'custom:org_role': 'reviewer', 'custom:role': 'admin' }),
    ).toBe('reviewer');
    expect(roleFromCognitoClaims({ 'custom:role': 'client' })).toBe('client');
    expect(roleFromCognitoClaims({})).toBeUndefined();
  });
});
