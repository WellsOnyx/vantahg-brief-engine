import { describe, expect, it } from 'vitest';
import {
  ClientConfigImmutableError,
  ClientConfigService,
  MemoryClientConfigStore,
} from '@/lib/client-config';
import { SYNTHETIC_CLIENT_ID } from '@/lib/intake/constants';

const NOW = new Date('2026-09-18T15:00:00.000Z');

const BASE = {
  client_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  legal_name: 'Acme Staging TPA',
  lob: ['medical'],
  sla_hours_standard: 48,
  sla_hours_urgent: 12,
  auto_vs_md_policy: 'always_md' as const,
  notify_channels: ['portal', 'email'] as const,
  determination_recipients: ['client_admin'],
  cm_handoff_enabled: false,
  intake_modes: ['api', 'fax'] as const,
  timezone: 'America/New_York',
  business_hours: { start: '08:00', end: '18:00', days: ['mon', 'tue', 'wed', 'thu', 'fri'] },
  escalation_contacts: [{ name: 'CX', role: 'cx_owner', email: 'cx@example.com' }],
  cx_owner: 'cx_acme',
  reviewer_queue: 'med_review_acme',
};

describe('client_config versioning', () => {
  it('seeds the synthetic staging tenant as v1', async () => {
    const svc = new ClientConfigService(new MemoryClientConfigStore(), () => NOW);
    const latest = await svc.getLatest(SYNTHETIC_CLIENT_ID);
    expect(latest?.version).toBe(1);
    expect(latest?.config.auto_vs_md_policy).toBe('always_md');
    expect(latest?.config.intake_modes).toContain('gravity_rail');
    expect(latest?.config.vanta_med_review_contract).toBe(true);
    expect(latest?.config.med_review_provider).toBe('vanta');
  });

  it('publishes v1 then v2 without mutating v1', async () => {
    const svc = new ClientConfigService(new MemoryClientConfigStore(false), () => NOW);
    const v1 = await svc.publish(BASE, 'admin');
    expect(v1.version).toBe(1);
    expect(v1.supersedes_version).toBeNull();

    const v2 = await svc.publish({ ...BASE, sla_hours_standard: 36 }, 'admin');
    expect(v2.version).toBe(2);
    expect(v2.supersedes_version).toBe(1);
    expect(v2.config.sla_hours_standard).toBe(36);

    const history = await svc.listHistory(BASE.client_id);
    expect(history.map((h) => h.version)).toEqual([2, 1]);
    expect(history.find((h) => h.version === 1)?.config.sla_hours_standard).toBe(48);
    expect(history.find((h) => h.version === 2)?.config.sla_hours_standard).toBe(36);
  });

  it('rejects in-place mutation', () => {
    const svc = new ClientConfigService(new MemoryClientConfigStore(false), () => NOW);
    expect(() => svc.rejectMutation()).toThrow(ClientConfigImmutableError);
  });

  it('rejects invalid fields', async () => {
    const svc = new ClientConfigService(new MemoryClientConfigStore(false), () => NOW);
    await expect(svc.publish({ client_id: 'x' })).rejects.toThrow();
  });
});
