/**
 * Synthetic pack for the three role lenses. Tokenized refs only.
 */

import { getMemoryBillableEventLedger } from '@/lib/billing/events';
import { generateMonthlyStatement, getMemoryStatementStore } from '@/lib/billing/statement';
import { getCaseSpineService, type CanonicalCase } from '@/lib/case-spine';
import { createCxNote, getMemoryCxNoteStore } from '@/lib/cx';
import { getMemoryFanoutStore } from '@/lib/fanout/store';
import { OTHER_SYNTHETIC_CLIENT_ID, SYNTHETIC_CLIENT_ID } from '@/lib/intake/constants';

const SEED_PREFIX = 'ext-synth-p5-';

const COMPLETE = (suffix: string, clientId = SYNTHETIC_CLIENT_ID) => ({
  client_id: clientId,
  external_id: `${SEED_PREFIX}${suffix}`,
  packet_storage_keys: [`s3://synth/packet/p5-${suffix}.pdf`],
  intake: {
    external_id: `${SEED_PREFIX}${suffix}`,
    member_ref: `memb_synth_p5_${suffix}`,
    requesting_provider: `prov_synth_p5_${suffix}`,
    service_or_rx: `CPT-P5-${suffix.toUpperCase()}`,
    place_of_service: 'office' as const,
    urgency: 'standard' as const,
    clinicals_pointer: `s3://synth/packet/p5-${suffix}.pdf`,
    received_at: '2026-09-18T12:00:00.000Z',
    benefit_type: 'medical' as const,
  },
});

async function alreadySeeded(): Promise<boolean> {
  const all = await getCaseSpineService().listCases({ id: 'seed', role: 'superadmin' });
  return all.some((c) => (c.external_id || '').startsWith(SEED_PREFIX));
}

async function queueAndSign(caseId: string, actor: string, rationale: string): Promise<CanonicalCase> {
  const spine = getCaseSpineService();
  await spine.transitionCase(caseId, { to_state: 'intake_validated' }, actor);
  await spine.transitionCase(caseId, { to_state: 'routed' }, actor);
  await spine.attachBrief(caseId, { criteria_result: 'meet', enqueue_md: true }, actor);
  const signed = await spine.signDetermination(
    caseId,
    { determination: 'approve', rationale },
    actor,
  );
  return signed.case;
}

export async function seedSyntheticRoleViews(actor = 'system'): Promise<{
  seeded: boolean;
  case_ids: string[];
}> {
  if (await alreadySeeded()) {
    const all = await getCaseSpineService().listCases({ id: 'seed', role: 'superadmin' });
    return {
      seeded: false,
      case_ids: all.filter((c) => (c.external_id || '').startsWith(SEED_PREFIX)).map((c) => c.case_id),
    };
  }

  const spine = getCaseSpineService();
  const ids: string[] = [];

  const stuck = await spine.createCase(
    {
      client_id: SYNTHETIC_CLIENT_ID,
      external_id: `${SEED_PREFIX}stuck`,
      intake: { member_ref: 'memb_synth_p5_stuck', benefit_type: 'medical', external_id: `${SEED_PREFIX}stuck` },
    },
    actor,
  );
  ids.push(stuck.case.case_id);

  const open = await spine.createCase(COMPLETE('open'), actor);
  ids.push(open.case.case_id);

  const sla = await spine.createCase(COMPLETE('sla-missed'), actor);
  await spine.transitionCase(sla.case.case_id, { to_state: 'intake_validated' }, actor);
  await spine.transitionCase(sla.case.case_id, { to_state: 'routed' }, actor);
  await spine.attachBrief(sla.case.case_id, { criteria_result: 'gray', enqueue_md: true }, actor);
  await spine.evaluateCase(sla.case.case_id, { sla_elapsed_ratio: 1.05 }, actor);
  ids.push(sla.case.case_id);

  const decided = await spine.createCase(COMPLETE('decided'), actor);
  await queueAndSign(decided.case.case_id, actor, 'Synthetic Phase 5 client-lens decision.');
  ids.push(decided.case.case_id);

  const fanout = await spine.createCase(COMPLETE('fanout-fail'), actor);
  const signedFanout = await queueAndSign(fanout.case.case_id, actor, 'Synthetic fan-out failure fixture.');
  await spine.transitionCase(signedFanout.case_id, { to_state: 'fanout_pending', fanout_status: 'pending' }, actor);
  await spine.transitionCase(signedFanout.case_id, { to_state: 'fanout_failed', fanout_status: 'failed' }, actor);
  const failed = await spine.applyOpsPatch(signedFanout.case_id, {
    fanout_status: 'failed',
    open_tasks: [...signedFanout.open_tasks, 'resolve_fanout'],
  });
  await getMemoryFanoutStore().insertCxTask({
    task_id: `cx-task-p5-${failed.case_id.slice(0, 8)}`,
    case_id: failed.case_id,
    client_id: SYNTHETIC_CLIENT_ID,
    kind: 'resolve_fanout',
    status: 'open',
    created_at: new Date().toISOString(),
    note: 'Synthetic webhook exhausted — CX resolve_fanout',
  });
  ids.push(failed.case_id);

  const appeal = await spine.createCase(
    {
      ...COMPLETE('appeal'),
      type: 'first_level_appeal',
      parent_case_id: decided.case.case_id,
    },
    actor,
  );
  ids.push(appeal.case.case_id);

  const other = await spine.createCase(COMPLETE('other-tenant', OTHER_SYNTHETIC_CLIENT_ID), actor);
  ids.push(other.case.case_id);

  const notes = getMemoryCxNoteStore();
  await notes.insert(
    createCxNote({
      client_id: SYNTHETIC_CLIENT_ID,
      case_id: null,
      kind: 'gift',
      body: 'Send welcome fruit basket to TPA ops lead (no PHI).',
      created_by: actor,
    }),
  );
  await notes.insert(
    createCxNote({
      client_id: SYNTHETIC_CLIENT_ID,
      case_id: null,
      kind: 'scheduling',
      body: 'Weekly hypercare standup Tues 10:00 ET.',
      created_by: actor,
    }),
  );
  await notes.insert(
    createCxNote({
      client_id: SYNTHETIC_CLIENT_ID,
      case_id: failed.case_id,
      kind: 'commitment',
      body: 'Chase resolve_fanout before Thursday check-in.',
      created_by: actor,
    }),
  );

  await generateMonthlyStatement(getMemoryBillableEventLedger(), getMemoryStatementStore(), {
    client_id: SYNTHETIC_CLIENT_ID,
    client_name: 'Synthetic Staging TPA',
  });

  return { seeded: true, case_ids: ids };
}
