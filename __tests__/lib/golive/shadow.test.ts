import { beforeEach, describe, expect, it } from 'vitest';
import { CaseSpineService, MemoryCaseSpineStore } from '@/lib/case-spine';
import { MemoryBillableEventLedger } from '@/lib/billing/events';
import {
  ClientConfigService,
  MemoryClientConfigStore,
  hasMemberOrProviderFinalSend,
} from '@/lib/client-config';
import { FanoutService } from '@/lib/fanout/service';
import { MemoryFanoutStore } from '@/lib/fanout/store';
import { resetCaseSpineService } from '@/lib/case-spine';
import { resetClientConfigService } from '@/lib/client-config';
import { MIN_SHADOW_PACK, SHADOW_PACK, resetMemoryGoLiveStore, runShadowPack } from '@/lib/golive';

const NOW = new Date('2026-09-18T19:00:00.000Z');
const CLIENT = '11111111-1111-1111-1111-111111111111';

describe('Phase 7.3 E2 shadow pack', () => {
  beforeEach(() => {
    resetCaseSpineService();
    resetClientConfigService();
    resetMemoryGoLiveStore();
  });

  it('has ≥10 live-shaped specs that require MD sign', () => {
    expect(SHADOW_PACK.length).toBeGreaterThanOrEqual(MIN_SHADOW_PACK);
    expect(SHADOW_PACK.every((s) => s.sign && s.shadow === true)).toBe(true);
  });

  it('MD signs every case and suppresses member/provider final send', async () => {
    const result = await runShadowPack({ actor: 'md_synth' });
    expect(result.count).toBeGreaterThanOrEqual(10);
    expect(result.passed).toBe(true);
    expect(result.shadow_mode).toBe(true);
    expect(result.signed).toBe(result.count);
    expect(result.member_provider_final_sends).toBe(0);
    expect(result.cases.every((c) => c.ok && c.signed && c.actual_state === 'fanout_complete')).toBe(true);
  });

  it('fan-out in shadow mode records skipped member/provider intents (never sent)', async () => {
    const store = new MemoryCaseSpineStore();
    const ledger = new MemoryBillableEventLedger();
    const spine = new CaseSpineService(store, () => NOW, ledger);
    const created = await spine.createCase({
      client_id: CLIENT,
      packet_storage_keys: ['s3://synth/packet/shadow.pdf'],
      intake: {
        external_id: 'e2-unit-shadow',
        member_ref: 'memb_synth_shadow_unit',
        requesting_provider: 'prov_synth_shadow_unit',
        service_or_rx: 'CPT-73721',
        place_of_service: 'office',
        urgency: 'standard',
        clinicals_pointer: 's3://synth/packet/shadow.pdf',
        received_at: NOW.toISOString(),
        benefit_type: 'medical',
      },
    });
    await spine.transitionCase(created.case.case_id, { to_state: 'intake_validated' });
    await spine.transitionCase(created.case.case_id, { to_state: 'routed' });
    await spine.attachBrief(created.case.case_id, { criteria_result: 'meet', enqueue_md: true });
    await spine.signDetermination(
      created.case.case_id,
      { determination: 'approve', rationale: 'Shadow unit sign.' },
      'md_synth',
    );

    const fanoutStore = new MemoryFanoutStore();
    const result = await new FanoutService({
      spine,
      ledger,
      store: fanoutStore,
      config: new ClientConfigService(new MemoryClientConfigStore()),
      now: () => NOW,
      shadowMode: true,
    }).processCase(created.case.case_id);

    expect(result.shadow_mode).toBe(true);
    const member = result.outbound_intents.filter((i) => i.channel === 'member');
    const provider = result.outbound_intents.filter((i) => i.channel === 'provider');
    expect(member.length).toBeGreaterThanOrEqual(1);
    expect(provider.length).toBeGreaterThanOrEqual(1);
    expect(member.every((i) => i.status === 'skipped' && i.final_send === false)).toBe(true);
    expect(provider.every((i) => i.status === 'skipped' && i.final_send === false)).toBe(true);
    expect(member.every((i) => i.reason === 'shadow_mode_no_final_send')).toBe(true);
    expect(hasMemberOrProviderFinalSend(result.outbound_intents)).toBe(false);
  });
});
