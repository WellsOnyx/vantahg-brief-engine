/**
 * Determination fan-out (Phase 4.2).
 *
 * Consumes Phase 3 sign stubs (fanout_status=pending, billable_event_id).
 * F1 + F5 must succeed before fanout_complete. F2 retries 8× exponential
 * then fanout_failed + CX task. F3/F4/F6 record outbound intent in demo
 * (no fake SES unless ENABLE_AWS_EMAIL=true).
 */

import { randomUUID } from 'crypto';
import { getEmailAdapter } from '@/lib/adapters/email';
import {
  recordBillableEventsForSign,
  type BillableEvent,
  type BillableEventLedger,
} from '@/lib/billing/events';
import { getBillableEventLedger } from '@/lib/billing/ledger';
import { upsertUmReviewLine } from '@/lib/billing/um-invoice';
import { isReviewRoute } from '@/lib/billing/um-price-card';
import { getClientConfigService, isShadowMode, type ClientConfigService } from '@/lib/client-config';
import { CaseSpineService, getCaseSpineService, type CanonicalCase, type FanoutStub } from '@/lib/case-spine';
import { SYNTHETIC_CLIENT_ID } from '@/lib/intake/constants';
import { getMemoryFanoutStore, type FanoutStore } from './store';
import {
  FANOUT_MAX_ATTEMPTS,
  defaultWebhookTransport,
  nextBackoffMs,
  type CxTask,
  type FanoutResult,
  type TargetResult,
  type WebhookTransport,
} from './types';
import { CmHandoffService } from '@/lib/cm/service';
import {
  buildDeterminationSignedPayload,
  portalPackageUrl,
  signDeterminationWebhook,
} from './webhook';

export interface FanoutServiceOptions {
  spine?: CaseSpineService;
  ledger?: BillableEventLedger;
  store?: FanoutStore;
  config?: ClientConfigService;
  transport?: WebhookTransport;
  sleep?: (ms: number) => Promise<void>;
  now?: () => Date;
  webhookUrl?: string | null;
  webhookSecret?: string | null;
  appUrl?: string;
  /** Phase 7.3 — force shadow (skip member/provider final send) even if config is synthetic. */
  shadowMode?: boolean;
}

const noopSleep = async () => undefined;

export class FanoutService {
  private readonly spineOverride?: CaseSpineService;
  private readonly ledgerOverride?: BillableEventLedger;
  private readonly storeOverride?: FanoutStore;
  private readonly configOverride?: ClientConfigService;
  private readonly transport: WebhookTransport;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly now: () => Date;
  private readonly webhookUrlOverride: string | null | undefined;
  private readonly webhookSecretOverride: string | null | undefined;
  private readonly appUrl: string | undefined;
  private readonly shadowModeOverride: boolean | undefined;

  constructor(opts: FanoutServiceOptions = {}) {
    this.spineOverride = opts.spine;
    this.ledgerOverride = opts.ledger;
    this.storeOverride = opts.store;
    this.configOverride = opts.config;
    this.transport = opts.transport ?? defaultWebhookTransport;
    this.sleep = opts.sleep ?? noopSleep;
    this.now = opts.now ?? (() => new Date());
    this.webhookUrlOverride = opts.webhookUrl;
    this.webhookSecretOverride = opts.webhookSecret;
    this.appUrl = opts.appUrl;
    this.shadowModeOverride = opts.shadowMode;
  }

  private get spine(): CaseSpineService {
    return this.spineOverride ?? getCaseSpineService();
  }
  private get ledger(): BillableEventLedger {
    return this.ledgerOverride ?? getBillableEventLedger();
  }
  private get store(): FanoutStore {
    return this.storeOverride ?? getMemoryFanoutStore();
  }
  private get config(): ClientConfigService {
    return this.configOverride ?? getClientConfigService();
  }

  async processCase(caseId: string, actor = 'system'): Promise<FanoutResult> {
    const current = await this.spine.getCase(caseId);
    if (!current.determination || !current.signer_id || !current.determination_package_version) {
      throw new Error(`Cannot fan out unsigned case ${caseId}`);
    }

    let working = current;
    if (working.state === 'determined') {
      const moved = await this.spine.transitionCase(
        caseId,
        { to_state: 'fanout_pending', fanout_status: 'pending', note: 'Phase 4 fan-out started' },
        actor,
      );
      working = moved.case;
    }

    const billed = await this.ensureBillable(working);
    const cfg = await this.clientChannels(working.client_id);
    const shadow = this.shadowModeOverride ?? isShadowMode(cfg);
    const f1 = await this.deliverPortal(working);
    const f7 = await this.recordArchive(working);
    const f3 = await this.recordFax(working);
    const f4 = await this.recordEmail(working, shadow);
    const f6 = await this.recordCm(working);
    const f8 = await this.recordAudienceOutbound(working, 'member', 'F8_member', shadow);
    const f9 = await this.recordAudienceOutbound(working, 'provider', 'F9_provider', shadow);
    const webhook = await this.deliverWebhook(working);

    const targets: TargetResult[] = [
      f1,
      { target: 'F5_billing', ok: billed.length > 0, reason: billed.length ? 'ledger_row' : 'missing' },
      f7,
      f3,
      f4,
      f6,
      f8,
      f9,
      {
        target: 'F2_webhook',
        ok: webhook.ok === true || !webhook.configured,
        skipped: !webhook.configured,
        reason: webhook.configured ? webhook.last_error ?? 'delivered' : 'not_configured',
        attempts: webhook.attempts,
      },
    ];

    const requiredOk = f1.ok && billed.length > 0;
    const webhookFailed = webhook.configured && webhook.ok === false;
    let cxTaskId: string | null = null;
    let nextStatus: FanoutResult['fanout_status'] = 'pending';
    let nextState = working.state;

    if (requiredOk && !webhookFailed) {
      nextStatus = 'complete';
      if (working.state === 'fanout_pending') {
        const done = await this.spine.transitionCase(
          caseId,
          { to_state: 'fanout_complete', fanout_status: 'complete', note: 'F1+F5 succeeded' },
          actor,
        );
        working = done.case;
        nextState = working.state;
      }
    } else if (webhookFailed) {
      nextStatus = 'failed';
      const task = await this.openCxTask(working, webhook.last_error ?? 'webhook_exhausted');
      cxTaskId = task.task_id;
      if (working.state === 'fanout_pending') {
        const failed = await this.spine.transitionCase(
          caseId,
          {
            to_state: 'fanout_failed',
            fanout_status: 'failed',
            note: 'Webhook retries exhausted; CX task opened',
          },
          actor,
        );
        working = failed.case;
        nextState = working.state;
      }
    }

    const stub: FanoutStub = {
      enqueued_at: working.fanout_stub?.enqueued_at ?? this.now().toISOString(),
      status: nextStatus === 'complete' ? 'complete' : nextStatus === 'failed' ? 'failed' : 'pending',
      targets: ['F1_portal', 'F2_webhook', 'F5_billing', 'F7_archive'],
      completed_at: nextStatus === 'complete' ? this.now().toISOString() : null,
      attempt_count: webhook.attempts,
      last_error: webhook.last_error,
      cx_task_id: cxTaskId,
    };

    const openTasks = cxTaskId
      ? Array.from(new Set([...working.open_tasks, 'resolve_fanout']))
      : working.open_tasks;

    working = await this.spine.applyOpsPatch(caseId, {
      fanout_status: nextStatus,
      fanout_stub: stub,
      open_tasks: openTasks,
      billable_event_id: billed[0]?.billable_event_id ?? working.billable_event_id,
    });

    const intents = await this.store.listIntents(caseId);
    return {
      case_id: caseId,
      state: nextState,
      fanout_status: nextStatus,
      required_ok: requiredOk,
      webhook,
      targets,
      billable_event_ids: billed.map((e) => e.billable_event_id),
      cx_task_id: cxTaskId,
      outbound_intents: intents,
      shadow_mode: shadow,
    };
  }

  private async ensureBillable(c: CanonicalCase): Promise<BillableEvent[]> {
    const occurredAt = c.determined_at ?? this.now().toISOString();
    let commercial: BillableEvent[] = (await this.ledger.getByCase(c.case_id)).filter(
      (event) => event.sku === 'um_review' && event.status !== 'void',
    );
    if (commercial.length === 0 && c.bill_tier && isReviewRoute(c.bill_tier)) {
      commercial = [
        await upsertUmReviewLine(this.ledger, {
          caseId: c.case_id,
          clientId: c.client_id,
          tier: c.bill_tier,
          charge: c.charge_amount ?? 0,
          cost: c.cost_amount ?? 0,
          touchStack: c.touch_stack ?? [],
          occurredAt,
        }),
      ];
    }
    if (c.client_id !== SYNTHETIC_CLIENT_ID) return commercial;
    const legacy = await recordBillableEventsForSign(this.ledger, {
      billable_event_id: c.billable_event_id ?? randomUUID(),
      case_id: c.case_id,
      client_id: c.client_id,
      type: c.type,
      priority: c.priority,
      occurred_at: occurredAt,
    });
    return [...legacy, ...commercial];
  }

  private async deliverPortal(c: CanonicalCase): Promise<TargetResult> {
    await this.store.insertIntent({
      intent_id: randomUUID(),
      case_id: c.case_id,
      channel: 'portal',
      recorded_at: this.now().toISOString(),
      status: 'recorded',
      reason: 'F1_portal_visible',
    });
    await this.store.insertAttempt({
      attempt_id: randomUUID(),
      case_id: c.case_id,
      target: 'F1_portal',
      attempt: 1,
      at: this.now().toISOString(),
      ok: true,
      status: 200,
      error: null,
    });
    return { target: 'F1_portal', ok: true, reason: 'portal_links' };
  }

  private async recordArchive(c: CanonicalCase): Promise<TargetResult> {
    await this.store.insertIntent({
      intent_id: randomUUID(),
      case_id: c.case_id,
      channel: 'archive',
      recorded_at: this.now().toISOString(),
      status: 'recorded',
      reason: `archive:${c.determination_package_key ?? 'package'}`,
    });
    return { target: 'F7_archive', ok: true, reason: 'write_once_package' };
  }

  private async clientChannels(clientId: string) {
    const latest = await this.config.getLatest(clientId);
    return latest?.config;
  }

  private async recordFax(c: CanonicalCase): Promise<TargetResult> {
    const cfg = await this.clientChannels(c.client_id);
    const contracted = cfg?.notify_channels.includes('fax');
    if (!contracted) {
      return { target: 'F3_fax', ok: true, skipped: true, reason: 'not_contracted' };
    }
    await this.store.insertIntent({
      intent_id: randomUUID(),
      case_id: c.case_id,
      channel: 'fax',
      recorded_at: this.now().toISOString(),
      status: 'recorded',
      reason: 'demo_fax_intent_only',
    });
    return { target: 'F3_fax', ok: true, reason: 'intent_recorded' };
  }

  private async recordEmail(c: CanonicalCase, shadow = false): Promise<TargetResult> {
    const cfg = await this.clientChannels(c.client_id);
    const contracted = cfg?.notify_channels.includes('email');
    if (!contracted) {
      return { target: 'F4_email', ok: true, skipped: true, reason: 'not_contracted' };
    }
    const to = cfg?.determination_recipients[0] ?? cfg?.escalation_contacts[0]?.email ?? null;
    const subject = 'VantaUM determination available';
    const awsEmail = process.env.ENABLE_AWS_EMAIL === 'true';

    if (shadow) {
      await this.store.insertIntent({
        intent_id: randomUUID(),
        case_id: c.case_id,
        channel: 'email',
        recorded_at: this.now().toISOString(),
        status: 'skipped',
        reason: 'shadow_mode_no_final_send',
        to,
        subject,
        final_send: false,
      });
      return { target: 'F4_email', ok: true, skipped: true, reason: 'shadow_mode_no_final_send' };
    }

    if (awsEmail && to && to.includes('@')) {
      const sent = await getEmailAdapter().send({
        to,
        subject,
        text: `A determination is ready in the client portal. Case ${c.case_number}.`,
      });
      await this.store.insertIntent({
        intent_id: randomUUID(),
        case_id: c.case_id,
        channel: 'email',
        recorded_at: this.now().toISOString(),
        status: sent.ok ? 'sent' : 'recorded',
        reason: sent.ok ? 'enable_aws_email' : `ses_error:${sent.code}`,
        to,
        subject,
      });
      return { target: 'F4_email', ok: sent.ok, reason: sent.ok ? 'ses_sent' : sent.code };
    }

    await this.store.insertIntent({
      intent_id: randomUUID(),
      case_id: c.case_id,
      channel: 'email',
      recorded_at: this.now().toISOString(),
      status: 'recorded',
      reason: 'demo_no_ses',
      to,
      subject,
    });
    return { target: 'F4_email', ok: true, reason: 'demo_intent_recorded' };
  }

  /**
   * Member / requesting-provider outbound. Never a final send in this code
   * path (no live PHI). Shadow mode records skipped intent only.
   */
  private async recordAudienceOutbound(
    c: CanonicalCase,
    channel: 'member' | 'provider',
    target: 'F8_member' | 'F9_provider',
    shadow: boolean,
  ): Promise<TargetResult> {
    const ref = channel === 'member' ? c.intake.member_ref : c.intake.requesting_provider;
    const to = ref ? `${channel}:${ref}` : null;
    await this.store.insertIntent({
      intent_id: randomUUID(),
      case_id: c.case_id,
      channel,
      recorded_at: this.now().toISOString(),
      status: shadow ? 'skipped' : 'recorded',
      reason: shadow ? 'shadow_mode_no_final_send' : 'intent_only_no_member_provider_final',
      to,
      final_send: false,
    });
    return {
      target,
      ok: true,
      skipped: shadow,
      reason: shadow ? 'shadow_mode_no_final_send' : 'intent_only',
    };
  }

  private async recordCm(c: CanonicalCase): Promise<TargetResult> {
    if (c.cm_flags.length === 0) {
      return { target: 'F6_cm', ok: true, skipped: true, reason: 'not_flagged' };
    }
    const cm = new CmHandoffService({
      spine: this.spine,
      config: this.config,
      store: this.store,
      transport: this.transport,
      sleep: this.sleep,
      now: this.now,
      appUrl: this.appUrl,
    });
    const delivered = await cm.deliver(c.case_id);
    return {
      target: 'F6_cm',
      ok: delivered.webhook.ok !== false,
      skipped: !delivered.webhook.configured,
      reason: delivered.webhook.configured
        ? delivered.webhook.ok
          ? 'cm_webhook_delivered'
          : delivered.webhook.last_error ?? 'cm_webhook_failed'
        : 'cm_feed_only',
      attempts: delivered.webhook.attempts,
    };
  }

  private async resolveWebhook(c: CanonicalCase): Promise<{ url: string | null; secret: string | null }> {
    if (this.webhookUrlOverride !== undefined) {
      return {
        url: this.webhookUrlOverride,
        secret: this.webhookSecretOverride ?? 'synth-webhook-secret',
      };
    }
    const cfg = await this.clientChannels(c.client_id);
    return {
      url: cfg?.determination_webhook_url ?? null,
      secret: cfg?.determination_webhook_secret ?? null,
    };
  }

  private async deliverWebhook(c: CanonicalCase): Promise<FanoutResult['webhook']> {
    const { url, secret } = await this.resolveWebhook(c);
    if (!url || !secret) {
      return { configured: false, ok: null, attempts: 0, last_error: null };
    }

    const payload = buildDeterminationSignedPayload({
      case_id: c.case_id,
      external_id: c.external_id,
      type: c.type,
      determination: c.determination!,
      determined_at: c.determined_at ?? this.now().toISOString(),
      sla_status: c.sla_status,
      download_url: portalPackageUrl(c.case_id, this.appUrl),
      cm_flags: c.cm_flags,
    });
    const signed = signDeterminationWebhook(payload, secret);

    let lastError: string | null = null;
    for (let attempt = 1; attempt <= FANOUT_MAX_ATTEMPTS; attempt++) {
      const delivered = await this.transport(url, signed.body, signed.headers);
      await this.store.insertAttempt({
        attempt_id: randomUUID(),
        case_id: c.case_id,
        target: 'F2_webhook',
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

  private async openCxTask(c: CanonicalCase, error: string): Promise<CxTask> {
    return this.store.insertCxTask({
      task_id: randomUUID(),
      case_id: c.case_id,
      client_id: c.client_id,
      kind: 'resolve_fanout',
      status: 'open',
      created_at: this.now().toISOString(),
      note: `Webhook fan-out exhausted (${FANOUT_MAX_ATTEMPTS} attempts): ${error}`,
    });
  }
}

let serviceSingleton: FanoutService | null = null;

export function getFanoutService(): FanoutService {
  if (!serviceSingleton) serviceSingleton = new FanoutService();
  return serviceSingleton;
}

export function resetFanoutService(): FanoutService {
  serviceSingleton = new FanoutService();
  return serviceSingleton;
}

export function setFanoutService(svc: FanoutService | null): void {
  serviceSingleton = svc;
}
