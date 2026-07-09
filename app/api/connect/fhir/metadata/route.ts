import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * FHIR CapabilityStatement — the first thing a Da Vinci PAS client fetches
 * from a server base. Declares exactly what this base supports: the Claim
 * `$submit` operation. Static, no PHI, no auth (per FHIR convention the
 * capability statement is publicly readable).
 */
export async function GET() {
  return NextResponse.json(
    {
      resourceType: 'CapabilityStatement',
      status: 'active',
      date: '2026-07-09',
      kind: 'instance',
      fhirVersion: '4.0.1',
      format: ['application/fhir+json'],
      implementation: {
        description: 'VantaUM prior-authorization intake — Da Vinci PAS subset (Claim/$submit inbound; determinations delivered via partner webhook / polling).',
      },
      instantiates: ['http://hl7.org/fhir/us/davinci-pas/CapabilityStatement/intermediary'],
      rest: [
        {
          mode: 'server',
          security: { description: 'X-API-Key header (VantaUM partner key, scope: submit).' },
          resource: [
            {
              type: 'Claim',
              operation: [
                {
                  name: 'submit',
                  definition: 'http://hl7.org/fhir/us/davinci-pas/OperationDefinition/Claim-submit',
                },
              ],
            },
          ],
        },
      ],
    },
    { headers: { 'content-type': 'application/fhir+json' } },
  );
}
