/**
 * Run E1 synthetic / E2 shadow packs against case-spine + intake ingest.
 * Synthetic tokenized refs only. No live PHI. No invented vendor keys.
 */

import { getCaseSpineService, type CaseSpineService, type CanonicalCase } from '@/lib/case-spine';
import {
  getClientConfigService,
  hasMemberOrProviderFinalSend,
  isShadowMode,
  type ClientConfigService,
} from '@/lib/client-config';
import { FanoutService } from '@/lib/fanout/service';
import { MemoryFanoutStore } from '@/lib/fanout/store';
import { ingestToCaseSpine, type IntakeSource } from '@/lib/intake/spine-ingest';
import { SYNTHETIC_CLIENT_ID } from '@/lib/intake/constants';
import { MIN_SHADOW_PACK, MIN_SYNTHETIC_PACK, SHADOW_PACK, SYNTHETIC_PACK } from './packs';
import { getMemoryGoLiveStore, type MemoryGoLiveStore } from './store';
import type { PackCaseResult, PackCaseSpec, PackRunResult } from './types';

export interface RunPackOptions {
  clientId?: string;
  actor?: string;
  spine?: CaseSpineService;
  config?: ClientConfigService;
  store?: MemoryGoLiveStore;
  now?: () => Date;
  fanout?: boolean;
  forceShadow?: boolean;
}

async function createFromSpec(
  spec: PackCaseSpec,
  clientId: string,
  actor: string,
  spine: CaseSpineService,
  useIntakeIngest: boolean,
): Promise<{ case: CanonicalCase; via: 'case-spine' | 'intake' }> {
  const receivedAt = new Date().toISOString();
  const payload = { ...spec.intake, received_at: receivedAt };

  if (useIntakeIngest && spec.source && spec.source !== 'spine') {
    const ingested = await ingestToCaseSpine({
      source: spec.source as IntakeSource,
      client_id: clientId,
      intake: payload,
      actor,
      packet_storage_keys: payload.clinicals_pointer ? [payload.clinicals_pointer] : [],
    });
    return { case: ingested.case, via: 'intake' };
  }

  const created = await spine.createCase(
    {
      client_id: clientId,
      external_id: spec.intake.external_id,
      priority: spec.intake.urgency ?? 'standard',
      packet_storage_keys: payload.clinicals_pointer ? [payload.clinicals_pointer] : [],
      intake: payload,
    },
    actor,
  );
  return { case: created.case, via: 'case-spine' };
}

async function advanceHappyOrGray(
  spine: CaseSpineService,
  caseId: string,
  spec: PackCaseSpec,
  actor: string,
): Promise<CanonicalCase> {
  let current = await spine.getCase(caseId);
  if (current.state === 'received') {
    current = (await spine.transitionCase(caseId, { to_state: 'intake_validated', note: 'E pack validate' }, actor))
      .case;
  }
  if (current.state === 'intake_validated') {
    current = (await spine.transitionCase(caseId, { to_state: 'routed', note: 'E pack route' }, actor)).case;
  }
  if (current.state === 'routed' || current.state === 'briefing') {
    const attached = await spine.attachBrief(
      caseId,
      { criteria_result: spec.criteria ?? 'meet', enqueue_md: true },
      actor,
    );
    current = attached.case;
  }
  if (spec.sign && current.state === 'md_queue') {
    const signed = await spine.signDetermination(
      caseId,
      {
        determination: spec.determination ?? 'approve',
        rationale: `Synthetic ${spec.id} MD sign — no live PHI.`,
      },
      actor,
    );
    current = signed.case;
  }
  return current;
}

function assertSpec(spec: PackCaseSpec, current: CanonicalCase | null, via: PackCaseResult['via']): PackCaseResult {
  if (!current) {
    return {
      spec_id: spec.id,
      scenario: spec.scenario,
      case_id: null,
      ok: false,
      expected_state: spec.expected.state,
      actual_state: null,
      sla_clock: null,
      criteria_result: null,
      signed: false,
      error: 'case_missing',
      via,
    };
  }
  const stateOk = current.state === spec.expected.state;
  const clockOk = !spec.expected.sla_clock || current.sla_clock === spec.expected.sla_clock;
  const signed = Boolean(current.signer_id && current.determination);
  return {
    spec_id: spec.id,
    scenario: spec.scenario,
    case_id: current.case_id,
    ok: stateOk && clockOk,
    expected_state: spec.expected.state,
    actual_state: current.state,
    sla_clock: current.sla_clock,
    criteria_result: spec.expected.criteria_result ?? null,
    signed,
    error: stateOk && clockOk ? null : `expected ${spec.expected.state} got ${current.state}`,
    via,
  };
}

async function runPack(
  pack: 'synthetic' | 'shadow',
  specs: readonly PackCaseSpec[],
  opts: RunPackOptions = {},
): Promise<PackRunResult> {
  const clientId = opts.clientId ?? SYNTHETIC_CLIENT_ID;
  const actor = opts.actor ?? 'ops:golive';
  const spine = opts.spine ?? getCaseSpineService();
  const config = opts.config ?? getClientConfigService();
  const store = opts.store ?? getMemoryGoLiveStore();
  const now = opts.now ?? (() => new Date());
  const cfg = await config.getLatest(clientId);
  const shadow = opts.forceShadow === true || isShadowMode(cfg?.config);
  const min = pack === 'synthetic' ? MIN_SYNTHETIC_PACK : MIN_SHADOW_PACK;

  const results: PackCaseResult[] = [];
  const fanoutStore = new MemoryFanoutStore();
  const fanout = new FanoutService({
    spine,
    config,
    store: fanoutStore,
    now,
    shadowMode: shadow,
  });

  for (const spec of specs) {
    try {
      const created = await createFromSpec(spec, clientId, actor, spine, !opts.spine);
      let current = created.case;
      if (spec.scenario !== 'missing_clinicals') {
        current = await advanceHappyOrGray(spine, current.case_id, spec, actor);
      }
      if (opts.fanout && current.state === 'determined') {
        await fanout.processCase(current.case_id, actor);
        current = await spine.getCase(current.case_id);
      }
      const brief = await spine.getBrief(current.case_id);
      const row = assertSpec(spec, current, created.via);
      if (spec.expected.criteria_result && brief && brief.criteria_result !== spec.expected.criteria_result) {
        row.ok = false;
        row.error = `expected criteria ${spec.expected.criteria_result} got ${brief.criteria_result}`;
      }
      if (brief) row.criteria_result = brief.criteria_result;
      results.push(row);
    } catch (err) {
      results.push({
        spec_id: spec.id,
        scenario: spec.scenario,
        case_id: null,
        ok: false,
        expected_state: spec.expected.state,
        actual_state: null,
        sla_clock: null,
        criteria_result: null,
        signed: false,
        error: err instanceof Error ? err.message : 'pack_case_failed',
        via: spec.source && spec.source !== 'spine' ? 'intake' : 'case-spine',
      });
    }
  }

  const intents = (
    await Promise.all(results.filter((r) => r.case_id).map((r) => fanoutStore.listIntents(r.case_id!)))
  ).flat();
  const memberProviderFinal = hasMemberOrProviderFinalSend(intents) ? 1 : 0;

  const run: PackRunResult = {
    pack,
    client_id: clientId,
    passed: results.length >= min && results.every((r) => r.ok) && (pack !== 'shadow' || memberProviderFinal === 0),
    count: results.length,
    required: min,
    happy_path: results.filter((r) => r.scenario === 'happy_path').length,
    missing_clinicals: results.filter((r) => r.scenario === 'missing_clinicals').length,
    gray_zone: results.filter((r) => r.scenario === 'gray_zone').length,
    signed: results.filter((r) => r.signed).length,
    cases: results,
    shadow_mode: shadow,
    member_provider_final_sends: memberProviderFinal,
    ran_at: now().toISOString(),
  };

  store.recordPack(run);
  store.appendLog({
    client_id: clientId,
    at: run.ran_at,
    actor,
    kind: pack === 'shadow' ? 'shadow' : 'pack',
    message: `${pack} pack ${run.passed ? 'passed' : 'failed'} (${run.count} cases, signed=${run.signed})`,
    payload: {
      passed: run.passed,
      count: run.count,
      shadow_mode: run.shadow_mode,
      member_provider_final_sends: run.member_provider_final_sends,
    },
  });
  if (pack === 'synthetic' && run.passed) {
    store.markHypercare(clientId, ['hc-10', 'hc-03']);
  }
  if (pack === 'shadow' && run.passed) {
    store.markHypercare(clientId, ['hc-16']);
  }
  return run;
}

export async function runSyntheticPack(opts: RunPackOptions = {}): Promise<PackRunResult> {
  return runPack('synthetic', SYNTHETIC_PACK, { ...opts, fanout: opts.fanout ?? false });
}

export async function runShadowPack(opts: RunPackOptions = {}): Promise<PackRunResult> {
  return runPack('shadow', SHADOW_PACK, { ...opts, fanout: true, forceShadow: true });
}
