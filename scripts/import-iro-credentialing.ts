/**
 * Import Thelma's interim credentialing workbook.
 *
 *   npx tsx scripts/import-iro-credentialing.ts --file fixtures/iro/credentialing-workbook.template.csv
 *   npx tsx scripts/import-iro-credentialing.ts --file workbook.xlsx --report /tmp/iro-import.json
 *   npx tsx scripts/import-iro-credentialing.ts --file workbook.csv --apply
 *
 * Default is dry-run: validation report + reconciliation checklist, no writes.
 * --apply upserts valid physicians into the IRO store (memory in demo,
 * RDS/Supabase otherwise). Refuses a file that contains PHI columns.
 * Does not open the cutover gate.
 */
import { mkdirSync, writeFileSync } from 'fs';
import { dirname } from 'path';
import { applyImport, loadWorkbookFile, reconciliationChecklist } from '../lib/iro/import/workbook';

function arg(name: string): string | null {
  const index = process.argv.indexOf(name);
  if (index === -1) return null;
  return process.argv[index + 1] ?? null;
}

async function main() {
  const file = arg('--file');
  if (!file) {
    console.error('Usage: npx tsx scripts/import-iro-credentialing.ts --file <workbook.csv|xlsx> [--report out.json] [--apply]');
    process.exit(1);
  }
  const report = loadWorkbookFile(file);
  const checklist = reconciliationChecklist(report);
  const payload = {
    dry_run: !process.argv.includes('--apply'),
    file,
    rows_read: report.rows_read,
    physicians_valid: report.physicians_valid,
    physicians_invalid: report.physicians_invalid,
    phi_rejected: report.phi_rejected,
    errors: report.errors,
    warnings: report.warnings,
    physician_keys: report.physicians.map((physician) => physician.external_key),
  };
  const reportPath = arg('--report');
  if (reportPath) {
    mkdirSync(dirname(reportPath), { recursive: true });
    writeFileSync(reportPath, JSON.stringify(payload, null, 2));
  }
  console.log(JSON.stringify(payload, null, 2));
  console.log('\n' + checklist);
  if (report.phi_rejected) process.exit(2);
  if (!process.argv.includes('--apply')) return;
  if (process.env.ENABLE_IRO_PANEL !== 'true' || process.env.IRO_LINE_CONTRACT !== 'true') {
    console.error('Refusing --apply until ENABLE_IRO_PANEL=true and IRO_LINE_CONTRACT=true.');
    process.exit(3);
  }
  const applied = await applyImport(report);
  console.log(JSON.stringify({ applied: applied.upserted, cutover_gate: 'unchanged' }));
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
