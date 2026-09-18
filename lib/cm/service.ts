/**
 * Care-management handoff (09 / Phase 6.2).
 *
 * Webhook HMAC uses the same 8× exponential budget as determination
 * fan-out (≤ 5 minutes). Flagged determinations only — unflagged never
 * post and never enter the CM feed.
 */

import { randomUUID } from 'crypto';
import { getClientConfigService, type ClientConfigService } from '@/lib/client-config';
import { getCaseSpineService, type CanonicalCase, type CaseSpineService } from '@/lib/case-spine';
import { getMemoryFanoutStore, type FanoutStore } from '@/lib/fanout/store';
import {
  FANOUT_MAX_ATTEMPTS,
  defaultWebhookTransport,
  nextBackoffMs,
  type WebhookTransport,
} from '@/lib/fanout/types';
import { buildCmFeed, isCmFlagged, type CmFeedItem } from './feed';
import { buildDailyCmCsv } from './csv';
import {
  buildCmHandoffPayload,
  cmSecureSummaryUrl,
  signCmHandoffWebhook,
  type CmHandoffPayload,
} from './webhook';

export interface CmHandoffResult {
  case_id: string;
  flagged: boolean;
  webhook: {
    configured: boolean;
    ok: boolean | null;
    attempts: number;
    last_error: string | null;
    payload?: CmHandoffPayload;
    signature?: string;
  };
  in_feed: boolean;
}

export interface CmServiceOptions {
  spine?: CaseSpineService;
  config?: ClientConfigService;
  store?: FanoutStore;
  transport?: WebhookTransport;
  sleep?: (ms: number) => Promise<void>;
  now?: () => Date;
  webhookUrl?: string | null;
  webhookSecret?: string | null;
  appUrl?: string;
}

const noopSleep = async () => undefined;

export class CmHandoffService {
  private readonly spineOverride?: CaseSpineService;
  private readonly configOverride?: ClientConfigService;
  private readonly storeOverride?: FanoutStore;
  private readonly transport: WebhookTransport;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly now: () => Date;
  private readonly webhookUrlOverride: string | null | undefined;
  private readonly webhookSecretOverride: string | null | undefined;
  private readonly appUrl: string | undefined;

  constructor(opts: CmServiceOptions = {}) {
    this.spineOverride = opts.spine;
    this.configOverride = opts.config;
    this.storeOverride = opts.store;
    this.transport = opts.transport ?? defaultWebhookTransport;
    this.sleep = opts.sleep ?? noopSleep;
    this.now = opts.now ?? (() => new Date());
    this.webhookUrlOverride = opts.webhookUrl;
    this.webhookSecretOverride = opts.webhookSecret;
    this.appUrl = opts.appUrl;
  }

  private get spine(): CaseSpineService {
    return this.spineOverride ?? getCaseSpineService();
  }
  private get config(): ClientConfigService {
    return this.configOverride ?? getClientConfigService();
  }
  private get store(): FanoutStore {
    return this.storeOverride ?? getMemoryFanoutStore();
  }

  async listFeed(clientId?: string | null): Promise<CmFeedItem[]> {
    const viewer = { id: 'cm', role: 'superadmin' as const };
    const cases = await this.spine.listCases(viewer, { client_id: clientId ?? undefined });
    return buildCmFeed(cases, this.appUrl);
  }

  async dailyCsv(clientId?: string | null, day?: string) {
    const viewer = { id: 'cm', role: 'superadmin' as const };
    const cases = await this.spine.listCases(viewer, { client_id: clientId ?? undefined });
    const drop = buildDailyCmCsv(cases, { day, appUrl: this.appUrl });
    await this.store.insertIntent({
      intent_id: randomUUID(),
      case_id: drop.items[0]?.case_id ?? 'cm-daily-drop',
      channel: 'cm_csv',
      recorded_at: this.now().toISOString(),
      status: 'recorded',
      reason: `daily_csv_stub:${drop.day}:${drop.items.length}`,
    });
    return { ...drop, stub: true as const };
  }

  async deliver(caseId: string): Promise<CmHandoffResult> {
    const current = await this.spine.getCase(caseId);
    if (!isCmFlagged(current) || !current.determination) {
      return {
        case_id: caseId,
        flagged: false,
        webhook: { configured: false, ok: null, attempts: 0, last_error: null },
        in_feed: false,
      };
    }

    const webhook = await this.deliverWebhook(current);
    await this.store.insertIntent({
      intent_id: randomUUID(),
      case_id: current.case_id,
      channel: 'cm_webhook',
      recorded_at: this.now().toISOString(),
      status: webhook.ok === true ? 'sent' : webhook.configured ? 'recorded' : 'skipped',
      reason: webhook.configured
        ? webhook.ok
          ? `cm_flags:${current.cm_flags.join(',')}`
          : webhook.last_error ?? 'cm_webhook_failed'
        : 'cm_feed_only',
      to: webhook.configured ? 'cm_webhook' : null,
    });

    return {
      case_id: caseId,
      flagged: true,
      webhook,
      in_feed: true,
    };
  }

  private async resolveWebhook(c: CanonicalCase): Promise<{ url: string | null; secret: string | null }> {
    if (this.webhookUrlOverride !== undefined) {
      return {
        url: this.webhookUrlOverride,
        secret: this.webhookSecretOverride ?? 'synth-cm-webhook-secret',
      };
    }
    const latest = await this.config.getLatest(c.client_id);
    const cfg = latest?.config;
    return {
      url: cfg?.cm_webhook_url ?? null,
      secret: cfg?.cm_webhook_secret ?? cfg?.determination_webhook_secret ?? null,
    };
  }

  private async deliverWebhook(c: CanonicalCase): Promise<CmHandoffResult['webhook']> {
    const { url, secret } = await this.resolveWebhook(c);
    if (!url || !secret || !c.determination) {
      return { configured: false, ok: null, attempts: 0, last_error: null };
    }

    const payload = buildCmHandoffPayload({
      case_id: c.case_id,
      external_id: c.external_id,
      flags: c.cm_flags,
      determination: c.determination,
      determined_at: c.determined_at ?? this.now().toISOString(),
      secure_summary_url: cmSecureSummaryUrl(c.case_id, this.appUrl),
    });
    const signed = signCmHandoffWebhook(payload, secret);

    let lastError: string | null = null;
    for (let attempt = 1; attempt <= FANOUT_MAX_ATTEMPTS; attempt++) {
      const delivered = await this.transport(url, signed.body, signed.headers);
      await this.store.insertAttempt({
        attempt_id: randomUUID(),
        case_id: c.case_id,
        target: 'F6_cm',
        attempt,
        at: this.now().toISOString(),
        ok: delivered.ok,
        status: delivered.status,
        error: delivered.error ?? null,
      });
      if (delivered.ok) {
        return {
          configured: true,
          ok: true,
          attempts: attempt,
          last_error: null,
          payload,
          signature: signed.signature,
        };
      }
      lastError = delivered.error ?? `http_${delivered.status}`;
      if (attempt < FANOUT_MAX_ATTEMPTS) {
        await this.sleep(nextBackoffMs(attempt));
      }
    }

    return {
      configured: true,
      ok: false,
      attempts: FANOUT_MAX_ATTEMPTS,
      last_error: lastError,
      payload,
      signature: signed.signature,
    };
  }
}

let serviceSingleton: CmHandoffService | null = null;

export function getCmHandoffService(): CmHandoffService {
  if (!serviceSingleton) serviceSingleton = new CmHandoffService();
  return serviceSingleton;
}

export function resetCmHandoffService(): CmHandoffService {
  serviceSingleton = new CmHandoffService();
  return serviceSingleton;
}

export function setCmHandoffService(svc: CmHandoffService | null): void {
  serviceSingleton = svc;
}
