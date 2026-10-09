import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import { loadWorkbook, loadWorkbookFile, parseCsv, reconciliationChecklist } from '@/lib/iro/import/workbook';
import { writeSimpleXlsx } from '@/lib/iro/import/xlsx';
import { WORKBOOK_COLUMNS } from '@/lib/iro/import/workbook';

const template = join(process.cwd(), 'fixtures/iro/credentialing-workbook.template.csv');

describe('credentialing workbook import', () => {
  it('validates the CSV template and prints a reconciliation checklist', () => {
    const report = loadWorkbookFile(template);
    expect(report.phi_rejected).toBe(false);
    expect(report.physicians_valid).toBe(2);
    expect(report.physicians_invalid).toBe(0);
    expect(report.errors).toEqual([]);
    expect(report.warnings.some((row) => row.field === 'oig_screened_on')).toBe(true);
    expect(report.physicians[0].contract_ref).toBe('SYN-HR-CONTRACT-ADA');
    expect(report.physicians[0].licenses[0].license_number).toBe('TX-SYN-44021');
    const checklist = reconciliationChecklist(report);
    expect(checklist).toContain('Workspace tested');
    expect(checklist).toContain('Transferred records checked');
    expect(checklist).toContain('Access permissions confirmed');
    expect(checklist).toContain('Cutover gate opened only after');
    const header = parseCsv(readFileSync(template, 'utf8'))[0];
    expect(header).toEqual([...WORKBOOK_COLUMNS]);
  });

  it('rejects a workbook that carries PHI columns', () => {
    const report = loadWorkbook(Buffer.from('physician_key,display_name,ssn\na,Ada,123-45-6789\n'), 'phi.csv');
    expect(report.phi_rejected).toBe(true);
    expect(report.physicians).toEqual([]);
  });

  it('reads an xlsx sheet and reports an invalid status', () => {
    const header = ['physician_key', 'display_name', 'status', 'specialties'];
    const bytes = writeSimpleXlsx([
      header,
      ['bad-row', 'Example MD', 'not-a-status', 'neurology'],
      ['good-row', 'Example Two MD', 'applicant', 'neurology'],
    ]);
    const report = loadWorkbook(bytes, 'panel.xlsx');
    expect(report.format).toBe('xlsx');
    expect(report.physicians_invalid).toBe(1);
    expect(report.physicians_valid).toBe(1);
    expect(report.physicians[0].external_key).toBe('good-row');
  });
});
