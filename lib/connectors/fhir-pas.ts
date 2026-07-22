import type { CanonicalCase, CanonicalDetermination, ConnectorResult } from '@/lib/connectors/types';
import type { CaseType, ReviewType, CasePriority } from '@/lib/types';

/**
 * FHIR rail — HL7 Da Vinci Prior-Authorization Support (PAS), pragmatic
 * R4 subset (docs/CONNECTOR_RAILS.md §FHIR).
 *
 * Inbound: the PAS request Bundle a payer/EHR POSTs to Claim/$submit —
 * a `collection` Bundle whose entries include a Claim plus the resources
 * it references (Patient, Coverage, Practitioner/Organization). We map to
 * the CanonicalCase and hand off to the shared ingest path; everything
 * downstream (ledger idempotency, dedup, brief queue, the wall) is the
 * same engine every channel uses.
 *
 * Outbound: the PAS ClaimResponse. On synchronous accept we return
 * `outcome: "queued"` (the decision comes later via webhook/polling —
 * that is the honest UM shape); once decided, renderClaimResponse maps
 * the determination onto PAS review-action codes (X12 306 HCR values,
 * which PAS reuses): A1 approved · A3 denied · A4 pended · A6 modified.
 *
 * Mapping notes (kept deliberately explicit — this file IS the profile):
 *   Claim.identifier[0].value      → client_reference (idempotency key)
 *   Claim.patient → Patient        → name / birthDate / member identifier
 *   Claim.item[].productOrService  → procedure_codes (CPT/HCPCS codings)
 *   Claim.diagnosis[]              → diagnosis_codes (ICD-10 codings)
 *   Claim.provider → Practitioner/Organization → requesting provider + NPI
 *   Claim.priority.coding[].code   → stat|urgent → 'expedited'/'urgent'
 *   Claim.supportingInfo[…text]    → clinical_summary
 *   Claim.insurer/Coverage payor   → payer_name
 *
 * PHI rule: mapping errors carry FHIR paths, never element values.
 */

// ── Minimal FHIR shapes (subset we read; unknown fields flow through untyped) ──

interface FhirCoding { system?: string; code?: string; display?: string }
interface FhirCodeableConcept { coding?: FhirCoding[]; text?: string }
interface FhirIdentifier { system?: string; value?: string }
interface FhirReference { reference?: string }

interface FhirResource {
  resourceType: string;
  id?: string;
  [k: string]: unknown;
}

interface FhirBundleEntry { fullUrl?: string; resource?: FhirResource }
export interface FhirBundle extends FhirResource {
  resourceType: 'Bundle';
  type?: string;
  entry?: FhirBundleEntry[];
}

const NPI_SYSTEM = 'http://hl7.org/fhir/sid/us-npi';

// ── Bundle resolution helpers ────────────────────────────────────────────

function entries(bundle: FhirBundle): FhirResource[] {
  return (bundle.entry ?? []).map((e) => e.resource).filter((r): r is FhirResource => !!r);
}

function findByType(bundle: FhirBundle, type: string): FhirResource | undefined {
  return entries(bundle).find((r) => r.resourceType === type);
}

/** Resolve `ResourceType/id` (or `urn:uuid:` fullUrl) references inside the bundle. */
function resolveRef(bundle: FhirBundle, ref: FhirReference | undefined): FhirResource | undefined {
  const target = ref?.reference;
  if (!target) return undefined;
  for (const e of bundle.entry ?? []) {
    if (!e.resource) continue;
    if (e.fullUrl === target) return e.resource;
    const local = `${e.resource.resourceType}/${e.resource.id}`;
    if (local === target) return e.resource;
  }
  return undefined;
}

function codings(cc: FhirCodeableConcept | undefined): FhirCoding[] {
  return cc?.coding ?? [];
}

// ── Inbound: Bundle → CanonicalCase ──────────────────────────────────────

const PRIORITY_MAP: Record<string, CasePriority> = {
  stat: 'expedited',
  urgent: 'urgent',
  asap: 'urgent',
  routine: 'standard',
  normal: 'standard',
  deferred: 'standard',
};

export function mapPasBundleToCanonical(bundle: FhirBundle): ConnectorResult<CanonicalCase> {
  const errors: Array<{ path: string; message: string }> = [];

  if (bundle?.resourceType !== 'Bundle') {
    return { ok: false, errors: [{ path: 'resourceType', message: 'expected a FHIR Bundle' }] };
  }
  const claim = findByType(bundle, 'Claim') as
    | (FhirResource & {
        identifier?: FhirIdentifier[];
        patient?: FhirReference;
        provider?: FhirReference;
        insurer?: FhirReference;
        priority?: FhirCodeableConcept;
        diagnosis?: Array<{ diagnosisCodeableConcept?: FhirCodeableConcept }>;
        item?: Array<{ productOrService?: FhirCodeableConcept }>;
        supportingInfo?: Array<{ valueString?: string; category?: FhirCodeableConcept }>;
      })
    | undefined;
  if (!claim) {
    return { ok: false, errors: [{ path: 'Bundle.entry', message: 'no Claim resource in bundle' }] };
  }

  // Idempotency reference — required by our contract, sanitized to the ledger charset.
  const rawRef = claim.identifier?.[0]?.value;
  const clientReference = rawRef ? String(rawRef).replace(/[^A-Za-z0-9._:-]/g, '-').slice(0, 128) : '';
  if (clientReference.length < 8) {
    errors.push({ path: 'Claim.identifier[0].value', message: 'required — 8+ chars; used as the retry-stable idempotency reference' });
  }

  // Patient
  const patient = resolveRef(bundle, claim.patient) as
    | (FhirResource & {
        name?: Array<{ family?: string; given?: string[]; text?: string }>;
        birthDate?: string;
        identifier?: FhirIdentifier[];
      })
    | undefined;
  const pname = patient?.name?.[0];
  const patientName = pname?.text || [pname?.given?.join(' '), pname?.family].filter(Boolean).join(' ').trim();
  if (!patientName) errors.push({ path: 'Patient.name', message: 'required' });
  const memberId = patient?.identifier?.[0]?.value;

  // Procedures (CPT/HCPCS)
  const procedureCodes = (claim.item ?? [])
    .flatMap((i) => codings(i.productOrService))
    .map((c) => c.code)
    .filter((c): c is string => !!c);
  if (procedureCodes.length === 0) {
    errors.push({ path: 'Claim.item[].productOrService', message: 'at least one procedure coding required' });
  }
  const procedureDisplay = (claim.item ?? [])
    .flatMap((i) => codings(i.productOrService))
    .map((c) => c.display)
    .find((d): d is string => !!d);

  // Diagnoses (ICD-10)
  const diagnosisCodes = (claim.diagnosis ?? [])
    .flatMap((d) => codings(d.diagnosisCodeableConcept))
    .map((c) => c.code)
    .filter((c): c is string => !!c);

  // Provider
  const providerRes = resolveRef(bundle, claim.provider) as
    | (FhirResource & { name?: Array<{ text?: string; family?: string; given?: string[] }> | string; identifier?: FhirIdentifier[] })
    | undefined;
  let providerName: string | undefined;
  if (typeof providerRes?.name === 'string') providerName = providerRes.name;
  else if (Array.isArray(providerRes?.name)) {
    const n = providerRes.name[0];
    providerName = n?.text || [n?.given?.join(' '), n?.family].filter(Boolean).join(' ').trim() || undefined;
  }
  const npi = providerRes?.identifier?.find((i) => i.system === NPI_SYSTEM)?.value ?? providerRes?.identifier?.[0]?.value;

  // Payer
  const insurer = resolveRef(bundle, claim.insurer) as (FhirResource & { name?: string }) | undefined;

  // Priority + clinical narrative
  const priorityCode = codings(claim.priority).map((c) => c.code).find(Boolean) ?? 'routine';
  const clinicalSummary = (claim.supportingInfo ?? [])
    .map((s) => s.valueString)
    .filter((v): v is string => !!v)
    .join('\n') || undefined;

  if (errors.length > 0) return { ok: false, errors };

  const canonical: CanonicalCase = {
    client_reference: clientReference,
    case_type: 'um' as CaseType,
    review_type: 'prior_auth' as ReviewType,
    priority: PRIORITY_MAP[priorityCode ?? 'routine'] ?? 'standard',
    patient: {
      name: patientName!,
      dob: patient?.birthDate,
      member_id: memberId,
    },
    procedure_codes: procedureCodes,
    diagnosis_codes: diagnosisCodes,
    procedure_description: procedureDisplay,
    clinical_summary: clinicalSummary,
    requesting_provider: providerName || npi ? { name: providerName, npi } : undefined,
    payer_name: insurer?.name,
    source_system: 'fhir_pas',
  };
  return { ok: true, value: canonical };
}

// ── Outbound: determination → PAS ClaimResponse ──────────────────────────

/** PAS reuses the X12 278 HCR review-action codes for item adjudication. */
const REVIEW_ACTION: Record<string, { code: string; display: string }> = {
  approve: { code: 'A1', display: 'Certified in total' },
  deny: { code: 'A3', display: 'Not certified' },
  pend: { code: 'A4', display: 'Pended' },
  partial_approve: { code: 'A6', display: 'Modified' },
  modify: { code: 'A6', display: 'Modified' },
  queued: { code: 'A4', display: 'Pended' },
};

export function renderClaimResponse(opts: {
  det: CanonicalDetermination;
  claimIdentifier: string;
  authorizationNumber?: string;
}): Record<string, unknown> {
  const action = REVIEW_ACTION[opts.det.decision ?? 'queued'] ?? REVIEW_ACTION.queued;
  return {
    resourceType: 'ClaimResponse',
    status: 'active',
    type: { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/claim-type', code: 'professional' }] },
    use: 'preauthorization',
    outcome: opts.det.decision ? 'complete' : 'queued',
    created: new Date().toISOString(),
    identifier: [{ value: opts.claimIdentifier }],
    ...(opts.authorizationNumber ? { preAuthRef: opts.authorizationNumber } : {}),
    extension: [
      {
        url: 'http://hl7.org/fhir/us/davinci-pas/StructureDefinition/extension-reviewAction',
        extension: [
          {
            url: 'code',
            valueCodeableConcept: {
              coding: [{ system: 'https://codesystem.x12.org/305', code: action.code, display: action.display }],
            },
          },
        ],
      },
    ],
    ...(opts.det.rationale_summary
      ? { disposition: opts.det.rationale_summary }
      : { disposition: opts.det.decision ? undefined : 'Accepted for utilization review; determination will follow.' }),
  };
}
