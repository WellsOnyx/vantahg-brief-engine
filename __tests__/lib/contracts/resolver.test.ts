import { describe, it, expect } from 'vitest';
import { resolveTemplate } from '@/lib/contracts/resolver';
import type { ContractTemplate, SignupSnapshot } from '@/lib/contracts/types';

const FIXED_NOW = new Date('2026-05-11T12:00:00Z');

const MINI_TEMPLATE: ContractTemplate = {
  slug: 'test',
  version: 'v1',
  title: 'Test',
  bodyMd: `Hello {{tpa_legal_name}}{{#tpa_dba}} d/b/a {{tpa_dba}}{{/tpa_dba}}.\nRate: {{pepm}}.\nEffective {{effective_date}}.`,
  signerRoles: [],
  variables: [
    { key: 'tpa_legal_name', label: 'Legal name', source: 'signup', signupField: 'legal_name', format: 'text', required: true },
    { key: 'tpa_dba', label: 'DBA', source: 'signup', signupField: 'dba', format: 'text', required: false },
    { key: 'pepm', label: 'PEPM', source: 'signup', signupField: 'pepm_rate_cents', format: 'money_cents', required: true },
    { key: 'effective_date', label: 'Effective date', source: 'computed', format: 'date', required: true },
  ],
};

describe('resolveTemplate', () => {
  it('substitutes signup-sourced values', () => {
    const snapshot: SignupSnapshot = {
      legal_name: 'Acme Health TPA Inc.',
      dba: null,
      pepm_rate_cents: 240,
    };
    const r = resolveTemplate(MINI_TEMPLATE, snapshot, { now: FIXED_NOW });
    expect(r.resolvedMd).toContain('Hello Acme Health TPA Inc.');
    expect(r.resolvedMd).toContain('Rate: $2.40.');
    expect(r.resolvedMd).toContain('Effective 2026-05-11.');
    expect(r.unresolvedKeys).toEqual([]);
  });

  it('renders block content only when the block variable is truthy', () => {
    const withDba = resolveTemplate(MINI_TEMPLATE, {
      legal_name: 'Acme',
      dba: 'Acme Health',
      pepm_rate_cents: 100,
    }, { now: FIXED_NOW });
    expect(withDba.resolvedMd).toContain('Acme d/b/a Acme Health.');

    const withoutDba = resolveTemplate(MINI_TEMPLATE, {
      legal_name: 'Acme',
      dba: null,
      pepm_rate_cents: 100,
    }, { now: FIXED_NOW });
    expect(withoutDba.resolvedMd).toContain('Hello Acme.');
    expect(withoutDba.resolvedMd).not.toContain('d/b/a');
  });

  it('overrides win even when a signup value exists', () => {
    const r = resolveTemplate(MINI_TEMPLATE, {
      legal_name: 'Wrong Name Inc.',
      pepm_rate_cents: 240,
    }, {
      overrides: { tpa_legal_name: 'Correct Name Inc.' },
      now: FIXED_NOW,
    });
    expect(r.resolvedMd).toContain('Correct Name Inc.');
    expect(r.resolvedMd).not.toContain('Wrong Name Inc.');
  });

  it('formats money_cents to $X.XX', () => {
    const r = resolveTemplate(MINI_TEMPLATE, {
      legal_name: 'A',
      pepm_rate_cents: 12345, // $123.45
    }, { now: FIXED_NOW });
    expect(r.values.pepm).toBe('$123.45');
  });

  it('emits unresolvedKeys for required variables with no source value and no default', () => {
    const r = resolveTemplate(MINI_TEMPLATE, {
      // legal_name and pepm_rate_cents intentionally missing
    }, { now: FIXED_NOW });
    expect(r.unresolvedKeys).toContain('tpa_legal_name');
    expect(r.unresolvedKeys).toContain('pepm');
    expect(r.resolvedMd).toContain('[MISSING: tpa_legal_name]');
  });

  it('uses defaultValue when a non-required variable is missing', () => {
    const TPL: ContractTemplate = {
      ...MINI_TEMPLATE,
      bodyMd: 'Term: {{term}} months.',
      variables: [
        { key: 'term', label: 'Term', source: 'override', format: 'integer', required: false, defaultValue: '12' },
      ],
    };
    const r = resolveTemplate(TPL, {}, { now: FIXED_NOW });
    expect(r.resolvedMd).toBe('Term: 12 months.');
    expect(r.unresolvedKeys).toEqual([]);
  });

  it('computes effective_date as today (ISO date)', () => {
    const r = resolveTemplate(MINI_TEMPLATE, {
      legal_name: 'A',
      pepm_rate_cents: 100,
    }, { now: new Date('2027-01-15T00:00:00Z') });
    expect(r.values.effective_date).toBe('2027-01-15');
  });

  it('composes a tpa_address from street/city/state/zip', () => {
    const TPL: ContractTemplate = {
      ...MINI_TEMPLATE,
      bodyMd: 'Address: {{tpa_address}}',
      variables: [
        { key: 'tpa_address', label: 'Address', source: 'computed', format: 'address', required: false, defaultValue: '[address]' },
      ],
    };
    const r = resolveTemplate(TPL, {
      street_address: '123 Main St',
      city: 'Miami',
      state: 'FL',
      zip: '33101',
    }, { now: FIXED_NOW });
    expect(r.resolvedMd).toBe('Address: 123 Main St, Miami, FL, 33101');
  });

  it('falls back to defaultValue when composed address has no components', () => {
    const TPL: ContractTemplate = {
      ...MINI_TEMPLATE,
      bodyMd: 'Address: {{tpa_address}}',
      variables: [
        { key: 'tpa_address', label: 'Address', source: 'computed', format: 'address', required: false, defaultValue: '[address on file]' },
      ],
    };
    const r = resolveTemplate(TPL, {}, { now: FIXED_NOW });
    expect(r.resolvedMd).toBe('Address: [address on file]');
  });

  it('handles repeated variable usage', () => {
    const TPL: ContractTemplate = {
      ...MINI_TEMPLATE,
      bodyMd: '{{name}} agrees that {{name}} is bound by {{name}}\'s obligations.',
      variables: [
        { key: 'name', label: 'Name', source: 'signup', signupField: 'legal_name', format: 'text', required: true },
      ],
    };
    const r = resolveTemplate(TPL, { legal_name: 'Acme' }, { now: FIXED_NOW });
    expect(r.resolvedMd).toBe("Acme agrees that Acme is bound by Acme's obligations.");
  });
});

describe('resolveTemplate — MSA-with-BAA v1 integration', () => {
  it('resolves the production template end-to-end without unresolved required keys', async () => {
    const { MSA_WITH_BAA_V1 } = await import('@/lib/contracts/templates/msa-with-baa-v1');
    const snapshot: SignupSnapshot = {
      legal_name: 'Sunshine Health TPA, LLC',
      dba: null,
      entity_state: 'Florida',
      street_address: '500 SW 1st Ave',
      city: 'Miami',
      state: 'FL',
      zip: '33130',
      primary_contact_name: 'Jane Operator',
      primary_contact_email: 'jane@sunshine.example',
      signer_name: 'Robert Signer',
      signer_title: 'CEO',
      signer_email: 'robert@sunshine.example',
      pepm_rate_cents: 240,
      estimated_members: 25000,
    };
    const r = resolveTemplate(MSA_WITH_BAA_V1, snapshot, { now: FIXED_NOW });
    expect(r.unresolvedKeys).toEqual([]);
    expect(r.resolvedMd).toContain('Sunshine Health TPA, LLC');
    expect(r.resolvedMd).toContain('$2.40');
    expect(r.resolvedMd).toContain('Robert Signer');
    expect(r.resolvedMd).toContain('Jonathan Arias'); // default override
    expect(r.resolvedMd).toContain('48 hours'); // default SLA
    expect(r.resolvedMd).toContain('500 SW 1st Ave, Miami, FL, 33130');
    expect(r.resolvedMd).toContain('2026-05-11'); // effective_date
    // Confirms placeholder/scaffold markers are still in there so the
    // lawyer-replacement gate is visible.
    expect(r.resolvedMd).toContain('[[PLACEHOLDER:');
  });
});
