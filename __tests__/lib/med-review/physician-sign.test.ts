import { describe, expect, it } from 'vitest';
import { CaseSpineService, MemoryCaseSpineStore } from '@/lib/case-spine';
import { MemoryBillableEventLedger } from '@/lib/billing/events';
import { ClientConfigService, MemoryClientConfigStore } from '@/lib/client-config';
import { FanoutService } from '@/lib/fanout/service';
import { MemoryFanoutStore } from '@/lib/fanout/store';
import type { WebhookTransport } from '@/lib/fanout/types';

const NOW = new Date('2026-10-21T15:00:00.000Z');
const CLIENT = '11111111-1111-4111-8111-111111111111';

async function queueCase() {
  const ledger = new MemoryBillableEventLedger();
  const spine = new CaseSpineService(new MemoryCaseSpineStore(), () => NOW, ledger);
  const created = await spine.createCase({
    client_id: CLIENT,
    priority: 'standard',
    packet_storage_keys: ['s3://synth/packet/mr.pdf'],
    intake: {
      external_id: 'ext-mr-loop',
      member_ref: 'memb_synth_loop',
      requesting_provider: 'prov_synth_loop',
      service_or_rx: 'CPT-93306',
      clinicals_pointer: 's3://synth/packet/mr.pdf',
      received_at: NOW.toISOString(),
      benefit_type: 'medical',
    },
  });
  await spine.transitionCase(created.case.case_id, { to_state: 'intake_validated' });
  await spine.transitionCase(created.case.case_id, { to_state: 'routed' });
  await spine.attachBrief(created.case.case_id, { criteria_result: 'meet', enqueue_md: true });
  return { spine, ledger, caseId: created.case.case_id };
}

describe('physician sign closes the loop', () => {
  it('refuses an AI approve', async () => {
    const { spine, caseId } = await queueCase();
    await expect(
      spine.signDetermination(
        caseId,
        { determination: 'approve', rationale: 'Model would approve.', actor_kind: 'ai' },
        'model',
      ),
    ).rejects.toMatchObject({ code: 'md_sign_required' });
  });

  it('delivers a physician-signed package to portal, webhook, and the ledger', async () => {
    const { spine, ledger, caseId } = await queueCase();
    const signed = await spine.signDetermination(
      caseId,
      { determination: 'approve', rationale: 'Physician approves the synthetic request.', actor_kind: 'clinician' },
      'md_synth',
    );
    expect(signed.package.immutable).toBe(true);
    expect(signed.package.signer_id).toBe('md_synth');
    expect(signed.case.state).toBe('determined');
    expect(signed.case.fanout_status).toBe('pending');
    expect(signed.audit.length).toBeGreaterThan(0);

    const calls: string[] = [];
    const transport: WebhookTransport = async (url) => {
      calls.push(url);
      return { ok: true, status: 202 };
    };
    const fanout = new FanoutService({
      spine,
      ledger,
      store: new MemoryFanoutStore(),
      config: new ClientConfigService(new MemoryClientConfigStore()),
      transport,
      now: () => NOW,
      webhookUrl: 'https://client.example.test/vantaum/callback',
      webhookSecret: 'synth-secret',
    });
    const result = await fanout.processCase(caseId, 'md_synth');
    expect(result.state).toBe('fanout_complete');
    expect(result.targets.find((t) => t.target === 'F1_portal')?.ok).toBe(true);
    expect(result.webhook.ok).toBe(true);
    expect(calls).toEqual(['https://client.example.test/vantaum/callback']);
    expect(result.billable_event_ids.length).toBeGreaterThan(0);
    const after = await spine.getCase(caseId);
    expect(after.audit_cursor).toBeGreaterThan(0);
    expect(after.signer_id).toBe('md_synth');
  });
});
