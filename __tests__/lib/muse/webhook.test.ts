import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHmac } from 'crypto';
import {
  evaluateMuseCxEntitlement,
  getMemoryMuseStore,
  readMuseConnector,
  resetMemoryMuseStore,
  screenMusePayload,
  verifyMuseWebhook,
} from '@/lib/muse';

const SECRET = 'muse-test-secret';
const CLEAN = {
  account_id: 'acct_synth_001',
  contact_role: 'tpa_ops',
  scheduling_intent: { follow_up: true },
};

function hex(body: string, secret: string): string {
  return createHmac('sha256', secret).update(body, 'utf8').digest('hex');
}

describe('Muse webhook fail-closed', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    resetMemoryMuseStore();
  });

  it('fails closed in production when no webhook secret is configured', () => {
    const verdict = verifyMuseWebhook({
      rawBody: '{}',
      signature: null,
      env: { NODE_ENV: 'production' } as NodeJS.ProcessEnv,
    });
    expect(verdict).toMatchObject({
      ok: false,
      status: 500,
      reason: 'webhook_secret_not_configured',
    });
  });

  it('allows synthetic dev traffic when the secret is empty', () => {
    const verdict = verifyMuseWebhook({
      rawBody: '{}',
      signature: null,
      env: { NODE_ENV: 'test' } as NodeJS.ProcessEnv,
    });
    expect(verdict).toEqual({ ok: true, unverifiedDev: true });
  });

  it('accepts the primary secret and the rotation secondary', () => {
    const raw = JSON.stringify(CLEAN);
    const env = {
      NODE_ENV: 'production',
      MUSE_WEBHOOK_SECRET: SECRET,
      MUSE_WEBHOOK_SECRET_SECONDARY: 'next-secret',
    } as NodeJS.ProcessEnv;
    expect(
      verifyMuseWebhook({ rawBody: raw, signature: hex(raw, 'next-secret'), env }).ok,
    ).toBe(true);
    expect(
      verifyMuseWebhook({ rawBody: raw, signature: 'deadbeef', env }),
    ).toMatchObject({ ok: false, status: 401 });
  });

  it('stores a clean record and refuses PHI before the store', () => {
    const screened = screenMusePayload(CLEAN);
    expect(screened.ok).toBe(true);
    if (!screened.ok) return;
    const first = getMemoryMuseStore().upsert(screened.record);
    const replay = getMemoryMuseStore().upsert(screened.record);
    expect(first.idempotent).toBe(false);
    expect(replay.idempotent).toBe(true);
    expect(replay.touchpoint.touchpoint_id).toBe(first.touchpoint.touchpoint_id);
    expect(getMemoryMuseStore().list()).toHaveLength(1);

    const rejected = screenMusePayload({ ...CLEAN, diagnosis: 'secret' });
    expect(rejected.ok).toBe(false);
    expect(getMemoryMuseStore().list()).toHaveLength(1);
    expect(JSON.stringify(getMemoryMuseStore().list())).not.toContain('diagnosis');
  });
});

describe('Muse connector stays offline', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('fails closed without MUSE_API_KEY and does not entitle the CX panel', () => {
    const env = { MUSE_API_KEY: '', MUSE_CX_ENABLED: 'true' } as NodeJS.ProcessEnv;
    expect(readMuseConnector(env)).toEqual({
      configured: false,
      live_call: false,
      code: 'not_configured',
    });
    expect(evaluateMuseCxEntitlement(env).entitled).toBe(false);
  });

  it('a set key is still stub_only and the panel needs the flag', () => {
    const keyed = { MUSE_API_KEY: 'slot-not-live', MUSE_CX_ENABLED: 'false' } as NodeJS.ProcessEnv;
    expect(readMuseConnector(keyed)).toEqual({
      configured: true,
      live_call: false,
      code: 'stub_only',
    });
    expect(evaluateMuseCxEntitlement(keyed).entitled).toBe(false);
    const both = { MUSE_API_KEY: 'slot-not-live', MUSE_CX_ENABLED: 'true' } as NodeJS.ProcessEnv;
    expect(evaluateMuseCxEntitlement(both)).toMatchObject({
      configured: true,
      flag_enabled: true,
      entitled: true,
      live_call: false,
    });
  });
});
