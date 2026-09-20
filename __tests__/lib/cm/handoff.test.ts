import { describe, expect, it } from 'vitest';
import { MemoryBillableEventLedger } from '@/lib/billing/events';
import { CaseSpineService, MemoryCaseSpineStore } from '@/lib/case-spine';
import { ClientConfigService, MemoryClientConfigStore } from '@/lib/client-config';
import { MemoryFanoutStore } from '@/lib/fanout/store';
import { FANOUT_MAX_ATTEMPTS, type WebhookTransport } from '@/lib/fanout/types';
import { signBodyHmacSha256 } from '@/lib/intake/hmac';
import {
  CM_CSV_COLUMNS,
  CM_HANDOFF_PAYLOAD_KEYS,
  CmHandoffService,
  buildCmFeed,
  buildCmHandoffPayload,
  buildDailyCmCsv,
  canonicalCmWebhookJson,
  cmFeedToCsv,
  cmHandoffIdempotencyKey,
  isCmFlagged,
  signCmHandoffWebhook,
  summarizeCmHandoffForLog,
  type CmHandoffLogEvent,
} from '@/lib/cm';

const NOW = new Date('2026-09-18T16:00:00.000Z');
const CLIENT = '11111111-1111-1111-1111-111111111111';
const APP_URL = 'http://localhost:3000';

async function signWith(flags: Array<'high_cost' | 'deny_with_alternative'> | []) {
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

function expectedPayload(caseId: string, flags: Array<'high_cost' | 'deny_with_alternative'>) {
  return {
    event: 'cm.handoff',
    case_id: caseId,
    external_id: 'ext-synth-cm-flagged',
    flags,
    determination: 'deny',
    determined_at: NOW.toISOString(),
    secure_summary_url: `${APP_URL}/api/portal/determinations/${caseId}/package`,
  };
}

describe('CM handoff (09)', () => {
  it('locks the 09 cm.handoff payload shape (no extra PHI fields)', () => {
    const payload = buildCmHandoffPayload({
      case_id: 'case-synth-cm',
      external_id: 'ext-synth-cm',
      flags: ['high_cost'],
      determination: 'deny',
      determined_at: NOW.toISOString(),
      secure_summary_url: `${APP_URL}/api/portal/determinations/case-synth-cm/package`,
    });
    expect(Object.keys(payload)).toEqual([...CM_HANDOFF_PAYLOAD_KEYS]);
    expect(payload).toEqual({
      event: 'cm.handoff',
      case_id: 'case-synth-cm',
      external_id: 'ext-synth-cm',
      flags: ['high_cost'],
      determination: 'deny',
      determined_at: NOW.toISOString(),
      secure_summary_url: `${APP_URL}/api/portal/determinations/case-synth-cm/package`,
    });
    expect(payload).not.toHaveProperty('member_ref');
    expect(payload).not.toHaveProperty('rationale');
    expect(payload).not.toHaveProperty('patient_name');
  });

  it('HMAC-signs the 09 cm.handoff payload and stamps a stable idempotency key', () => {
    const payload = buildCmHandoffPayload({
      case_id: 'case-synth-cm',
      external_id: 'ext-synth-cm',
      flags: ['high_cost'],
      determination: 'deny',
      determined_at: NOW.toISOString(),
      secure_summary_url: `${APP_URL}/api/portal/determinations/case-synth-cm/package`,
    });
    const signed = signCmHandoffWebhook(payload, 'synth-cm-webhook-secret');
    expect(payload.event).toBe('cm.handoff');
    expect(signed.headers['X-VantaUM-Event']).toBe('cm.handoff');
    expect(signed.signature).toBe(
      signBodyHmacSha256(canonicalCmWebhookJson(payload), 'synth-cm-webhook-secret'),
    );
    expect(signed.headers['X-VantaUM-Idempotency-Key']).toBe(cmHandoffIdempotencyKey(payload));
    expect(signed.headers['X-VantaUM-Idempotency-Key']).toMatch(/^[a-f0-9]{64}$/);
    expect(cmHandoffIdempotencyKey(payload)).toBe(cmHandoffIdempotencyKey({ ...payload }));
  });

  it('flag → webhook posts the exact 09 payload shape', async () => {
    const { spine, signed } = await signWith(['high_cost']);
    expect(isCmFlagged(signed.case)).toBe(true);
    expect(signed.case.cm_flags).toEqual(['high_cost']);

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
      appUrl: APP_URL,
      webhookUrl: 'https://hooks.example.test/cm',
      webhookSecret: 'synth-cm-webhook-secret',
      log: () => undefined,
    }).deliver(signed.case.case_id);

    expect(result.flagged).toBe(true);
    expect(result.in_feed).toBe(true);
    expect(result.webhook.configured).toBe(true);
    expect(result.webhook.ok).toBe(true);
    expect(posts).toHaveLength(1);
    const parsed = JSON.parse(posts[0].body) as Record<string, unknown>;
    const { signature, ...unsigned } = parsed;
    expect(unsigned).toEqual(expectedPayload(signed.case.case_id, ['high_cost']));
    expect(Object.keys(unsigned)).toEqual([...CM_HANDOFF_PAYLOAD_KEYS]);
    expect(typeof signature).toBe('string');
    expect(posts[0].headers['X-VantaUM-Signature']).toMatch(/^sha256=[a-f0-9]{64}$/);
    expect(posts[0].headers['X-VantaUM-Idempotency-Key']).toBe(
      cmHandoffIdempotencyKey(unsigned as never),
    );
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
      log: () => undefined,
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

  it('retries CM webhook with the same 8-attempt budget and identical payload', async () => {
    const { spine, signed } = await signWith(['high_cost']);
    const sleeps: number[] = [];
    const bodies: string[] = [];
    const keys: string[] = [];
    const failing: WebhookTransport = async (_url, body, headers) => {
      bodies.push(body);
      keys.push(headers['X-VantaUM-Idempotency-Key']);
      return { ok: false, status: 503, error: 'down' };
    };
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
      log: () => undefined,
    }).deliver(signed.case.case_id);

    expect(result.webhook.ok).toBe(false);
    expect(result.webhook.attempts).toBe(FANOUT_MAX_ATTEMPTS);
    expect(sleeps).toHaveLength(FANOUT_MAX_ATTEMPTS - 1);
    expect(result.in_feed).toBe(true);
    expect(new Set(bodies).size).toBe(1);
    expect(new Set(keys).size).toBe(1);
  });

  it('is retry-safe: a second deliver after success does not re-POST', async () => {
    const { spine, signed } = await signWith(['high_cost']);
    const posts: string[] = [];
    const store = new MemoryFanoutStore();
    const transport: WebhookTransport = async (_url, body) => {
      posts.push(body);
      return { ok: true, status: 200 };
    };
    const cm = new CmHandoffService({
      spine,
      store,
      transport,
      now: () => NOW,
      appUrl: APP_URL,
      webhookUrl: 'https://hooks.example.test/cm',
      webhookSecret: 'synth-cm-webhook-secret',
      log: () => undefined,
    });

    const first = await cm.deliver(signed.case.case_id);
    const second = await cm.deliver(signed.case.case_id);
    expect(first.webhook.ok).toBe(true);
    expect(first.webhook.replayed).toBeFalsy();
    expect(second.webhook.replayed).toBe(true);
    expect(second.webhook.ok).toBe(true);
    expect(posts).toHaveLength(1);
    expect(second.webhook.payload).toEqual(expectedPayload(signed.case.case_id, ['high_cost']));
  });

  it('emits a PHI-free log summary (no payload, member_ref, or summary URL)', async () => {
    const { spine, signed } = await signWith(['high_cost']);
    const logs: CmHandoffLogEvent[] = [];
    await new CmHandoffService({
      spine,
      store: new MemoryFanoutStore(),
      transport: async () => ({ ok: true, status: 200 }),
      now: () => NOW,
      webhookUrl: 'https://hooks.example.test/cm',
      webhookSecret: 'synth-cm-webhook-secret',
      log: (event) => logs.push(event),
    }).deliver(signed.case.case_id);

    expect(logs).toHaveLength(1);
    const summary = logs[0];
    expect(summary).toEqual(
      summarizeCmHandoffForLog({
        case_id: signed.case.case_id,
        flagged: true,
        flags: ['high_cost'],
        configured: true,
        ok: true,
        attempts: 1,
      }),
    );
    expect(summary).not.toHaveProperty('external_id');
    expect(summary).not.toHaveProperty('secure_summary_url');
    expect(summary).not.toHaveProperty('member_ref');
    expect(summary).not.toHaveProperty('payload');
    expect(summary).not.toHaveProperty('body');
    expect(JSON.stringify(summary)).not.toMatch(/memb_synth|Synthetic flagged deny/);
  });

  it('CSV export is flagged-only and locks the 09 column order', async () => {
    const flagged = await signWith(['high_cost', 'deny_with_alternative']);
    const clean = await signWith([]);
    const drop = buildDailyCmCsv([flagged.signed.case, clean.signed.case], {
      day: '2026-09-18',
      appUrl: APP_URL,
    });

    expect(CM_CSV_COLUMNS).toEqual([
      'case_id',
      'external_id',
      'flags',
      'determination',
      'determined_at',
      'secure_summary_url',
    ]);
    expect(drop.items).toHaveLength(1);
    expect(drop.items[0].case_id).toBe(flagged.signed.case.case_id);
    expect(drop.items[0].flags).toEqual(['high_cost', 'deny_with_alternative']);
    expect(drop.csv.split('\n')[0]).toBe(CM_CSV_COLUMNS.join(','));
    expect(drop.csv).toContain(flagged.signed.case.case_id);
    expect(drop.csv).toContain('high_cost|deny_with_alternative');
    expect(drop.csv).toContain('ext-synth-cm-flagged');
    expect(drop.csv).not.toContain(clean.signed.case.case_id);
    expect(drop.csv).not.toContain('ext-synth-cm-clean');
    expect(cmFeedToCsv([])).toBe(CM_CSV_COLUMNS.join(','));
  });
});
