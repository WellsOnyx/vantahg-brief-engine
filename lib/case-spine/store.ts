import { randomUUID } from 'crypto';
import { cloneRulesCatalog } from './rules-catalog';
import { PackageImmutableError } from './types';
import type {
  AuditEvent,
  AuthRule,
  AuthRuleId,
  CanonicalCase,
  DeterminationPackage,
  SpineBrief,
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
  insertBrief(brief: SpineBrief): Promise<SpineBrief>;
  getBrief(briefId: string): Promise<SpineBrief | null>;
  getBriefForCase(caseId: string): Promise<SpineBrief | null>;
  insertPackage(pkg: DeterminationPackage): Promise<DeterminationPackage>;
  getPackage(caseId: string, version?: number): Promise<DeterminationPackage | null>;
  listPackages(caseId: string): Promise<DeterminationPackage[]>;
}

export class MemoryCaseSpineStore implements CaseSpineStore {
  private cases = new Map<string, CanonicalCase>();
  private audits: AuditEvent[] = [];
  private rules: AuthRule[];
  private briefs = new Map<string, SpineBrief>();
  private packages: DeterminationPackage[] = [];

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

  async insertBrief(brief: SpineBrief): Promise<SpineBrief> {
    const copy = cloneBrief(brief);
    this.briefs.set(copy.brief_id, copy);
    return cloneBrief(copy);
  }

  async getBrief(briefId: string): Promise<SpineBrief | null> {
    const found = this.briefs.get(briefId);
    return found ? cloneBrief(found) : null;
  }

  async getBriefForCase(caseId: string): Promise<SpineBrief | null> {
    const found = [...this.briefs.values()].find((b) => b.case_id === caseId);
    return found ? cloneBrief(found) : null;
  }

  async insertPackage(pkg: DeterminationPackage): Promise<DeterminationPackage> {
    const exists = this.packages.some((p) => p.case_id === pkg.case_id && p.version === pkg.version);
    if (exists) {
      throw new PackageImmutableError(pkg.case_id, pkg.version);
    }
    const copy = clonePackage(pkg);
    this.packages.push(copy);
    return clonePackage(copy);
  }

  async getPackage(caseId: string, version?: number): Promise<DeterminationPackage | null> {
    const matches = this.packages.filter((p) => p.case_id === caseId);
    if (matches.length === 0) return null;
    if (version != null) {
      const found = matches.find((p) => p.version === version);
      return found ? clonePackage(found) : null;
    }
    const latest = matches.reduce((a, b) => (a.version >= b.version ? a : b));
    return clonePackage(latest);
  }

  async listPackages(caseId: string): Promise<DeterminationPackage[]> {
    return this.packages
      .filter((p) => p.case_id === caseId)
      .sort((a, b) => a.version - b.version)
      .map(clonePackage);
  }

  reset(): void {
    this.cases.clear();
    this.audits = [];
    this.rules = cloneRulesCatalog();
    this.briefs.clear();
    this.packages = [];
  }
}

function cloneBrief(b: SpineBrief): SpineBrief {
  return {
    ...b,
    content: structuredClone(b.content),
  };
}

function clonePackage(p: DeterminationPackage): DeterminationPackage {
  return {
    ...p,
    evidence_manifest: {
      packet_storage_keys: [...p.evidence_manifest.packet_storage_keys],
      hashes: { ...p.evidence_manifest.hashes },
    },
    cm_flags: [...p.cm_flags],
    session_refs: { ...p.session_refs },
    criteria_snapshot: p.criteria_snapshot ? structuredClone(p.criteria_snapshot) : null,
  };
}

function cloneCase(c: CanonicalCase): CanonicalCase {
  return {
    ...c,
    packet_storage_keys: [...c.packet_storage_keys],
    cm_flags: [...c.cm_flags],
    open_tasks: [...c.open_tasks],
    intake: { ...c.intake },
    fanout_stub: c.fanout_stub
      ? {
          ...c.fanout_stub,
          targets: [...c.fanout_stub.targets],
        }
      : null,
    billable_event_stub: c.billable_event_stub ? { ...c.billable_event_stub } : null,
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
