import { randomUUID } from 'crypto';
import { cloneRulesCatalog } from './rules-catalog';
import type {
  AuditEvent,
  AuthRule,
  AuthRuleId,
  CanonicalCase,
} from './types';

export interface CaseSpineStore {
  insertCase(c: CanonicalCase): Promise<CanonicalCase>;
  updateCase(c: CanonicalCase): Promise<CanonicalCase>;
  getCase(caseId: string): Promise<CanonicalCase | null>;
  listCases(): Promise<CanonicalCase[]>;
  insertAudit(event: AuditEvent): Promise<AuditEvent>;
  listAudit(caseId: string): Promise<AuditEvent[]>;
  listRules(): Promise<AuthRule[]>;
  setRuleEnabled(ruleId: AuthRuleId, enabled: boolean): Promise<AuthRule>;
}

export class MemoryCaseSpineStore implements CaseSpineStore {
  private cases = new Map<string, CanonicalCase>();
  private audits: AuditEvent[] = [];
  private rules: AuthRule[];

  constructor(rules = cloneRulesCatalog()) {
    this.rules = rules;
  }

  async insertCase(c: CanonicalCase): Promise<CanonicalCase> {
    const copy = cloneCase(c);
    this.cases.set(copy.case_id, copy);
    return cloneCase(copy);
  }

  async updateCase(c: CanonicalCase): Promise<CanonicalCase> {
    const copy = cloneCase(c);
    this.cases.set(copy.case_id, copy);
    return cloneCase(copy);
  }

  async getCase(caseId: string): Promise<CanonicalCase | null> {
    const found = this.cases.get(caseId);
    return found ? cloneCase(found) : null;
  }

  async listCases(): Promise<CanonicalCase[]> {
    return [...this.cases.values()].map(cloneCase);
  }

  async insertAudit(event: AuditEvent): Promise<AuditEvent> {
    const row = { ...event, event_id: event.event_id || randomUUID() };
    this.audits.push(row);
    return { ...row };
  }

  async listAudit(caseId: string): Promise<AuditEvent[]> {
    return this.audits
      .filter((e) => e.case_id === caseId)
      .sort((a, b) => a.at.localeCompare(b.at))
      .map((e) => ({ ...e }));
  }

  async listConfigAudit(): Promise<AuditEvent[]> {
    return this.audits.filter((e) => e.case_id === null).map((e) => ({ ...e }));
  }

  async listRules(): Promise<AuthRule[]> {
    return cloneRulesCatalog(this.rules);
  }

  async setRuleEnabled(ruleId: AuthRuleId, enabled: boolean): Promise<AuthRule> {
    const rule = this.rules.find((r) => r.rule_id === ruleId);
    if (!rule) {
      throw new Error(`Unknown rule ${ruleId}`);
    }
    rule.enabled = enabled;
    return { ...rule, effects: { ...rule.effects } };
  }

  reset(): void {
    this.cases.clear();
    this.audits = [];
    this.rules = cloneRulesCatalog();
  }
}

function cloneCase(c: CanonicalCase): CanonicalCase {
  return {
    ...c,
    packet_storage_keys: [...c.packet_storage_keys],
    cm_flags: [...c.cm_flags],
    open_tasks: [...c.open_tasks],
    intake: { ...c.intake },
  };
}

let memorySingleton: MemoryCaseSpineStore | null = null;

export function getMemoryCaseSpineStore(): MemoryCaseSpineStore {
  if (!memorySingleton) memorySingleton = new MemoryCaseSpineStore();
  return memorySingleton;
}

export function resetMemoryCaseSpineStore(): MemoryCaseSpineStore {
  memorySingleton = new MemoryCaseSpineStore();
  return memorySingleton;
}
