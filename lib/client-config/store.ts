import { randomUUID } from 'crypto';
import { SYNTHETIC_CLIENT_ID } from '@/lib/intake/constants';
import type { ClientConfigFields, ClientConfigVersion } from './types';

export interface ClientConfigStore {
  insertVersion(row: ClientConfigVersion): Promise<ClientConfigVersion>;
  listVersions(clientId: string): Promise<ClientConfigVersion[]>;
  listLatest(): Promise<ClientConfigVersion[]>;
  getLatest(clientId: string): Promise<ClientConfigVersion | null>;
}

function cloneVersion(row: ClientConfigVersion): ClientConfigVersion {
  return {
    ...row,
    config: {
      ...row.config,
      lob: [...row.config.lob],
      notify_channels: [...row.config.notify_channels],
      determination_recipients: [...row.config.determination_recipients],
      cm_webhook_url: row.config.cm_webhook_url ?? null,
      cm_webhook_secret: row.config.cm_webhook_secret ?? null,
      determination_webhook_url: row.config.determination_webhook_url ?? null,
      determination_webhook_secret: row.config.determination_webhook_secret ?? null,
      intake_modes: [...row.config.intake_modes],
      business_hours: {
        ...row.config.business_hours,
        days: [...row.config.business_hours.days],
      },
      escalation_contacts: row.config.escalation_contacts.map((c) => ({ ...c })),
      go_live_mode: row.config.go_live_mode ?? 'synthetic',
      shadow_mode: row.config.shadow_mode ?? false,
      sla_miss_rollback_threshold: row.config.sla_miss_rollback_threshold ?? 0.2,
      vanta_med_review_contract: row.config.vanta_med_review_contract ?? false,
      med_review_provider: row.config.med_review_provider ?? 'none',
    },
  };
}

function seedSyntheticV1(): ClientConfigVersion {
  const config: ClientConfigFields = {
    client_id: SYNTHETIC_CLIENT_ID,
    legal_name: 'Synthetic Staging TPA',
    lob: ['medical'],
    sla_hours_standard: 72,
    sla_hours_urgent: 24,
    auto_vs_md_policy: 'always_md',
    notify_channels: ['portal'],
    determination_recipients: ['client_admin'],
    cm_handoff_enabled: false,
    cm_webhook_url: null,
    cm_webhook_secret: null,
    determination_webhook_url: null,
    determination_webhook_secret: null,
    intake_modes: ['gravity_rail', 'api', 'fax'],
    timezone: 'America/New_York',
    business_hours: { start: '09:00', end: '17:00', days: ['mon', 'tue', 'wed', 'thu', 'fri'] },
    escalation_contacts: [{ name: 'CX staging', role: 'cx_owner', email: 'cx-synth@example.com' }],
    cx_owner: 'cx_synth_001',
    reviewer_queue: 'med_review_synth',
    go_live_mode: 'synthetic',
    shadow_mode: false,
    sla_miss_rollback_threshold: 0.2,
    // Synthetic staging is Vanta's own shop — Brief Engine included.
    vanta_med_review_contract: true,
    med_review_provider: 'vanta',
  };
  return {
    id: randomUUID(),
    client_id: SYNTHETIC_CLIENT_ID,
    version: 1,
    config,
    created_at: '2026-09-18T00:00:00.000Z',
    created_by: 'system:seed',
    supersedes_version: null,
  };
}

export class MemoryClientConfigStore implements ClientConfigStore {
  private versions: ClientConfigVersion[] = [];

  constructor(seed = true) {
    if (seed) this.versions.push(seedSyntheticV1());
  }

  async insertVersion(row: ClientConfigVersion): Promise<ClientConfigVersion> {
    const copy = cloneVersion(row);
    this.versions.push(copy);
    return cloneVersion(copy);
  }

  async listVersions(clientId: string): Promise<ClientConfigVersion[]> {
    return this.versions
      .filter((v) => v.client_id === clientId)
      .sort((a, b) => b.version - a.version)
      .map(cloneVersion);
  }

  async getLatest(clientId: string): Promise<ClientConfigVersion | null> {
    const list = await this.listVersions(clientId);
    return list[0] ?? null;
  }

  async listLatest(): Promise<ClientConfigVersion[]> {
    const byClient = new Map<string, ClientConfigVersion>();
    for (const row of this.versions) {
      const current = byClient.get(row.client_id);
      if (!current || row.version > current.version) {
        byClient.set(row.client_id, row);
      }
    }
    return [...byClient.values()].map(cloneVersion);
  }

  reset(): void {
    this.versions = [seedSyntheticV1()];
  }
}

let memorySingleton: MemoryClientConfigStore | null = null;

export function getMemoryClientConfigStore(): MemoryClientConfigStore {
  if (!memorySingleton) memorySingleton = new MemoryClientConfigStore();
  return memorySingleton;
}

export function resetMemoryClientConfigStore(): MemoryClientConfigStore {
  memorySingleton = new MemoryClientConfigStore();
  return memorySingleton;
}
