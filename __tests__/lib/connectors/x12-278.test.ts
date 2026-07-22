import { describe, it, expect } from 'vitest';
import { tokenizeX12, parse278ToCanonical, render278Response } from '@/lib/connectors/x12-278';

/**
 * X12 278 rail (005010X217 subset): tokenizer delimiter derivation from the
 * ISA itself, request → CanonicalCase parsing (HL walk, NM1 qualifiers,
 * TRN02 idempotency, UM06 priority, HI diagnosis dot-normalization,
 * SV1/SV2 procedures), PHI-free parse errors, and response rendering
 * (mirrored envelope, HCR action + auth number, correct SE count).
 */

// A realistic 278 request: UMO → requester → subscriber → event, knee
// arthroplasty (27447) for OA (M17.11), urgent, trace REF-X12-000042.
function sample278(overrides: { trace?: string; um06?: string; sep?: string } = {}): string {
  const trace = overrides.trace ?? 'REF-X12-000042';
  const um06 = overrides.um06 ?? '';
  return [
    'ISA*00*          *00*          *ZZ*SUBMITTERID    *ZZ*VANTAUM        *260709*0930*^*00501*000000905*0*P*:',
    'GS*HI*SUBMITTERID*VANTAUM*20260709*0930*1*X*005010X217',
    'ST*278*0001*005010X217',
    `BHT*0007*13*${trace}*20260709*0930`,
    'HL*1**20*1',
    'NM1*X3*2*ACME HEALTH PLAN*****PI*12345',
    'HL*2*1*21*1',
    'NM1*1P*1*ORTHO*JANE****XX*1234567893',
    'HL*3*2*22*1',
    'NM1*IL*1*DOE*JOHN****MI*MBR00012345',
    'DMG*D8*19640712*M',
    'HL*4*3*EV*0',
    `TRN*1*${trace}*9012345678`,
    `UM*HS*I*2*21:B**${um06}`,
    'DTP*472*D8*20260801',
    'HI*ABK:M1711',
    'SV1*HC:27447*12000*UN*1',
    'SE*16*0001',
    'GE*1*1',
    'IEA*1*000000905',
  ].join('~') + '~';
}

describe('tokenizeX12', () => {
  it('derives element/component/segment delimiters from the ISA', () => {
    const tok = tokenizeX12(sample278());
    expect(tok.ok).toBe(true);
    expect(tok.value?.delimiters).toMatchObject({ element: '*', component: ':', segment: '~', repetition: '^' });
    expect(tok.value?.isa[12]).toContain('000000905');
  });

  it('handles non-default delimiters (| element, > component)', () => {
    const alt = sample278().replace(/\*/g, '|').replace(/:/g, '>').replace(/\^/g, '!');
    const tok = tokenizeX12(alt);
    expect(tok.ok).toBe(true);
    expect(tok.value?.delimiters).toMatchObject({ element: '|', component: '>', segment: '~' });
  });

  it('rejects non-ISA input and truncated ISA', () => {
    expect(tokenizeX12('GS*HI*X~').ok).toBe(false);
    expect(tokenizeX12('ISA*00*XX~').ok).toBe(false);
  });
});

describe('parse278ToCanonical', () => {
  it('maps the full request to the canonical case', () => {
    const res = parse278ToCanonical(sample278());
    expect(res.ok).toBe(true);
    const c = res.value!;
    expect(c.client_reference).toBe('REF-X12-000042');
    expect(c.trace).toBe('REF-X12-000042');
    expect(c.patient).toEqual({ name: 'JOHN DOE', dob: '1964-07-12', member_id: 'MBR00012345' });
    expect(c.procedure_codes).toEqual(['27447']);
    expect(c.diagnosis_codes).toEqual(['M17.11']); // undotted M1711 → normalized
    expect(c.requesting_provider).toEqual({ name: 'JANE ORTHO', npi: '1234567893' });
    expect(c.payer_name).toBe('ACME HEALTH PLAN');
    expect(c.priority).toBe('standard');
    expect(c.case_type).toBe('um');
    expect(c.review_type).toBe('prior_auth');
    expect(c.source_system).toBe('x12_278');
  });

  it('maps UM06 level of service to priority (U → urgent, 03 → expedited)', () => {
    expect(parse278ToCanonical(sample278({ um06: 'U' })).value?.priority).toBe('urgent');
    expect(parse278ToCanonical(sample278({ um06: '03' })).value?.priority).toBe('expedited');
  });

  it('rejects a short trace with a locator-only error (no patient values echoed)', () => {
    const res = parse278ToCanonical(sample278({ trace: 'SHORT' }));
    expect(res.ok).toBe(false);
    const flat = JSON.stringify(res.errors);
    expect(flat).toContain('TRN02');
    expect(flat).not.toContain('DOE'); // PHI rule: locators only
    expect(flat).not.toContain('MBR00012345');
  });

  it('rejects a non-278 transaction set', () => {
    const raw = sample278().replace('ST*278*0001', 'ST*270*0001');
    const res = parse278ToCanonical(raw);
    expect(res.ok).toBe(false);
    expect(res.errors?.[0].path).toBe('ST01');
  });

  it('requires at least one procedure code', () => {
    const raw = sample278().replace('SV1*HC:27447*12000*UN*1~', '');
    const res = parse278ToCanonical(raw);
    expect(res.ok).toBe(false);
    expect(JSON.stringify(res.errors)).toContain('SV1');
  });
});

describe('render278Response', () => {
  const NOW = new Date('2026-07-09T12:00:00Z');

  function renderFor(decision: 'approve' | 'deny' | 'pend' | null) {
    const tok = tokenizeX12(sample278());
    return render278Response({
      request: tok.value!,
      det: { case_id: 'case-1', client_reference: 'REF-X12-000042', decision, rationale_summary: null, decided_at: null },
      authorizationNumber: 'AUTH-2026-000777',
      trace: 'REF-X12-000042',
      now: NOW,
    });
  }

  it('renders a pended (A4) response with the auth number at intake time', () => {
    const out = renderFor(null);
    expect(out.startsWith('ISA*')).toBe(true);
    expect(out).toContain('BHT*0007*11*REF-X12-000042'); // 11 = response
    expect(out).toContain('HCR*A4*AUTH-2026-000777');
    expect(out).toContain('TRN*2*REF-X12-000042');
    expect(out).toContain('*005010X217');
  });

  it('maps decisions onto HCR action codes (A1 approve, A3 deny)', () => {
    expect(renderFor('approve')).toContain('HCR*A1*AUTH-2026-000777');
    expect(renderFor('deny')).toContain('HCR*A3*AUTH-2026-000777');
  });

  it('swaps sender/receiver and echoes the interchange control number', () => {
    const out = renderFor(null);
    const isa = out.split('~')[0].split('*');
    expect(isa[6].trim()).toBe('VANTAUM'); // request receiver → response sender
    expect(isa[8].trim()).toBe('SUBMITTERID'); // request sender → response receiver
    expect(isa[13]).toBe('000000905'); // control number echoed for correlation
  });

  it('SE01 counts ST..SE inclusive and the envelope round-trips through the tokenizer', () => {
    const out = renderFor(null);
    const segs = out.split('~').filter(Boolean);
    const stIdx = segs.findIndex((s) => s.startsWith('ST*'));
    const seIdx = segs.findIndex((s) => s.startsWith('SE*'));
    const declared = Number(segs[seIdx].split('*')[1]);
    expect(declared).toBe(seIdx - stIdx + 1);
    const tok = tokenizeX12(out);
    expect(tok.ok).toBe(true); // our own output must be parseable
  });
});
