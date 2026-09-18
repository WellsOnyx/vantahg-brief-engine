import type {
  AuthWorkflowType,
  CanonicalCase,
  DenyReasonCode,
  SlaStatus,
  SpineDetermination,
} from '@/lib/case-spine/types';
import type { BillableEvent } from '@/lib/billing/events';

export const REPORT_KINDS = [
  'volume',
  'turnaround',
  'outcomes',
  'deny_reasons',
  'sla',
] as const;
export type ReportKind = (typeof REPORT_KINDS)[number];

export const VOLUME_GRAINS = ['day', 'week'] as const;
export type VolumeGrain = (typeof VOLUME_GRAINS)[number];

export const VOLUME_CSV_COLUMNS = [
  'period',
  'grain',
  'received',
  'signed',
  'open',
  'ledger_signed',
] as const;

export const TURNAROUND_CSV_COLUMNS = [
  'case_id',
  'case_number',
  'type',
  'received_at',
  'determined_at',
  'hours',
] as const;

export const OUTCOMES_CSV_COLUMNS = [
  'case_id',
  'case_number',
  'type',
  'determination',
] as const;

export const DENY_REASONS_CSV_COLUMNS = [
  'case_id',
  'case_number',
  'deny_reason_code',
] as const;

export const SLA_CSV_COLUMNS = [
  'case_id',
  'case_number',
  'sla_status',
] as const;

export const REPORT_CSV_COLUMNS: Record<ReportKind, readonly string[]> = {
  volume: VOLUME_CSV_COLUMNS,
  turnaround: TURNAROUND_CSV_COLUMNS,
  outcomes: OUTCOMES_CSV_COLUMNS,
  deny_reasons: DENY_REASONS_CSV_COLUMNS,
  sla: SLA_CSV_COLUMNS,
};

export interface ReportFilters {
  client_id?: string | null;
  from?: string | null;
  to?: string | null;
  lob?: string | null;
  type?: AuthWorkflowType | null;
  grain?: VolumeGrain;
}

export interface VolumeRow {
  period: string;
  grain: VolumeGrain;
  received: number;
  signed: number;
  open: number;
  ledger_signed: number;
}

export interface TurnaroundRow {
  case_id: string;
  case_number: string;
  type: AuthWorkflowType;
  received_at: string;
  determined_at: string;
  hours: number;
}

export interface OutcomeRow {
  case_id: string;
  case_number: string;
  type: AuthWorkflowType;
  determination: SpineDetermination;
}

export interface DenyReasonRow {
  case_id: string;
  case_number: string;
  deny_reason_code: DenyReasonCode;
}

export interface SlaRow {
  case_id: string;
  case_number: string;
  sla_status: SlaStatus;
}

export interface VolumeReport {
  kind: 'volume';
  grain: VolumeGrain;
  rows: VolumeRow[];
  totals: { received: number; signed: number; open: number; ledger_signed: number };
  ledger_match: boolean;
}

export interface TurnaroundReport {
  kind: 'turnaround';
  rows: TurnaroundRow[];
  p50_hours: number | null;
  p90_hours: number | null;
}

export interface OutcomesReport {
  kind: 'outcomes';
  rows: OutcomeRow[];
  rates: Record<SpineDetermination, number>;
  counts: Record<SpineDetermination, number>;
}

export interface DenyReasonsReport {
  kind: 'deny_reasons';
  rows: DenyReasonRow[];
  counts: Record<string, number>;
}

export interface SlaReport {
  kind: 'sla';
  rows: SlaRow[];
  counts: { hit: number; miss: number; at_risk: number };
}

export type ClientReport =
  | VolumeReport
  | TurnaroundReport
  | OutcomesReport
  | DenyReasonsReport
  | SlaReport;

export interface ReportBundle {
  client_id: string | null;
  filters: ReportFilters;
  volume: VolumeReport;
  turnaround: TurnaroundReport;
  outcomes: OutcomesReport;
  deny_reasons: DenyReasonsReport;
  sla: SlaReport;
  ledger_signed: number;
  signed_cases: number;
}

export interface ReportSource {
  cases: CanonicalCase[];
  ledger: BillableEvent[];
}
