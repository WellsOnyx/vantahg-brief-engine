import { randomUUID } from 'crypto';
import { readFileSync } from 'fs';
import { IRO_PANEL_STATUSES, type IroPhysician, type IroPanelStatus } from '../types';
import { getIroRepository } from '../repository';
import { readXlsxRows } from './xlsx';

export const WORKBOOK_COLUMNS = [
  'physician_key',
  'display_name',
  'legal_name',
  'email',
  'phone',
  'npi',
  'status',
  'specialties',
  'jurisdictions',
  'availability',
  'license_state',
  'license_number',
  'license_expires_on',
  'psv_date',
  'psv_result',
  'board_name',
  'board_specialty',
  'board_expires_on',
  'oig_screened_on',
  'oig_result',
  'sam_screened_on',
  'sam_result',
  'experience_setting',
  'experience_specialty',
  'experience_started_on',
  'experience_ended_on',
  'direct_patient_care',
  'agreement_confidentiality_on',
  'agreement_conflict_policy_on',
  'agreement_panel_participation_on',
  'contract_ref',
  'outstanding_items',
  'recredential_due_on',
  'evidence_link',
] as const;

const PHI_HEADERS = new Set([
  'ssn',
  'dob',
  'date_of_birth',
  'social_security',
  'member_id',
  'patient_name',
  'patient_dob',
]);

export interface ImportIssue {
  physician_key: string;
  row: number;
  field: string;
  message: string;
  severity: 'error' | 'warning';
}

export interface ImportReport {
  format: 'csv' | 'xlsx';
  rows_read: number;
  physicians_valid: number;
  physicians_invalid: number;
  phi_rejected: boolean;
  errors: ImportIssue[];
  warnings: ImportIssue[];
  physicians: IroPhysician[];
}

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  const src = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ',') {
      row.push(cell);
      cell = '';
    } else if (ch === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else if (ch !== '\r') {
      cell += ch;
    }
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((line) => line.some((value) => value.trim() !== ''));
}

function isDate(value: string): boolean {
  if (!value) return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function splitList(value: string): string[] {
  return value
    .split(/[|;]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function validateWorkbook(table: string[][], format: 'csv' | 'xlsx'): ImportReport {
  const header = (table[0] ?? []).map((cell) => cell.trim().toLowerCase());
  const errors: ImportIssue[] = [];
  const warnings: ImportIssue[] = [];
  const phi = header.find((cell) => PHI_HEADERS.has(cell));
  if (phi) {
    return {
      format,
      rows_read: Math.max(0, table.length - 1),
      physicians_valid: 0,
      physicians_invalid: 0,
      phi_rejected: true,
      errors: [{ physician_key: '', row: 1, field: phi, message: 'Refusing workbook that contains a PHI column. Synthetic credentialing fields only.', severity: 'error' }],
      warnings: [],
      physicians: [],
    };
  }
  for (const required of ['physician_key', 'display_name', 'status', 'specialties']) {
    if (!header.includes(required)) {
      errors.push({ physician_key: '', row: 1, field: required, message: `Missing column ${required}`, severity: 'error' });
    }
  }
  if (errors.length > 0) {
    return {
      format,
      rows_read: Math.max(0, table.length - 1),
      physicians_valid: 0,
      physicians_invalid: 0,
      phi_rejected: false,
      errors,
      warnings,
      physicians: [],
    };
  }

  const index = new Map(header.map((name, i) => [name, i]));
  const grouped = new Map<string, { row: number; cells: string[] }[]>();
  for (let r = 1; r < table.length; r++) {
    const cells = table[r];
    const key = (cells[index.get('physician_key') ?? 0] ?? '').trim();
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push({ row: r + 1, cells });
  }

  const physicians: IroPhysician[] = [];
  let invalid = 0;
  const cell = (cells: string[], name: string) => (cells[index.get(name) ?? -1] ?? '').trim();

  for (const [key, lines] of grouped) {
    const first = lines[0];
    const keyErrors: ImportIssue[] = [];
    if (!key) keyErrors.push({ physician_key: '', row: first.row, field: 'physician_key', message: 'physician_key is required', severity: 'error' });
    const display = cell(first.cells, 'display_name');
    if (!display) keyErrors.push({ physician_key: key, row: first.row, field: 'display_name', message: 'display_name is required', severity: 'error' });
    const statusRaw = cell(first.cells, 'status').toLowerCase();
    if (!(IRO_PANEL_STATUSES as readonly string[]).includes(statusRaw)) {
      keyErrors.push({ physician_key: key, row: first.row, field: 'status', message: `Unknown status ${statusRaw || '(blank)'}`, severity: 'error' });
    }
    const specialties = splitList(cell(first.cells, 'specialties'));
    if (specialties.length === 0) {
      keyErrors.push({ physician_key: key, row: first.row, field: 'specialties', message: 'At least one specialty is required', severity: 'error' });
    }
    for (const line of lines) {
      for (const field of ['license_expires_on', 'psv_date', 'board_expires_on', 'oig_screened_on', 'sam_screened_on', 'experience_started_on', 'experience_ended_on', 'recredential_due_on', 'agreement_confidentiality_on', 'agreement_conflict_policy_on', 'agreement_panel_participation_on']) {
        const value = cell(line.cells, field);
        if (value && !isDate(value)) {
          keyErrors.push({ physician_key: key, row: line.row, field, message: `${field} must be YYYY-MM-DD`, severity: 'error' });
        }
      }
    }
    if (keyErrors.length > 0) {
      invalid += 1;
      errors.push(...keyErrors);
      continue;
    }

    const id = randomUUID();
    const licenses = lines
      .filter((line) => cell(line.cells, 'license_state'))
      .map((line) => ({
        id: randomUUID(),
        state: cell(line.cells, 'license_state').toUpperCase(),
        license_number: cell(line.cells, 'license_number'),
        expires_on: cell(line.cells, 'license_expires_on'),
        status: 'active' as const,
        primary_source_verified_at: cell(line.cells, 'psv_date') || null,
        primary_source_method: cell(line.cells, 'psv_date') ? 'workbook_import' : null,
        primary_source_result: (cell(line.cells, 'psv_result').toLowerCase() || null) as 'clear' | 'hit' | 'inconclusive' | null,
        evidence_storage_key: null,
      }));
    for (const license of licenses) {
      if (!license.license_number || !license.expires_on) {
        warnings.push({
          physician_key: key,
          row: first.row,
          field: 'license_number',
          message: `License ${license.state} is missing number or expiry`,
          severity: 'warning',
        });
      }
      if (!license.primary_source_verified_at) {
        warnings.push({
          physician_key: key,
          row: first.row,
          field: 'psv_date',
          message: `License ${license.state} has no primary-source verification date`,
          severity: 'warning',
        });
      }
    }
    if (!cell(first.cells, 'oig_screened_on')) {
      warnings.push({ physician_key: key, row: first.row, field: 'oig_screened_on', message: 'OIG LEIE screen not recorded', severity: 'warning' });
    }
    if (!cell(first.cells, 'sam_screened_on')) {
      warnings.push({ physician_key: key, row: first.row, field: 'sam_screened_on', message: 'SAM screen not recorded', severity: 'warning' });
    }

    const agreements = (
      [
        ['confidentiality', 'Confidentiality acknowledgment', 'agreement_confidentiality_on'],
        ['conflict_policy', 'Conflict policy acknowledgment', 'agreement_conflict_policy_on'],
        ['panel_participation', 'Panel participation agreement', 'agreement_panel_participation_on'],
      ] as const
    ).map(([type, title, field]) => {
      const on = cell(first.cells, field);
      if (!on) {
        warnings.push({ physician_key: key, row: first.row, field, message: `${title} is outstanding`, severity: 'warning' });
      }
      return {
        id: randomUUID(),
        agreement_type: type,
        title,
        status: on ? ('acknowledged' as const) : ('outstanding' as const),
        acknowledged_at: on || null,
        evidence_storage_key: null,
        evidence_link: type === 'confidentiality' ? cell(first.cells, 'evidence_link') || null : null,
      };
    });

    const outstandingRaw = cell(first.cells, 'outstanding_items');
    const outstanding = outstandingRaw
      ? outstandingRaw.split('|').map((label) => ({
          id: randomUUID(),
          label: label.trim(),
          due_on: null,
          resolved_at: null,
        })).filter((item) => item.label)
      : [];

    const availability = cell(first.cells, 'availability').toLowerCase();
    const physician: IroPhysician = {
      id,
      external_key: key,
      display_name: display,
      legal_name: cell(first.cells, 'legal_name'),
      email: cell(first.cells, 'email'),
      phone: cell(first.cells, 'phone'),
      npi: cell(first.cells, 'npi'),
      status: statusRaw as IroPanelStatus,
      specialties,
      jurisdictions: splitList(cell(first.cells, 'jurisdictions')).map((item) => item.toUpperCase()),
      availability: availability === 'limited' || availability === 'unavailable' ? availability : 'available',
      assignment_status: statusRaw === 'approved' || statusRaw === 'conditional' ? 'assignable' : 'unassigned',
      cv_storage_key: null,
      contract_ref: cell(first.cells, 'contract_ref') || null,
      notes_hr: null,
      board_cert_waiver: null,
      application_received_at: new Date().toISOString().slice(0, 10),
      recredential_due_at: cell(first.cells, 'recredential_due_on') || null,
      approved_at: null,
      approved_expires_at: cell(first.cells, 'recredential_due_on') || null,
      verification_completed_at: null,
      verification_completed_by: null,
      clinical_decision_at: null,
      clinical_decision_by: null,
      clinical_decision_note: null,
      conditional_terms: null,
      licenses,
      board_certifications: cell(first.cells, 'board_name')
        ? [{
            id: randomUUID(),
            board_name: cell(first.cells, 'board_name'),
            specialty: cell(first.cells, 'board_specialty') || specialties[0] || '',
            certified_on: null,
            expires_on: cell(first.cells, 'board_expires_on') || null,
            status: 'active',
            evidence_storage_key: null,
          }]
        : [],
      sanctions: [
        ...sanction('oig_leie', cell(first.cells, 'oig_screened_on'), cell(first.cells, 'oig_result')),
        ...sanction('sam', cell(first.cells, 'sam_screened_on'), cell(first.cells, 'sam_result')),
      ],
      clinical_experience: cell(first.cells, 'experience_setting')
        ? [{
            id: randomUUID(),
            setting: cell(first.cells, 'experience_setting'),
            role_title: 'Imported',
            specialty: cell(first.cells, 'experience_specialty'),
            started_on: cell(first.cells, 'experience_started_on'),
            ended_on: cell(first.cells, 'experience_ended_on') || null,
            direct_patient_care: /^(y|yes|true|1)$/i.test(cell(first.cells, 'direct_patient_care')),
            recency_note: 'Imported from credentialing workbook.',
          }]
        : [],
      agreements,
      outstanding_items: outstanding,
      events: [{
        id: randomUUID(),
        physician_id: id,
        event_type: 'change',
        summary: 'Imported from credentialing workbook',
        actor: 'import',
        created_at: new Date().toISOString(),
      }],
      evidence: [],
    };
    physicians.push(physician);
  }

  return {
    format,
    rows_read: table.length - 1,
    physicians_valid: physicians.length,
    physicians_invalid: invalid,
    phi_rejected: false,
    errors,
    warnings,
    physicians,
  };
}

function sanction(
  source: 'oig_leie' | 'sam',
  screenedOn: string,
  result: string,
): IroPhysician['sanctions'] {
  if (!screenedOn) return [];
  const normalized = result.toLowerCase();
  const value = normalized === 'hit' || normalized === 'inconclusive' ? normalized : 'clear';
  return [{
    id: randomUUID(),
    source,
    screened_at: screenedOn,
    result: value,
    finding_summary: `${source} result ${value} imported from workbook (no live API)`,
    evidence_storage_key: null,
    live_call: false,
  }];
}

export function loadWorkbook(bytes: Buffer, filename: string): ImportReport {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.xlsx')) {
    return validateWorkbook(readXlsxRows(bytes), 'xlsx');
  }
  return validateWorkbook(parseCsv(bytes.toString('utf8')), 'csv');
}

export function loadWorkbookFile(path: string): ImportReport {
  return loadWorkbook(readFileSync(path), path);
}

export function reconciliationChecklist(report: ImportReport): string {
  const licenseCount = report.physicians.reduce((sum, physician) => sum + physician.licenses.length, 0);
  const sanctionCount = report.physicians.reduce((sum, physician) => sum + physician.sanctions.length, 0);
  const evidenceLinks = report.physicians.reduce(
    (sum, physician) => sum + physician.agreements.filter((row) => row.evidence_link).length,
    0,
  );
  return [
    '# IRO credentialing reconciliation',
    '',
    'Cutover stays closed until every box is confirmed. Workbook import does not by itself make the portal the system of record.',
    '',
    `- [ ] Workspace tested on synthetic data (${report.physicians_valid} valid physician${report.physicians_valid === 1 ? '' : 's'}, ${report.physicians_invalid} invalid)`,
    `- [ ] Transferred records checked against the workbook (${report.rows_read} data rows, ${licenseCount} license rows, ${sanctionCount} screening rows)`,
    `- [ ] Evidence links or restricted-folder paths accounted for (${evidenceLinks} evidence links on this file)`,
    '- [ ] Access permissions confirmed: credentialing_admin sees HR records; clinical_approver signs panel approval; front-line assignment omits HR fields',
    '- [ ] clinical_approver is assigned only after the Medical Director is appointed',
    `- [ ] PHI rejection: ${report.phi_rejected ? 'FILE REJECTED' : 'no PHI columns detected'}`,
    report.errors.length ? `- [ ] Validation errors resolved (${report.errors.length})` : '- [x] No blocking validation errors on this file',
    report.warnings.length ? `- [ ] Warnings reviewed (${report.warnings.length})` : '- [x] No warnings on this file',
    '- [ ] Cutover gate opened only after workspace_tested, transferred_records_checked, and access_permissions_confirmed',
    '',
  ].join('\n');
}

export async function applyImport(report: ImportReport): Promise<{ upserted: number }> {
  if (report.phi_rejected) throw new Error('phi_rejected');
  const repository = getIroRepository();
  let upserted = 0;
  for (const physician of report.physicians) {
    const existing = await repository.getPhysician(physician.external_key);
    if (existing) {
      physician.id = existing.id;
      physician.events = [
        ...existing.events,
        ...physician.events.map((row) => ({ ...row, physician_id: existing.id })),
      ];
    }
    await repository.savePhysician(physician);
    upserted += 1;
  }
  return { upserted };
}
