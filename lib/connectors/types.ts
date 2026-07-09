/**
 * Connector framework — the transport layer above the Partner API v1.
 *
 * The insight that makes "integrate with the top 20 EHRs and adjudication
 * platforms" tractable: we do NOT build 20 integrations. We built ONE
 * canonical case contract (docs/PARTNER_API.md — the internal shape every
 * case takes). A connector's only job is to translate a specific external
 * system's dialect ↔ that canonical shape, over one of four transport
 * rails. New system = a mapping profile + (rarely) a new rail, never a new
 * pipeline.
 *
 * Four rails cover essentially the entire market:
 *   - rest_json   — our native Partner API (any system that can POST)
 *   - fhir_pas    — HL7 FHIR Da Vinci Prior-Auth Support (Claim/$submit,
 *                   ClaimResponse) — the CMS-0057 mandated shape every
 *                   major payer must expose by the compliance deadline
 *   - x12_278     — ASC X12N 278 request/response (the EDI rail clearing-
 *                   houses and legacy adjudication engines speak)
 *   - sftp_batch  — scheduled flat-file / CSV / HL7v2 drops (the long tail
 *                   of older UM and claims systems)
 *
 * A ConnectorProfile binds a client tenant + external system to a rail and
 * a field MappingProfile. inbound() normalizes a raw external payload into
 * the CanonicalCase the engine already understands; outbound() renders a
 * determination back into the system's dialect. Everything downstream of
 * inbound() — dedup, brief, assignment, the wall — is unchanged.
 */

import type { CaseType, ReviewType, CasePriority } from '@/lib/types';

// ---------------------------------------------------------------------------
// Transport rails
// ---------------------------------------------------------------------------

export type TransportRail = 'rest_json' | 'fhir_pas' | 'x12_278' | 'sftp_batch';

/** Direction of a connector operation, for audit + capability declaration. */
export type ConnectorDirection = 'inbound' | 'outbound' | 'bidirectional';

// ---------------------------------------------------------------------------
// The canonical case — the ONE shape everything maps to/from.
// (Mirrors the Partner API submit contract; the engine's cases row is built
// from this.)
// ---------------------------------------------------------------------------

export interface CanonicalCase {
  /** Sender's stable reference (becomes cases.external_reference + idempotency key). */
  client_reference: string;
  case_type: CaseType;
  review_type: ReviewType;
  priority: CasePriority;
  patient: {
    name: string;
    dob?: string;
    member_id?: string;
  };
  procedure_codes: string[];
  diagnosis_codes?: string[];
  procedure_description?: string;
  clinical_summary?: string;
  requesting_provider?: { name?: string; npi?: string };
  facility?: { name?: string; type?: string };
  payer_name?: string;
  service_category?: string;
  turnaround_deadline?: string;
  document_urls?: string[];
  /** Raw source echo for audit + ambient-learning provenance (never re-exposed). */
  source_system?: string;
}

/** The determination as the engine produced it — the outbound() input. */
export interface CanonicalDetermination {
  case_id: string;
  client_reference: string | null;
  decision: 'approve' | 'deny' | 'partial_approve' | 'modify' | 'pend' | null;
  rationale_summary: string | null;
  decided_at: string | null;
  /** Criteria + codes cited, for systems that round-trip structured rationale. */
  cited_criteria?: string[];
}

// ---------------------------------------------------------------------------
// Mapping profile — per external system, how its fields ↔ canonical.
// ---------------------------------------------------------------------------

/**
 * A field mapping is intentionally declarative (JSON-serializable) so a new
 * system's profile can live in the DB / config, reviewed by an integration
 * engineer, without a code deploy. `path` is a dotted accessor into the
 * source payload; `transform` names a registered pure function
 * (see lib/connectors/transforms) applied after extraction.
 */
export interface FieldMapping {
  canonical: keyof CanonicalCase | string; // dotted canonical path, e.g. "patient.member_id"
  path: string; // dotted source path, e.g. "subscriber.memberId" or a FHIR/X12 locator
  transform?: string; // registered transform id, e.g. "icd10_normalize", "hl7_date"
  required?: boolean;
}

export interface MappingProfile {
  id: string;
  /** Human label, e.g. "Epic (Payer Platform) — Da Vinci PAS r4". */
  system_label: string;
  rail: TransportRail;
  /** Inbound field map (external → canonical). */
  inbound: FieldMapping[];
  /** Constant/default canonical fields when the source omits them. */
  defaults?: Partial<CanonicalCase>;
  /** Outbound rendering hints (e.g. FHIR ClaimResponse disposition codes). */
  outbound?: {
    decision_map?: Partial<Record<NonNullable<CanonicalDetermination['decision']>, string>>;
    template?: string; // registered outbound template id
  };
}

// ---------------------------------------------------------------------------
// Connector profile — binds a tenant + system + credentials to a mapping.
// ---------------------------------------------------------------------------

export interface ConnectorProfile {
  id: string;
  client_id: string; // tenant this connector belongs to
  system_key: string; // stable key into the system registry (see SYSTEM_REGISTRY)
  rail: TransportRail;
  direction: ConnectorDirection;
  mapping_profile_id: string;
  active: boolean;
  /** Rail-specific config (endpoint URLs, SFTP host, X12 ISA/GS ids) — secrets by ref, never inline. */
  config: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// The connector interface every rail adapter implements.
// ---------------------------------------------------------------------------

export interface ConnectorResult<T> {
  ok: boolean;
  value?: T;
  /** Field-path errors, never raw values (PHI-safe). */
  errors?: Array<{ path: string; message: string }>;
}

export interface Connector {
  rail: TransportRail;
  /** Translate a raw inbound payload from this system into the canonical case. */
  inbound(raw: unknown, profile: MappingProfile): ConnectorResult<CanonicalCase>;
  /** Render a determination back into this system's dialect for delivery. */
  outbound(det: CanonicalDetermination, profile: MappingProfile): ConnectorResult<unknown>;
}

// ---------------------------------------------------------------------------
// System registry — the top EHR + adjudication/UM platforms, each pinned to
// the rail we integrate it over. This is the "top 20" made explicit: note how
// few distinct rails it actually takes. `verify_status` is honest — 'live'
// means a tested profile exists; 'planned' means the rail is built and the
// profile is scoped but unproven against that vendor.
// ---------------------------------------------------------------------------

export interface RegisteredSystem {
  key: string;
  label: string;
  category: 'ehr' | 'adjudication' | 'um_platform' | 'clearinghouse';
  rail: TransportRail;
  verify_status: 'live' | 'planned';
  notes?: string;
}

export const SYSTEM_REGISTRY: RegisteredSystem[] = [
  // ---- EHRs (care-delivery origination) --------------------------------
  { key: 'epic', label: 'Epic', category: 'ehr', rail: 'fhir_pas', verify_status: 'planned', notes: 'Da Vinci PAS via Epic Payer Platform / App Orchard; FHIR R4.' },
  { key: 'oracle_cerner', label: 'Oracle Health (Cerner)', category: 'ehr', rail: 'fhir_pas', verify_status: 'planned', notes: 'Millennium FHIR R4 + Da Vinci PAS.' },
  { key: 'meditech', label: 'MEDITECH Expanse', category: 'ehr', rail: 'fhir_pas', verify_status: 'planned' },
  { key: 'athenahealth', label: 'athenahealth', category: 'ehr', rail: 'fhir_pas', verify_status: 'planned', notes: 'athenaOne FHIR APIs.' },
  { key: 'veradigm_allscripts', label: 'Veradigm (Allscripts)', category: 'ehr', rail: 'fhir_pas', verify_status: 'planned' },
  { key: 'nextgen', label: 'NextGen Healthcare', category: 'ehr', rail: 'fhir_pas', verify_status: 'planned' },
  { key: 'eclinicalworks', label: 'eClinicalWorks', category: 'ehr', rail: 'fhir_pas', verify_status: 'planned' },
  { key: 'greenway', label: 'Greenway Health', category: 'ehr', rail: 'sftp_batch', verify_status: 'planned' },
  { key: 'medhost', label: 'MEDHOST', category: 'ehr', rail: 'sftp_batch', verify_status: 'planned' },
  { key: 'pointclickcare', label: 'PointClickCare (PAC/LTC)', category: 'ehr', rail: 'fhir_pas', verify_status: 'planned' },

  // ---- Adjudication / core claims + UM platforms -----------------------
  { key: 'trizetto_facets', label: 'TriZetto Facets', category: 'adjudication', rail: 'x12_278', verify_status: 'planned', notes: 'X12 278 auth; Cognizant TriZetto.' },
  { key: 'trizetto_qnxt', label: 'TriZetto QNXT', category: 'adjudication', rail: 'x12_278', verify_status: 'planned' },
  { key: 'hrp_healthedge', label: 'HealthEdge HealthRules Payer', category: 'adjudication', rail: 'x12_278', verify_status: 'planned' },
  { key: 'ikasystems', label: 'HealthEdge GuidingCare (UM)', category: 'um_platform', rail: 'rest_json', verify_status: 'planned', notes: 'GuidingCare care/UM APIs.' },
  { key: 'plexis', label: 'PLEXIS Payer Platforms', category: 'adjudication', rail: 'x12_278', verify_status: 'planned' },
  { key: 'ebs_javelina', label: 'EBS / Javelina', category: 'adjudication', rail: 'x12_278', verify_status: 'planned' },
  { key: 'vba', label: 'VBA Software', category: 'adjudication', rail: 'sftp_batch', verify_status: 'planned' },
  { key: 'zelis', label: 'Zelis', category: 'clearinghouse', rail: 'x12_278', verify_status: 'planned' },
  { key: 'availity', label: 'Availity', category: 'clearinghouse', rail: 'x12_278', verify_status: 'planned', notes: 'Also exposes REST auth APIs.' },
  { key: 'change_healthcare', label: 'Change Healthcare / Optum (InterQual Connect)', category: 'clearinghouse', rail: 'x12_278', verify_status: 'planned', notes: 'X12 278 + InterQual Connect; our brief engine already speaks InterQual criteria.' },

  // ---- Always-available native rail ------------------------------------
  { key: 'vantaum_rest', label: 'VantaUM Partner API (native REST/JSON)', category: 'um_platform', rail: 'rest_json', verify_status: 'live', notes: 'docs/PARTNER_API.md — the hub every rail normalizes into.' },
];

export function systemsByRail(rail: TransportRail): RegisteredSystem[] {
  return SYSTEM_REGISTRY.filter((s) => s.rail === rail);
}
