/**
 * Contract template registry.
 *
 * Templates are declared in TypeScript modules under
 * lib/contracts/templates/ and registered here. The registry is the
 * single source of truth at build time. Database rows in
 * contract_templates are seeded from this registry (via a one-time
 * publish, not implemented in piece A); historical contracts continue
 * to render from the database body_md snapshot.
 */

import type { ContractTemplate } from './types';
import { MSA_WITH_BAA_V1 } from './templates/msa-with-baa-v1';

const TEMPLATES: ContractTemplate[] = [
  MSA_WITH_BAA_V1,
];

const BY_KEY = new Map<string, ContractTemplate>(
  TEMPLATES.map((t) => [`${t.slug}@${t.version}`, t]),
);

export function listTemplates(): ContractTemplate[] {
  return [...TEMPLATES];
}

export function getTemplate(slug: string, version: string): ContractTemplate | null {
  return BY_KEY.get(`${slug}@${version}`) ?? null;
}

export function getActiveTemplate(slug: string): ContractTemplate | null {
  // Phase 2.0: only one active version per slug. When v2 lands, this is
  // where the "which version is currently active" lookup happens.
  for (const t of TEMPLATES) {
    if (t.slug === slug) return t;
  }
  return null;
}
