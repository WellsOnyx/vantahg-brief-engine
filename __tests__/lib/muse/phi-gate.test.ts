import { describe, expect, it } from 'vitest';
import { MUSE_PHI_FIELDS, screenMusePayload } from '@/lib/muse';

const CLEAN = {
  account_id: 'acct_synth_001',
  contact_role: 'cx_owner',
  scheduling_intent: { kickoff: true, follow_up: false },
  external_touchpoint_id: 'mtp_ext_001',
};

describe('no PHI fields allowed', () => {
  it('accepts relationship metadata only', () => {
    const result = screenMusePayload(CLEAN);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.record.account_id).toBe('acct_synth_001');
      expect(result.record.contact_role).toBe('cx_owner');
      expect(result.record.scheduling_intent.kickoff).toBe(true);
      expect(result.record.scheduling_intent.hypercare_standup).toBe(false);
      expect(result.record).not.toHaveProperty('patient_name');
      expect(result.record).not.toHaveProperty('member_id');
    }
  });

  it.each([
    'patient_name',
    'member_id',
    'member_ref',
    'dob',
    'date_of_birth',
    'ssn',
    'diagnosis',
    'clinical_note',
    'determination',
    'procedure_codes',
    'email',
    'phone',
  ] as const)('rejects %s and does not echo the value', (field) => {
    const result = screenMusePayload({ ...CLEAN, [field]: 'should-not-store' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('phi_field');
      expect(result.field).toBe(field);
      expect(JSON.stringify(result)).not.toContain('should-not-store');
    }
  });

  it('rejects a nested PHI key inside scheduling_intent', () => {
    const result = screenMusePayload({
      ...CLEAN,
      scheduling_intent: { kickoff: true, patient_name: 'should-not-store' },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('phi_field');
      expect(result.field).toContain('patient_name');
      expect(JSON.stringify(result)).not.toContain('should-not-store');
    }
  });

  it('rejects unknown fields that could smuggle case content', () => {
    const result = screenMusePayload({ ...CLEAN, clinical_summary: 'packet text' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('unknown_field');
      expect(result.field).toBe('clinical_summary');
      expect(JSON.stringify(result)).not.toContain('packet text');
    }
  });

  it('rejects an account id that looks like an email, SSN, or date', () => {
    for (const account_id of ['ops@acme.example', '123-45-6789', '1980-01-02']) {
      const result = screenMusePayload({ ...CLEAN, account_id });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe('phi_field');
        expect(result.field).toBe('account_id');
        expect(JSON.stringify(result)).not.toContain(account_id);
      }
    }
  });

  it('covers the published PHI denylist', () => {
    expect(MUSE_PHI_FIELDS).toEqual(expect.arrayContaining([
      'patient_name',
      'member_id',
      'dob',
      'diagnosis',
      'clinical_note',
      'determination',
    ]));
  });
});
