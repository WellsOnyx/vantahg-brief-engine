import { describe, expect, it } from 'vitest';
import {
  CaseSpineService,
  MemoryCaseSpineStore,
} from '@/lib/case-spine';
import { MemoryBillableEventLedger } from '@/lib/billing/events';
import { ClientConfigService, MemoryClientConfigStore } from '@/lib/client-config';
import { FanoutService } from '@/lib/fanout/service';
import { MemoryFanoutStore } from '@/lib/fanout/store';
import { FANOUT_MAX_ATTEMPTS, type WebhookTransport } from '@/lib/fanout/types';

const NOW = new Date('2026-09-18T15:00:00.000Z');
const CLIENT = '11111111-1111-1111-1111-111111111111';

const INTAKE = {
  external_id: 'ext-synth-fanout',
  member_ref: 'memb_synth_fanout',
  requesting_provider: 'prov_synth_fanout',
  service_or_rx: 'CPT-73721',
  place_of_service: 'office',
  urgency: 'standard' as const,
  clinicals_pointer: 's3://synth/packet/fanout.pdf',
  received_at: NOW.toISOString(),
  benefit_type: 'medical' as const,
};

async function signedCase(priority: 'standard' | 'urgent' = 'standard') {
  const store = new MemoryCaseSpineStore();
  const ledger = new MemoryBillableEventLedger();
  const spine = new CaseSpineService(store, () => NOW, ledger);
  const created = await spine.createCase({
    client_id: CLIENT,
    priority,
    packet_storage_keys: ['s3://synth/packet/fanout.pdf'],
    intake: { ...INTAKE, urgency: priority },
  });
  await spine.transitionCase(created.case.case_id, { to_state: 'intake_validated' });
  await spine.transitionCase(created.case.case_id, { to_state: 'routed' });
  await spine.attachBrief(created.case.case_id, { criteria_result: 'meet', enqueue_md: true });
  const signed = await spine.signDetermination(
    created.case.case_id,
    { determination: 'approve', rationale: 'Synthetic approve for fan-out tests.' },
    'md_synth',
  );
  return { spine, ledger, signed };
}

describe('fan-out after MD sign', () => {
  it('successful fan-out (no webhook) → fanout_complete + F1/F5', async () => {
    const { spine, ledger, signed } = await signedCase();
    expect(signed.case.fanout_status).toBe('pending');
    expect(signed.case.state).toBe('determined');

    const fanout = new FanoutService({
      spine,
      ledger,
      store: new MemoryFanoutStore(),
      config: new ClientConfigService(new MemoryClientConfigStore()),
      now: () => NOW,
    });
    const result = await fanout.processCase(signed.case.case_id, 'system');

    expect(result.required_ok).toBe(true);
    expect(result.fanout_status).toBe('complete');
    expect(result.state).toBe('fanout_complete');
    expect(result.webhook.configured).toBe(false);
    expect(result.targets.find((t) => t.target === 'F1_portal')?.ok).toBe(true);
    expect(result.targets.find((t) => t.target === 'F5_billing')?.ok).toBe(true);
    expect(result.billable_event_ids.length).toBeGreaterThanOrEqual(1);

    const after = await spine.getCase(signed.case.case_id);
    expect(after.state).toBe('fanout_complete');
    expect(after.fanout_status).toBe('complete');
    expect(after.open_tasks).not.toContain('resolve_fanout');
  });

  it('retry exhausted webhook → fanout_failed + CX task', async () => {
    const { spine, ledger, signed } = await signedCase();
    const sleeps: number[] = [];
    const failing: WebhookTransport = async () => ({ ok: false, status: 503, error: 'down' });
    const store = new MemoryFanoutStore();

    const fanout = new FanoutService({
      spine,
      ledger,
      store,
      config: new ClientConfigService(new MemoryClientConfigStore()),
      transport: failing,
      sleep: async (ms) => {
        sleeps.push(ms);
      },
      now: () => NOW,
      webhookUrl: 'https://hooks.example.test/vantaum',
      webhookSecret: 'synth-webhook-secret',
    });

    const result = await fanout.processCase(signed.case.case_id, 'system');
    expect(result.fanout_status).toBe('failed');
    expect(result.state).toBe('fanout_failed');
    expect(result.webhook.ok).toBe(false);
    expect(result.webhook.attempts).toBe(FANOUT_MAX_ATTEMPTS);
    expect(result.cx_task_id).toBeTruthy();
    expect(sleeps).toHaveLength(FANOUT_MAX_ATTEMPTS - 1);

    const after = await spine.getCase(signed.case.case_id);
    expect(after.state).toBe('fanout_failed');
    expect(after.open_tasks).toContain('resolve_fanout');
    const tasks = await store.listCxTasks({ case_id: signed.case.case_id, status: 'open' });
    expect(tasks).toHaveLength(1);
    expect(tasks[0].kind).toBe('resolve_fanout');
  });

  it('successful webhook posts HMAC payload and completes', async () => {
    const { spine, ledger, signed } = await signedCase();
    const posts: Array<{ url: string; body: string; headers: Record<string, string> }> = [];
    const transport: WebhookTransport = async (url, body, headers) => {
      posts.push({ url, body, headers });
      return { ok: true, status: 200 };
    };

    const result = await new FanoutService({
      spine,
      ledger,
      store: new MemoryFanoutStore(),
      transport,
      now: () => NOW,
      webhookUrl: 'https://hooks.example.test/vantaum',
      webhookSecret: 'synth-webhook-secret',
    }).processCase(signed.case.case_id);

    expect(result.fanout_status).toBe('complete');
    expect(posts).toHaveLength(1);
    const parsed = JSON.parse(posts[0].body) as {
      event: string;
      case_id: string;
      signature: string;
      download_url: string;
    };
    expect(parsed.event).toBe('determination.signed');
    expect(parsed.case_id).toBe(signed.case.case_id);
    expect(parsed.signature).toMatch(/^[a-f0-9]{64}$/);
    expect(parsed.download_url).toContain(`/api/portal/determinations/${signed.case.case_id}/package`);
    expect(posts[0].headers['X-VantaUM-Signature']).toMatch(/^sha256=[a-f0-9]{64}$/);
  });
});
