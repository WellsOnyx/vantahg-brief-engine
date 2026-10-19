import { projectCredentialStatus } from '../credentialing';
import type { CredentialStatus, PanelActivation } from '../types';
import type {
  CredentialingService,
  EmrAdapter,
  IroStorageAdapter,
  MailingAdapter,
  PhoneLineAdapter,
  StoredOriginal,
} from './types';

export function stubEmrAdapter(): EmrAdapter {
  return {
    vendor: null,
    live_call: false,
    decision: 'a',
    pull() {
      return { configured: false, live_call: false, records: [] };
    },
  };
}

export function stubMailingAdapter(now: () => string = () => new Date().toISOString()): MailingAdapter & {
  sent: { case_id: string; channel: 'regular' | 'certified'; to_ref: string }[];
} {
  const sent: { case_id: string; channel: 'regular' | 'certified'; to_ref: string }[] = [];
  return {
    vendor: null,
    live_call: false,
    decision: 'c',
    sent,
    send(input) {
      sent.push(input);
      return {
        ok: true,
        live_call: false,
        vendor: null,
        delivered: true,
        manual_fallback: true,
        channel: input.channel,
        at: now(),
      };
    },
  };
}

export function stubPhoneAdapter(): PhoneLineAdapter & { messages: ReturnType<PhoneLineAdapter['logMessage']>[] } {
  const messages: ReturnType<PhoneLineAdapter['logMessage']>[] = [];
  return {
    vendor: null,
    live_call: false,
    decision: 'd',
    messages,
    logMessage(input) {
      const row = {
        id: `call-${messages.length + 1}`,
        case_id: input.case_id,
        escalated: input.urgent,
        live_call: false as const,
        vendor: null,
      };
      messages.push(row);
      return row;
    },
  };
}

export function stubStorageAdapter(): IroStorageAdapter & { objects: StoredOriginal[] } {
  const objects: StoredOriginal[] = [];
  return {
    vendor: null,
    live_call: false,
    decision: 'e',
    objects,
    putOriginal(input) {
      if (objects.some((row) => row.key === input.key && row.revision === 0)) {
        return { ok: false, code: 'immutable_original' };
      }
      const object: StoredOriginal = { ...input, revision: 0 };
      objects.push(object);
      return { ok: true, object };
    },
    putRevision(input) {
      const original = objects.find((row) => row.key === input.key && row.revision === 0);
      if (!original) return { ok: false, code: 'original_missing' };
      const revision = objects.filter((row) => row.key === input.key).length;
      const object: StoredOriginal = { ...input, revision };
      objects.push(object);
      return { ok: true, object };
    },
  };
}

export interface CredentialSeed {
  status: CredentialStatus & Record<string, unknown>;
  panel: PanelActivation | null;
}

export function stubCredentialingService(
  seed: Record<string, CredentialSeed>,
): CredentialingService {
  return {
    vendor: null,
    live_call: false,
    decision: 'f',
    readStatus(physicianId) {
      const row = seed[physicianId];
      if (!row) return null;
      return projectCredentialStatus(row.status);
    },
    readPanelActivation(physicianId) {
      return seed[physicianId]?.panel ?? null;
    },
  };
}

export function assertNoLiveVendor(adapter: { vendor: null; live_call: false }): boolean {
  return adapter.vendor === null && adapter.live_call === false;
}
