/**
 * Go-live log + last pack results. Memory-backed — synthetic only.
 */

import { randomUUID } from 'crypto';
import type { GoLiveLogEntry, GoLiveLogKind, LiveHypercareEvaluation, PackRunResult } from './types';

export class MemoryGoLiveStore {
  private log: GoLiveLogEntry[] = [];
  private packs = new Map<string, { synthetic?: PackRunResult; shadow?: PackRunResult }>();
  private evals = new Map<string, LiveHypercareEvaluation>();
  private extraHypercare = new Map<string, Set<string>>();

  appendLog(entry: Omit<GoLiveLogEntry, 'entry_id'> & { entry_id?: string }): GoLiveLogEntry {
    const row: GoLiveLogEntry = {
      ...entry,
      entry_id: entry.entry_id || randomUUID(),
      payload: entry.payload ? { ...entry.payload } : undefined,
    };
    this.log.push(row);
    return { ...row };
  }

  listLog(clientId: string): GoLiveLogEntry[] {
    return this.log.filter((e) => e.client_id === clientId).map((e) => ({ ...e }));
  }

  recordPack(result: PackRunResult): void {
    const current = this.packs.get(result.client_id) ?? {};
    if (result.pack === 'synthetic') current.synthetic = result;
    else current.shadow = result;
    this.packs.set(result.client_id, current);
  }

  lastPack(clientId: string, pack: 'synthetic' | 'shadow'): PackRunResult | null {
    return this.packs.get(clientId)?.[pack] ?? null;
  }

  recordEval(evalResult: LiveHypercareEvaluation): void {
    this.evals.set(evalResult.client_id, evalResult);
  }

  lastEval(clientId: string): LiveHypercareEvaluation | null {
    return this.evals.get(clientId) ?? null;
  }

  markHypercare(clientId: string, itemIds: string[]): void {
    const set = this.extraHypercare.get(clientId) ?? new Set<string>();
    for (const id of itemIds) set.add(id);
    this.extraHypercare.set(clientId, set);
  }

  hypercareDoneIds(clientId: string): string[] {
    return [...(this.extraHypercare.get(clientId) ?? [])];
  }

  hasKind(clientId: string, kind: GoLiveLogKind): boolean {
    return this.log.some((e) => e.client_id === clientId && e.kind === kind);
  }

  reset(): void {
    this.log = [];
    this.packs.clear();
    this.evals.clear();
    this.extraHypercare.clear();
  }
}

let singleton: MemoryGoLiveStore | null = null;

export function getMemoryGoLiveStore(): MemoryGoLiveStore {
  if (!singleton) singleton = new MemoryGoLiveStore();
  return singleton;
}

export function resetMemoryGoLiveStore(): MemoryGoLiveStore {
  singleton = new MemoryGoLiveStore();
  return singleton;
}
