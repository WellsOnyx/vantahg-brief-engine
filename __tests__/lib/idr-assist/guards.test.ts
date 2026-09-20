import { describe, expect, it } from 'vitest';
import {
  ENGINE_FLAG_CODES,
  IDR_DRAFT_STAMP,
  applyDraftStamp,
  assertDraftStamped,
  assertExternalSurfaceClean,
  assertNeverSubmitSource,
  assertPrivateBind,
  assertServeAccessCode,
  decideAssistTouch,
  filterAssistActions,
  isDraftStamped,
  isHumanOnlyControl,
  isSubmitControl,
} from '@/lib/idr-assist';

describe('assertPrivateBind', () => {
  it('accepts loopback and RFC1918 private addresses', () => {
    for (const h of [
      '127.0.0.1',
      'localhost',
      '::1',
      '10.1.2.3',
      '172.16.0.9',
      '172.31.255.1',
      '192.168.1.50',
    ]) {
      expect(() => assertPrivateBind(h)).not.toThrow();
    }
  });

  it('REFUSES all-interface and public addresses', () => {
    for (const h of ['0.0.0.0', '::', '', '*', '8.8.8.8', '54.12.33.9', '172.32.0.1', '192.169.0.1']) {
      expect(() => assertPrivateBind(h)).toThrow(/REFUSING TO BIND/);
    }
  });
});

describe('assertServeAccessCode', () => {
  it('refuses a missing or short access code', () => {
    expect(() => assertServeAccessCode('')).toThrow(/access code/i);
    expect(() => assertServeAccessCode('short')).toThrow(/access code/i);
  });

  it('accepts a 6+ character shared code', () => {
    expect(() => assertServeAccessCode('shared-code-123')).not.toThrow();
  });
});

describe('never-submit guards', () => {
  it('classifies submit/save/next/attest controls as forbidden', () => {
    expect(isSubmitControl({ type: 'submit', value: 'Go' })).toBe(true);
    expect(isSubmitControl({ id: 'go', value: 'Submit Determination' })).toBe(true);
    expect(isSubmitControl({ label: 'Save and continue' })).toBe(true);
    expect(isSubmitControl({ rowText: 'Finalize case' })).toBe(true);
    expect(isSubmitControl({ name: 'attest' })).toBe(true);
  });

  it('does not treat ordinary draft fields as submit controls', () => {
    expect(isSubmitControl({ id: 'rationale', label: 'Rationale' })).toBe(false);
    expect(isSubmitControl({ id: 'coi', label: 'No To All Questions', type: 'checkbox' })).toBe(false);
    expect(isSubmitControl({ id: 'pp', label: 'Prevailing Party' })).toBe(false);
  });

  it('treats a field whose label looks like submit as forbidden even if it matches a fill pattern', () => {
    const decision = decideAssistTouch({
      id: 'x',
      label: 'Rationale — Save and Submit',
      tagName: 'textarea',
    });
    expect(decision.mayTouch).toBe(false);
    expect(decision.submitted).toBe(false);
    expect(decision.reason).toMatch(/never-submit/);
  });

  it('never fills human-only DLI / attestation fields', () => {
    expect(isHumanOnlyControl({ id: 'dli', label: 'Dispute Line Item Name' })).toBe(true);
    expect(isHumanOnlyControl({ label: 'Attestation name + date' })).toBe(true);
    expect(decideAssistTouch({ id: 'dli', label: 'DLI number' }).mayTouch).toBe(false);
    expect(decideAssistTouch({ id: 'rationale', label: 'Rationale' }).mayTouch).toBe(true);
  });

  it('filters a mixed assist plan: fills draft fields, blocks submit + human-only, pins submitted:false', () => {
    const result = filterAssistActions([
      { op: 'check', control: { id: 'coi', label: 'No To All Questions', type: 'checkbox' }, checked: true },
      { op: 'set_value', control: { id: 'rat', label: 'Rationale' }, value: 'Draft rationale' },
      { op: 'set_value', control: { id: 'dli', label: 'Dispute Line Item Name' }, value: 'DLI-999' },
      { op: 'click', control: { id: 'go', type: 'submit', value: 'Submit Determination' } },
      { op: 'submit' },
    ]);

    expect(result.submitted).toBe(false);
    expect(result.applied).toHaveLength(2);
    expect(result.blocked).toHaveLength(3);
    expect(result.blocked.some((b) => /human-only field/.test(b.reason))).toBe(true);
    expect(result.blocked.some((b) => /never-submit: submit is forbidden/.test(b.reason))).toBe(true);
    expect(result.blocked.some((b) => /submit\/save\/next\/attest/.test(b.reason))).toBe(true);
  });

  it('refuses assist source that actuates form.submit or SubmitEvent', () => {
    expect(() =>
      assertNeverSubmitSource('function fill(){ document.forms[0].submit(); }'),
    ).toThrow(/submit actuation/);
    expect(() =>
      assertNeverSubmitSource('el.dispatchEvent(new Event("submit"))'),
    ).toThrow(/submit actuation/);
    expect(() =>
      assertNeverSubmitSource('form.dispatchEvent(new SubmitEvent("submit"))'),
    ).toThrow(/submit actuation/);
  });

  it('allows source that only mentions submit in a refuse path', () => {
    const source = `
      // never call form.submit — human clicks Save
      if (label.includes('submit')) return { submitted: false };
    `;
    expect(() => assertNeverSubmitSource(source)).not.toThrow();
  });
});

describe('DRAFT stamps', () => {
  it('applies the canonical stamp and is idempotent', () => {
    const stamped = applyDraftStamp('Case DISP-880001 mirror');
    expect(stamped.startsWith(IDR_DRAFT_STAMP)).toBe(true);
    expect(isDraftStamped(stamped)).toBe(true);
    expect(applyDraftStamp(stamped)).toBe(stamped);
  });

  it('accepts the short stamp used on reviewer pages', () => {
    expect(isDraftStamped('DRAFT FOR ARBITER REVIEW\nqueue')).toBe(true);
    expect(() => assertDraftStamped('DRAFT FOR ARBITER REVIEW — queue')).not.toThrow();
  });

  it('refuses to emit an unstamped artifact', () => {
    expect(() => assertDraftStamped('final determination ready to send')).toThrow(/DRAFT stamp/);
  });
});

describe('iMPROve-facing surface cleanliness', () => {
  it('allows plain-language case notes', () => {
    expect(() =>
      assertExternalSurfaceClean('NIP offer equals QPA. Reviewer selected initiating party.'),
    ).not.toThrow();
  });

  it('refuses tooling language and engine flag tokens', () => {
    expect(() => assertExternalSurfaceClean('paste portal_fill JSON')).toThrow(/tooling language/);
    expect(() => assertExternalSurfaceClean('see idr-engine output')).toThrow(/tooling language/);
    expect(() =>
      assertExternalSurfaceClean(`notes: ${ENGINE_FLAG_CODES[0]}; NIP_OFFER_EQUALS_QPA`),
    ).toThrow(/flag tokens/);
  });
});
