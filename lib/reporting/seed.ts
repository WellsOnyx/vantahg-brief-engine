/**
 * Synthetic pack for Phase 6 reports + CM + ops. Tokenized refs only.
 */

import { getCaseSpineService, type CanonicalCase } from '@/lib/case-spine';
import { seedSyntheticRoleViews } from '@/lib/views/seed';
import { SYNTHETIC_CLIENT_ID } from '@/lib/intake/constants';

const SEED_PREFIX = 'ext-synth-p6-';

const BASE = (suffix: string, receivedAt: string, type: 'prior_auth' | 'first_level_appeal' = 'prior_auth') => ({
  client_id: SYNTHETIC_CLIENT_ID,
  type,
  external_id: `${SEED_PREFIX}${suffix}`,
  packet_storage_keys: [`s3://synth/packet/p6-${suffix}.pdf`],
  intake: {
    external_id: `${SEED_PREFIX}${suffix}`,
    member_ref: `memb_synth_p6_${suffix}`,
    requesting_provider: `prov_synth_p6_${suffix}`,
    service_or_rx: `CPT-P6-${suffix.toUpperCase()}`,
    place_of_service: 'office' as const,
    urgency: 'standard' as const,
    clinicals_pointer: `s3://synth/packet/p6-${suffix}.pdf`,
    received_at: receivedAt,
    benefit_type: 'medical' as const,
  },
});

async function alreadySeeded(): Promise<boolean> {
  const all = await getCaseSpineService().listCases({ id: 'seed', role: 'superadmin' });
  return all.some((c) => (c.external_id || '').startsWith(SEED_PREFIX));
}

async function queueToMd(caseId: string, actor: string, criteria: 'meet' | 'fail' | 'gray' = 'meet') {
  const spine = getCaseSpineService();
  await spine.transitionCase(caseId, { to_state: 'intake_validated' }, actor);
  await spine.transitionCase(caseId, { to_state: 'routed' }, actor);
  await spine.attachBrief(caseId, { criteria_result: criteria, enqueue_md: true }, actor);
}

export async function seedSyntheticReports(actor = 'system'): Promise<{
  seeded: boolean;
  case_ids: string[];
}> {
  const phase5 = await seedSyntheticRoleViews(actor);
  if (await alreadySeeded()) {
    const all = await getCaseSpineService().listCases({ id: 'seed', role: 'superadmin' });
    return {
      seeded: false,
      case_ids: all
        .filter((c) => (c.external_id || '').startsWith(SEED_PREFIX) || (c.external_id || '').startsWith('ext-synth-p5-'))
        .map((c) => c.case_id),
    };
  }

  const spine = getCaseSpineService();
  const ids: string[] = [...phase5.case_ids];

  const deny = await spine.createCase(BASE('deny-flagged', '2026-09-16T10:00:00.000Z'), actor);
  await queueToMd(deny.case.case_id, actor, 'fail');
  await spine.signDetermination(
    deny.case.case_id,
    {
      determination: 'deny',
      rationale: 'Synthetic criteria not met — CM high_cost flag.',
      deny_reason_code: 'criteria_not_met',
      cm_flags: ['high_cost', 'deny_with_alternative'],
    },
    actor,
  );
  ids.push(deny.case.case_id);

  const unflagged = await spine.createCase(BASE('approve-clean', '2026-09-17T09:00:00.000Z'), actor);
  await queueToMd(unflagged.case.case_id, actor, 'meet');
  await spine.signDetermination(
    unflagged.case.case_id,
    { determination: 'approve', rationale: 'Synthetic unflagged approve — must stay out of CM feed.' },
    actor,
  );
  ids.push(unflagged.case.case_id);

  const pend = await spine.createCase(BASE('pend', '2026-09-17T14:00:00.000Z'), actor);
  await queueToMd(pend.case.case_id, actor, 'gray');
  await spine.signDetermination(
    pend.case.case_id,
    { determination: 'pend', rationale: 'Synthetic pend for outcomes mix.' },
    actor,
  );
  ids.push(pend.case.case_id);

  const partial = await spine.createCase(BASE('partial', '2026-09-18T08:00:00.000Z'), actor);
  await queueToMd(partial.case.case_id, actor, 'meet');
  await spine.signDetermination(
    partial.case.case_id,
    { determination: 'partial', rationale: 'Synthetic partial approval.' },
    actor,
  );
  ids.push(partial.case.case_id);

  const open = await spine.createCase(BASE('still-open', '2026-09-18T11:00:00.000Z'), actor);
  ids.push(open.case.case_id);

  return { seeded: true, case_ids: ids };
}

export function phase6SeedIds(cases: CanonicalCase[]): string[] {
  return cases
    .filter((c) => (c.external_id || '').startsWith(SEED_PREFIX))
    .map((c) => c.case_id);
}
