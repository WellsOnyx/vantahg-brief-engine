import { describe, expect, it } from 'vitest';
import { MemoryBillableEventLedger } from '@/lib/billing/events';
import { CaseSpineService, MemoryCaseSpineStore } from '@/lib/case-spine';
import { ClientConfigService, MemoryClientConfigStore } from '@/lib/client-config';
import { MemoryFanoutStore } from '@/lib/fanout/store';
import { FANOUT_MAX_ATTEMPTS, type WebhookTransport } from '@/lib/fanout/types';
import { signBodyHmacSha256 } from '@/lib/intake/hmac';
import {
  CmHandoffService,
  buildCmFeed,
  buildCmHandoffPayload,
  canonicalCmWebhookJson,
  isCmFlagged,
  signCmHandoffWebhook,
} from '@/lib/cm';

const NOW = new Date('2026-09-18T16:00:00.000Z');
const CLIENT = '11111111-1111-1111-1111-111111111111';

async function signWith(flags: Array<'high_cost'> | []) {
  const store = new MemoryCaseSpineStore();
  const ledger = new MemoryBillableEventLedger();
  const spine = new CaseSpineService(store, () => NOW, ledger);
  const created = await spine.createCase({
    client_id: CLIENT,
    packet_storage_keys: ['s3://synth/packet/cm.pdf'],
    intake: {
      external_id: flags.length ? 'ext-synth-cm-flagged' : 'ext-synth-cm-clean',
      member_ref: 'memb_synth_cm',
      received_at: '2026-09-18T10:00:00.000Z',
      benefit_type: 'medical',
    },
  });
  await spine.transitionCase(created.case.case_id, { to_state: 'intake_validated' });
  await spine.transitionCase(created.case.case_id, { to_state: 'routed' });
  await spine.attachBrief(created.case.case_id, { criteria_result: 'meet', enqueue_md: true });
  const signed = await spine.signDetermination(
    created.case.case_id,
    {
      determination: flags.length ? 'deny' : 'approve',
      rationale: flags.length ? 'Synthetic flagged deny.' : 'Synthetic unflagged approve.',
      cm_flags: flags,
    },
    'md_synth',
  );
  return { spine, ledger, signed };
}

describe('CM handoff (09)', () => {
  it('HMAC-signs the 09 cm.handoff payload', () => {
    const payload = buildCmHandoffPayload({
      case_id: 'case-synth-cm',
      external_id: 'ext-synth-cm',
      flags: ['high_cost'],
      determination: 'deny',
      determined_at: NOW.toISOString(),
      secure_summary_url: 'http://localhost:3000/api/portal/determinations/case-synth-cm/package',
    });
    const signed = signCmHandoffWebhook(payload, 'synth-cm-webhook-secret');
    expect(payload.event).toBe('cm.handoff');
    expect(signed.headers['X-VantaUM-Event']).toBe('cm.handoff');
    expect(signed.signature).toBe(
      signBodyHmacSha256(canonicalCmWebhookJson(payload), 'synth-cm-webhook-secret'),
    );
  });

  it('posts HMAC webhook only when flags are non-empty', async () => {
    const { spine, signed } = await signWith(['high_cost']);
    expect(isCmFlagged(signed.case)).toBe(true);

    const posts: Array<{ url: string; body: string; headers: Record<string, string> }> = [];
    const transport: WebhookTransport = async (url, body, headers) => {
      posts.push({ url, body, headers });
      return { ok: true, status: 200 };
    };

    const result = await new CmHandoffService({
      spine,
      store: new MemoryFanoutStore(),
      config: new ClientConfigService(new MemoryClientConfigStore()),
      transport,
      now: () => NOW,
      webhookUrl: 'https://hooks.example.test/cm',
      webhookSecret: 'synth-cm-webhook-secret',
    }).deliver(signed.case.case_id);

    expect(result.flagged).toBe(true);
    expect(result.in_feed).toBe(true);
    expect(result.webhook.configured).toBe(true);
    expect(result.webhook.ok).toBe(true);
    expect(posts).toHaveLength(1);
    const parsed = JSON.parse(posts[0].body) as { event: string; flags: string[]; case_id: string };
    expect(parsed.event).toBe('cm.handoff');
    expect(parsed.flags).toEqual(['high_cost']);
    expect(parsed.case_id).toBe(signed.case.case_id);
    expect(posts[0].headers['X-VantaUM-Signature']).toMatch(/^sha256=[a-f0-9]{64}$/);
  });

  it('never posts and never lists unflagged determinations', async () => {
    const flagged = await signWith(['high_cost']);
    const clean = await signWith([]);
    const posts: string[] = [];
    const transport: WebhookTransport = async (_url, body) => {
      posts.push(body);
      return { ok: true, status: 200 };
    };

    const cm = new CmHandoffService({
      spine: clean.spine,
      store: new MemoryFanoutStore(),
      transport,
      now: () => NOW,
      webhookUrl: 'https://hooks.example.test/cm',
      webhookSecret: 'synth-cm-webhook-secret',
    });
    const skipped = await cm.deliver(clean.signed.case.case_id);
    expect(skipped.flagged).toBe(false);
    expect(skipped.in_feed).toBe(false);
    expect(skipped.webhook.attempts).toBe(0);
    expect(posts).toHaveLength(0);

    const feed = buildCmFeed([flagged.signed.case, clean.signed.case]);
    expect(feed.every((item) => item.flags.length > 0)).toBe(true);
    expect(feed.some((item) => item.case_id === clean.signed.case.case_id)).toBe(false);
    expect(feed.some((item) => item.case_id === flagged.signed.case.case_id)).toBe(true);
  });

  it('retries CM webhook with the same 8-attempt budget as determination fan-out', async () => {
    const { spine, signed } = await signWith(['high_cost']);
    const sleeps: number[] = [];
    const failing: WebhookTransport = async () => ({ ok: false, status: 503, error: 'down' });
    const result = await new CmHandoffService({
      spine,
      store: new MemoryFanoutStore(),
      transport: failing,
      sleep: async (ms) => {
        sleeps.push(ms);
      },
      now: () => NOW,
      webhookUrl: 'https://hooks.example.test/cm',
      webhookSecret: 'synth-cm-webhook-secret',
    }).deliver(signed.case.case_id);

    expect(result.webhook.ok).toBe(false);
    expect(result.webhook.attempts).toBe(FANOUT_MAX_ATTEMPTS);
    expect(sleeps).toHaveLength(FANOUT_MAX_ATTEMPTS - 1);
    expect(result.in_feed).toBe(true);
  });
});
