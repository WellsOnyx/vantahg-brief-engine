/**
 * In-memory A–E checklist progress. Demo / test SoR — no live PHI.
 */

import { ONBOARDING_CHECKLIST, type OnboardingChecklistItem } from './checklist';

export interface ChecklistProgressItem extends OnboardingChecklistItem {
  done: boolean;
  done_at: string | null;
  done_by: string | null;
}

export interface OnboardingProgress {
  client_id: string;
  items: ChecklistProgressItem[];
  done: number;
  remaining: number;
  required_remaining: number;
  phases: Record<string, { done: number; total: number; required_remaining: number }>;
}

export interface OnboardingProgressStore {
  getDone(clientId: string): Map<string, { at: string; by: string }>;
  mark(clientId: string, itemId: string, done: boolean, actor: string, now: Date): void;
  reset(clientId?: string): void;
}

export class MemoryOnboardingProgressStore implements OnboardingProgressStore {
  private byClient = new Map<string, Map<string, { at: string; by: string }>>();

  getDone(clientId: string): Map<string, { at: string; by: string }> {
    return new Map(this.byClient.get(clientId) ?? []);
  }

  mark(clientId: string, itemId: string, done: boolean, actor: string, now: Date): void {
    let row = this.byClient.get(clientId);
    if (!row) {
      row = new Map();
      this.byClient.set(clientId, row);
    }
    if (done) row.set(itemId, { at: now.toISOString(), by: actor });
    else row.delete(itemId);
  }

  reset(clientId?: string): void {
    if (clientId) this.byClient.delete(clientId);
    else this.byClient.clear();
  }
}

let progressSingleton: MemoryOnboardingProgressStore | null = null;

export function getOnboardingProgressStore(): MemoryOnboardingProgressStore {
  if (!progressSingleton) progressSingleton = new MemoryOnboardingProgressStore();
  return progressSingleton;
}

export function resetOnboardingProgressStore(): MemoryOnboardingProgressStore {
  progressSingleton = new MemoryOnboardingProgressStore();
  return progressSingleton;
}

export function buildOnboardingProgress(
  clientId: string,
  store: OnboardingProgressStore = getOnboardingProgressStore(),
): OnboardingProgress {
  const doneMap = store.getDone(clientId);
  const items: ChecklistProgressItem[] = ONBOARDING_CHECKLIST.map((item) => {
    const marked = doneMap.get(item.id);
    return {
      ...item,
      done: Boolean(marked),
      done_at: marked?.at ?? null,
      done_by: marked?.by ?? null,
    };
  });
  const phases: OnboardingProgress['phases'] = {};
  for (const item of items) {
    const bucket = phases[item.phase] ?? { done: 0, total: 0, required_remaining: 0 };
    bucket.total += 1;
    if (item.done) bucket.done += 1;
    if (item.required && !item.done) bucket.required_remaining += 1;
    phases[item.phase] = bucket;
  }
  return {
    client_id: clientId,
    items,
    done: items.filter((i) => i.done).length,
    remaining: items.filter((i) => !i.done).length,
    required_remaining: items.filter((i) => i.required && !i.done).length,
    phases,
  };
}
