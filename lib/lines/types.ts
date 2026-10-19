/**
 * Three firewalled lines under Vanta HG.
 * The brief engine is shared infrastructure and is not a fourth line.
 * IDR, IRO, and Medical Review cases, records, workflows, and reports
 * never cross these tags. Open decision (b) can later split the deploy;
 * the tags and the server-side check stay the same.
 */

export const VANTA_HG_COMPANY = 'VANTA_HG' as const;

export const LINES_OF_BUSINESS = ['IDR', 'IRO', 'MEDICAL_REVIEW'] as const;
export type LineOfBusiness = (typeof LINES_OF_BUSINESS)[number];

export type LineRecordKind = 'case' | 'record' | 'workflow' | 'report' | 'export' | 'search';

export type LineOperation = 'read' | 'write' | 'report' | 'export' | 'search';

/** Every persisted object that can hold line data carries both tags. */
export interface LineTag {
  company: typeof VANTA_HG_COMPANY;
  line_of_business: LineOfBusiness;
}

export interface LineScopedRecord extends LineTag {
  id: string;
  /** Case this row belongs to. Reports use the case id they would expose. */
  case_id: string;
  kind: LineRecordKind;
}

export interface LineActor {
  id: string;
  companies: readonly string[];
  lines: readonly LineOfBusiness[];
  /** When true, the actor must also be assigned to the case. */
  case_restricted: boolean;
  assigned_case_ids: readonly string[];
  /** Team-lead oversight: every case on an entitled line, still never another line. */
  line_wide: boolean;
}

export interface FirewallAuditEvent {
  type: 'line_access_denied';
  at: string;
  actor_id: string;
  record_id: string;
  case_id: string;
  op: LineOperation;
  code: 'cross_line' | 'cross_company' | 'case_not_assigned';
  actor_lines: readonly LineOfBusiness[];
  record_line: LineOfBusiness;
}

export interface LineAccessAllowed {
  allowed: true;
  code: 'allowed';
}

export interface LineAccessDenied {
  allowed: false;
  code: 'cross_line' | 'cross_company' | 'case_not_assigned';
  message: string;
}

export type LineAccessDecision = LineAccessAllowed | LineAccessDenied;
