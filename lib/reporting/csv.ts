import {
  REPORT_CSV_COLUMNS,
  type ClientReport,
  type ReportKind,
} from './types';

function csvEscape(value: unknown): string {
  const raw = value == null ? '' : String(value);
  if (/[",\n\r]/.test(raw)) return `"${raw.replace(/"/g, '""')}"`;
  return raw;
}

export function reportToCsv(report: ClientReport): string {
  const columns = REPORT_CSV_COLUMNS[report.kind];
  const header = columns.join(',');
  const lines = report.rows.map((row) =>
    columns.map((col) => csvEscape((row as unknown as Record<string, unknown>)[col])).join(','),
  );
  return [header, ...lines].join('\n');
}

export function csvColumnsFor(kind: ReportKind): readonly string[] {
  return REPORT_CSV_COLUMNS[kind];
}

export function parseCsvHeader(csv: string): string[] {
  const first = csv.split(/\r?\n/)[0] ?? '';
  return first.split(',').map((c) => c.trim());
}
