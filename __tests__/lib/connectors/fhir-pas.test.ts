import { describe, it, expect } from 'vitest';
import { mapPasBundleToCanonical, renderClaimResponse, type FhirBundle } from '@/lib/connectors/fhir-pas';

/**
 * FHIR PAS rail: Bundle → CanonicalCase mapping (reference resolution,
 * identifier sanitization, priority mapping, PHI-free path-only errors)
 * and determination → ClaimResponse rendering (review-action codes,
 * preAuthRef, queued vs complete outcome).
 */

function sampleBundle(overrides: {
  identifier?: string;
  priority?: string;
  dropPatientName?: boolean;
  dropItems?: boolean;
} = {}): FhirBundle {
  return {
    resourceType: 'Bundle',
    type: 'collection',
    entry: [
      {
        fullUrl: 'urn:uuid:claim-1',
        resource: {
          resourceType: 'Claim',
          id: 'claim-1',
          identifier: [{ system: 'https://ehr.example.org/pa-request', value: overrides.identifier ?? 'PAS-REQ-2026-0001' }],
          status: 'active',
          use: 'preauthorization',
          patient: { reference: 'Patient/pat-1' },
          provider: { reference: 'Practitioner/prac-1' },
          insurer: { reference: 'Organization/payer-1' },
          priority: { coding: [{ code: overrides.priority ?? 'routine' }] },
          diagnosis: [
            { diagnosisCodeableConcept: { coding: [{ system: 'http://hl7.org/fhir/sid/icd-10-cm', code: 'M17.11' }] } },
          ],
          item: overrides.dropItems
            ? []
            : [
                {
                  productOrService: {
                    coding: [{ system: 'http://www.ama-assn.org/go/cpt', code: '27447', display: 'Total knee arthroplasty' }],
                  },
                },
              ],
          supportingInfo: [{ valueString: 'Failed 12 weeks conservative therapy; KL grade 4.' }],
        },
      },
      {
        fullUrl: 'urn:uuid:pat-1',
        resource: {
          resourceType: 'Patient',
          id: 'pat-1',
          name: [{ ...(overrides.dropPatientName ? {} : { family: 'Doe', given: ['John'] }) }],
          birthDate: '1964-07-12',
          identifier: [{ system: 'https://acme-plan.example.org/member', value: 'MBR00012345' }],
        },
      },
      {
        fullUrl: 'urn:uuid:prac-1',
        resource: {
          resourceType: 'Practitioner',
          id: 'prac-1',
          name: [{ family: 'Ortho', given: ['Jane'] }],
          identifier: [{ system: 'http://hl7.org/fhir/sid/us-npi', value: '1234567893' }],
        },
      },
      {
        fullUrl: 'urn:uuid:payer-1',
        resource: { resourceType: 'Organization', id: 'payer-1', name: 'Acme Health Plan' },
      },
    ],
  };
}

describe('mapPasBundleToCanonical', () => {
  it('maps a full PAS bundle to the canonical case', () => {
    const res = mapPasBundleToCanonical(sampleBundle());
    expect(res.ok).toBe(true);
    const c = res.value!;
    expect(c.client_reference).toBe('PAS-REQ-2026-0001');
    expect(c.patient).toEqual({ name: 'John Doe', dob: '1964-07-12', member_id: 'MBR00012345' });
    expect(c.procedure_codes).toEqual(['27447']);
    expect(c.procedure_description).toBe('Total knee arthroplasty');
    expect(c.diagnosis_codes).toEqual(['M17.11']);
    expect(c.requesting_provider).toEqual({ name: 'Jane Ortho', npi: '1234567893' });
    expect(c.payer_name).toBe('Acme Health Plan');
    expect(c.priority).toBe('standard');
    expect(c.clinical_summary).toContain('conservative therapy');
    expect(c.source_system).toBe('fhir_pas');
  });

  it('resolves references by Type/id when fullUrl does not match', () => {
    const bundle = sampleBundle();
    for (const e of bundle.entry!) delete e.fullUrl; // force Type/id resolution
    const res = mapPasBundleToCanonical(bundle);
    expect(res.ok).toBe(true);
    expect(res.value?.patient.name).toBe('John Doe');
  });

  it('maps stat → expedited and urgent → urgent', () => {
    expect(mapPasBundleToCanonical(sampleBundle({ priority: 'stat' })).value?.priority).toBe('expedited');
    expect(mapPasBundleToCanonical(sampleBundle({ priority: 'urgent' })).value?.priority).toBe('urgent');
  });

  it('sanitizes the claim identifier to the ledger charset', () => {
    const res = mapPasBundleToCanonical(sampleBundle({ identifier: 'PAS REQ/2026#0001' }));
    expect(res.ok).toBe(true);
    expect(res.value?.client_reference).toBe('PAS-REQ-2026-0001');
  });

  it('rejects a missing/short identifier with a path-only error', () => {
    const res = mapPasBundleToCanonical(sampleBundle({ identifier: 'x' }));
    expect(res.ok).toBe(false);
    expect(res.errors?.[0].path).toBe('Claim.identifier[0].value');
  });

  it('collects all errors without echoing patient values (PHI rule)', () => {
    const res = mapPasBundleToCanonical(sampleBundle({ dropPatientName: true, dropItems: true }));
    expect(res.ok).toBe(false);
    const paths = res.errors!.map((e) => e.path);
    expect(paths).toContain('Patient.name');
    expect(paths).toContain('Claim.item[].productOrService');
    expect(JSON.stringify(res.errors)).not.toContain('MBR00012345');
    expect(JSON.stringify(res.errors)).not.toContain('1964');
  });

  it('rejects a non-Bundle and a bundle without a Claim', () => {
    expect(mapPasBundleToCanonical({ resourceType: 'Claim' } as never).ok).toBe(false);
    const res = mapPasBundleToCanonical({ resourceType: 'Bundle', entry: [] });
    expect(res.ok).toBe(false);
    expect(res.errors?.[0].path).toBe('Bundle.entry');
  });
});

describe('renderClaimResponse', () => {
  const base = {
    case_id: 'case-1',
    client_reference: 'PAS-REQ-2026-0001',
    rationale_summary: null,
    decided_at: null,
  };

  it('renders queued/pended (A4) with preAuthRef at intake time', () => {
    const out = renderClaimResponse({
      det: { ...base, decision: null },
      claimIdentifier: 'PAS-REQ-2026-0001',
      authorizationNumber: 'AUTH-2026-000777',
    });
    expect(out.resourceType).toBe('ClaimResponse');
    expect(out.use).toBe('preauthorization');
    expect(out.outcome).toBe('queued');
    expect(out.preAuthRef).toBe('AUTH-2026-000777');
    expect(JSON.stringify(out)).toContain('"code":"A4"');
    expect((out.identifier as Array<{ value: string }>)[0].value).toBe('PAS-REQ-2026-0001');
  });

  it('maps decisions to X12 306 review-action codes', () => {
    const codeFor = (decision: 'approve' | 'deny' | 'modify') =>
      JSON.stringify(renderClaimResponse({
        det: { ...base, decision, rationale_summary: 'r' },
        claimIdentifier: 'PAS-REQ-2026-0001',
      }));
    expect(codeFor('approve')).toContain('"code":"A1"');
    expect(codeFor('deny')).toContain('"code":"A3"');
    expect(codeFor('modify')).toContain('"code":"A6"');
  });

  it('is outcome complete with the rationale as disposition once decided', () => {
    const out = renderClaimResponse({
      det: { ...base, decision: 'approve', rationale_summary: 'Meets InterQual criteria.' },
      claimIdentifier: 'PAS-REQ-2026-0001',
      authorizationNumber: 'AUTH-2026-000777',
    });
    expect(out.outcome).toBe('complete');
    expect(out.disposition).toBe('Meets InterQual criteria.');
  });
});
