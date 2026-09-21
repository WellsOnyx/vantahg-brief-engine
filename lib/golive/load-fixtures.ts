/**
 * Load + validate the Phase 7.2 E1 synthetic fixture catalog.
 * Tokenized refs only — never live PHI.
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import catalogJson from '../../fixtures/golive/synthetic-e1.json';
import { AUTH_WORKFLOW_TYPES, type AuthWorkflowType } from '@/lib/case-spine';
import { SYNTHETIC_CLIENT_ID } from '@/lib/intake/constants';
import { MIN_SYNTHETIC_PACK, PACK_SCENARIOS, type PackCaseSpec, type PackScenario } from './types';

export const SYNTHETIC_E1_RELATIVE_PATH = 'fixtures/golive/synthetic-e1.json';

const FORBIDDEN_INTAKE_KEYS = [
  'patient_name',
  'first_name',
  'last_name',
  'dob',
  'date_of_birth',
  'ssn',
  'social_security',
  'mrn',
  'email',
  'phone',
  'address',
  'street',
];

const SSN_RE = /\b\d{3}-\d{2}-\d{4}\b/;
const BARE_DOB_RE = /\b(19|20)\d{2}-\d{2}-\d{2}\b/;
const MEMBER_REF_RE = /^memb_synth_[a-z0-9_]+$/;
const PROVIDER_REF_RE = /^prov_synth_[a-z0-9_]+$/;
const SYNTH_POINTER_RE = /^(s3:\/\/synth\/|fax:synth-)/;

export interface SyntheticE1Catalog {
  pack: string;
  version: number;
  phase: string;
  client_id: string;
  notes: string;
  cases: PackCaseSpec[];
}

export function resolveSyntheticE1Path(): string {
  const candidates = [
    join(process.cwd(), SYNTHETIC_E1_RELATIVE_PATH),
    join(dirname(fileURLToPath(import.meta.url)), '../../', SYNTHETIC_E1_RELATIVE_PATH),
  ];
  const found = candidates.find((p) => existsSync(p));
  if (!found) {
    throw new Error(`synthetic E1 catalog not found (looked in ${candidates.join(', ')})`);
  }
  return found;
}

function asWorkflowType(value: unknown): AuthWorkflowType {
  if (typeof value === 'string' && (AUTH_WORKFLOW_TYPES as readonly string[]).includes(value)) {
    return value as AuthWorkflowType;
  }
  return 'prior_auth';
}

function asScenario(value: unknown): PackScenario {
  if (typeof value === 'string' && (PACK_SCENARIOS as readonly string[]).includes(value)) {
    return value as PackScenario;
  }
  throw new Error(`invalid scenario: ${String(value)}`);
}

function assertNoPhiInIntake(id: string, intake: Record<string, unknown>): void {
  for (const key of Object.keys(intake)) {
    if (FORBIDDEN_INTAKE_KEYS.includes(key)) {
      throw new Error(`${id}: forbidden PHI key "${key}"`);
    }
  }

  const member = intake.member_ref;
  if (member != null && (typeof member !== 'string' || !MEMBER_REF_RE.test(member))) {
    throw new Error(`${id}: member_ref must be null or memb_synth_* (got ${String(member)})`);
  }

  const provider = intake.requesting_provider;
  if (provider != null && (typeof provider !== 'string' || !PROVIDER_REF_RE.test(provider))) {
    throw new Error(`${id}: requesting_provider must be null or prov_synth_*`);
  }

  const pointer = intake.clinicals_pointer;
  if (pointer != null && (typeof pointer !== 'string' || !SYNTH_POINTER_RE.test(pointer))) {
    throw new Error(`${id}: clinicals_pointer must be a synth storage key`);
  }

  for (const [key, value] of Object.entries(intake)) {
    if (typeof value !== 'string') continue;
    if (SSN_RE.test(value)) {
      throw new Error(`${id}: intake.${key} looks like an SSN`);
    }
    if (key !== 'received_at' && BARE_DOB_RE.test(value) && !value.includes('T')) {
      throw new Error(`${id}: intake.${key} looks like a date of birth`);
    }
  }
}

function mapCase(raw: unknown, index: number): PackCaseSpec {
  if (!raw || typeof raw !== 'object') {
    throw new Error(`cases[${index}] must be an object`);
  }
  const row = raw as Record<string, unknown>;
  const id = typeof row.id === 'string' ? row.id : '';
  if (!id) throw new Error(`cases[${index}] missing id`);
  if (!row.intake || typeof row.intake !== 'object') {
    throw new Error(`${id}: intake is required`);
  }
  const intake = row.intake as Record<string, unknown>;
  assertNoPhiInIntake(id, intake);

  const expectedRaw = (row.expected && typeof row.expected === 'object'
    ? (row.expected as Record<string, unknown>)
    : {}) as Record<string, unknown>;
  if (typeof expectedRaw.state !== 'string') {
    throw new Error(`${id}: expected.state is required`);
  }

  return {
    id,
    scenario: asScenario(row.scenario),
    label: typeof row.label === 'string' ? row.label : id,
    type: asWorkflowType(row.type),
    parent_external_id: typeof row.parent_external_id === 'string' ? row.parent_external_id : undefined,
    intake: {
      external_id: typeof intake.external_id === 'string' ? intake.external_id : id,
      member_ref: (intake.member_ref as string | null | undefined) ?? null,
      requesting_provider: (intake.requesting_provider as string | null | undefined) ?? null,
      service_or_rx: (intake.service_or_rx as string | null | undefined) ?? null,
      place_of_service: (intake.place_of_service as string | null | undefined) ?? null,
      urgency: (intake.urgency as PackCaseSpec['intake']['urgency']) ?? null,
      clinicals_pointer: (intake.clinicals_pointer as string | null | undefined) ?? null,
      benefit_type: (intake.benefit_type as PackCaseSpec['intake']['benefit_type']) ?? null,
    },
    source: (row.source as PackCaseSpec['source']) ?? 'spine',
    criteria: row.criteria as PackCaseSpec['criteria'],
    sign: row.sign === true,
    determination: row.determination as PackCaseSpec['determination'],
    expected: {
      state: expectedRaw.state as PackCaseSpec['expected']['state'],
      sla_clock: expectedRaw.sla_clock as PackCaseSpec['expected']['sla_clock'],
      criteria_result: expectedRaw.criteria_result as PackCaseSpec['expected']['criteria_result'],
      type: expectedRaw.type ? asWorkflowType(expectedRaw.type) : asWorkflowType(row.type),
    },
  };
}

export function validateSyntheticE1Catalog(raw: unknown): SyntheticE1Catalog {
  if (!raw || typeof raw !== 'object') {
    throw new Error('synthetic E1 catalog must be an object');
  }
  const doc = raw as Record<string, unknown>;
  if (!Array.isArray(doc.cases)) {
    throw new Error('synthetic E1 catalog.cases must be an array');
  }
  const cases = doc.cases.map(mapCase);
  if (cases.length < MIN_SYNTHETIC_PACK) {
    throw new Error(`synthetic E1 catalog needs ≥${MIN_SYNTHETIC_PACK} cases (got ${cases.length})`);
  }
  const ids = new Set<string>();
  for (const spec of cases) {
    if (ids.has(spec.id)) throw new Error(`duplicate fixture id ${spec.id}`);
    ids.add(spec.id);
  }
  for (const spec of cases) {
    if (spec.parent_external_id && !ids.has(spec.parent_external_id)) {
      throw new Error(`${spec.id}: parent_external_id ${spec.parent_external_id} is not in the pack`);
    }
  }
  return {
    pack: typeof doc.pack === 'string' ? doc.pack : 'e1-synthetic',
    version: typeof doc.version === 'number' ? doc.version : 1,
    phase: typeof doc.phase === 'string' ? doc.phase : '7.2',
    client_id: typeof doc.client_id === 'string' ? doc.client_id : SYNTHETIC_CLIENT_ID,
    notes: typeof doc.notes === 'string' ? doc.notes : '',
    cases,
  };
}

/** Bundled catalog (safe for Next.js / API routes). */
export function loadSyntheticE1Catalog(): SyntheticE1Catalog {
  return validateSyntheticE1Catalog(catalogJson);
}

/** Disk re-read for the operator script — same file, same validation. */
export function loadSyntheticE1CatalogFromDisk(path = resolveSyntheticE1Path()): SyntheticE1Catalog {
  const parsed = JSON.parse(readFileSync(path, 'utf8')) as unknown;
  return validateSyntheticE1Catalog(parsed);
}

export function loadSyntheticE1Pack(): readonly PackCaseSpec[] {
  return loadSyntheticE1Catalog().cases;
}
