import { randomUUID } from 'crypto';
import { logAuditEvent } from '@/lib/audit';
import { parseClientConfigFields } from './validate';
import type { ClientConfigStore } from './store';
import {
  ClientConfigImmutableError,
  ClientConfigNotFoundError,
  type ClientConfigFields,
  type ClientConfigVersion,
} from './types';
import { requireUmBriefEngineAccess, resolveUmBriefEngineAccessForClient } from './um-access';

export class ClientConfigService {
  constructor(
    private readonly store: ClientConfigStore,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async getLatest(clientId: string): Promise<ClientConfigVersion | null> {
    return this.store.getLatest(clientId);
  }

  async requireLatest(clientId: string): Promise<ClientConfigVersion> {
    const found = await this.store.getLatest(clientId);
    if (!found) throw new ClientConfigNotFoundError(clientId);
    return found;
  }

  async listHistory(clientId: string): Promise<ClientConfigVersion[]> {
    return this.store.listVersions(clientId);
  }

  async listLatest(): Promise<ClientConfigVersion[]> {
    return this.store.listLatest();
  }

  /**
   * Append-only. Never mutates an existing version row.
   * Passing `version` on the input is ignored — the server assigns next.
   */
  async publish(input: unknown, actor = 'system'): Promise<ClientConfigVersion> {
    const fields = parseClientConfigFields(input) as ClientConfigFields;
    const current = await this.store.getLatest(fields.client_id);
    const nextVersion = (current?.version ?? 0) + 1;
    const row: ClientConfigVersion = {
      id: randomUUID(),
      client_id: fields.client_id,
      version: nextVersion,
      config: fields,
      created_at: this.now().toISOString(),
      created_by: actor,
      supersedes_version: current?.version ?? null,
    };
    const saved = await this.store.insertVersion(row);
    await logAuditEvent(null, 'client_config_version_published', actor, {
      client_id: saved.client_id,
      version: saved.version,
      supersedes_version: saved.supersedes_version,
      sla_hours_standard: saved.config.sla_hours_standard,
      sla_hours_urgent: saved.config.sla_hours_urgent,
      intake_modes: saved.config.intake_modes,
    });
    return saved;
  }

  rejectMutation(): never {
    throw new ClientConfigImmutableError();
  }

  /** Packaging lock: free UM Brief Engine only with a Vanta med-review contract. */
  async requireUmBriefEngineAccess(clientId: string): Promise<ClientConfigFields> {
    return requireUmBriefEngineAccess(this.store, clientId);
  }

  async resolveUmBriefEngineAccess(clientId: string) {
    return resolveUmBriefEngineAccessForClient(this.store, clientId);
  }
}
