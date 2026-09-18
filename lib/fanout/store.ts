import { randomUUID } from 'crypto';
import type { CxTask, FanoutAttempt, OutboundIntent } from './types';

export interface FanoutStore {
  insertAttempt(row: FanoutAttempt): Promise<FanoutAttempt>;
  listAttempts(caseId: string): Promise<FanoutAttempt[]>;
  insertCxTask(row: CxTask): Promise<CxTask>;
  listCxTasks(filters?: { case_id?: string; status?: CxTask['status'] }): Promise<CxTask[]>;
  insertIntent(row: OutboundIntent): Promise<OutboundIntent>;
  listIntents(caseId: string): Promise<OutboundIntent[]>;
}

function cloneAttempt(row: FanoutAttempt): FanoutAttempt {
  return { ...row };
}
function cloneTask(row: CxTask): CxTask {
  return { ...row };
}
function cloneIntent(row: OutboundIntent): OutboundIntent {
  return { ...row };
}

export class MemoryFanoutStore implements FanoutStore {
  private attempts: FanoutAttempt[] = [];
  private tasks: CxTask[] = [];
  private intents: OutboundIntent[] = [];

  async insertAttempt(row: FanoutAttempt): Promise<FanoutAttempt> {
    const copy = cloneAttempt({ ...row, attempt_id: row.attempt_id || randomUUID() });
    this.attempts.push(copy);
    return cloneAttempt(copy);
  }

  async listAttempts(caseId: string): Promise<FanoutAttempt[]> {
    return this.attempts.filter((a) => a.case_id === caseId).map(cloneAttempt);
  }

  async insertCxTask(row: CxTask): Promise<CxTask> {
    const copy = cloneTask({ ...row, task_id: row.task_id || randomUUID() });
    this.tasks.push(copy);
    return cloneTask(copy);
  }

  async listCxTasks(filters: { case_id?: string; status?: CxTask['status'] } = {}): Promise<CxTask[]> {
    return this.tasks
      .filter((t) => !filters.case_id || t.case_id === filters.case_id)
      .filter((t) => !filters.status || t.status === filters.status)
      .map(cloneTask);
  }

  async insertIntent(row: OutboundIntent): Promise<OutboundIntent> {
    const copy = cloneIntent({ ...row, intent_id: row.intent_id || randomUUID() });
    this.intents.push(copy);
    return cloneIntent(copy);
  }

  async listIntents(caseId: string): Promise<OutboundIntent[]> {
    return this.intents.filter((i) => i.case_id === caseId).map(cloneIntent);
  }

  reset(): void {
    this.attempts = [];
    this.tasks = [];
    this.intents = [];
  }
}

let memorySingleton: MemoryFanoutStore | null = null;

export function getMemoryFanoutStore(): MemoryFanoutStore {
  if (!memorySingleton) memorySingleton = new MemoryFanoutStore();
  return memorySingleton;
}

export function resetMemoryFanoutStore(): MemoryFanoutStore {
  memorySingleton = new MemoryFanoutStore();
  return memorySingleton;
}
