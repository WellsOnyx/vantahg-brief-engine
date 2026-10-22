import { spawnSync } from 'node:child_process';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { scoreVhgCase } from '@/lib/vhg/score';
import { loadCmsFeatureRates } from '@/lib/vhg/cms/rates';
import type { VhgScoreInput } from '@/lib/vhg/types';

const ROOT = process.cwd();

const TRAINING_FILES = [
  'lib/vhg/score.ts',
  'lib/vhg/cms/model.ts',
  'lib/vhg/cms/rates.ts',
  'scripts/cms-idr/aggregate_public.py',
  'scripts/cms-idr/derive_public_idr.py',
  'scripts/cms-idr/fetch_public_idr.py',
  'scripts/cms-idr/catalog.py',
];

const OUTPUT_PATHS = [
  'data/cms-idr/derived/feature-rates.json',
  'data/cms-idr/manifest.json',
  'lib/vhg/score.ts',
  'lib/vhg/cms',
  'components/vhg',
];

/** Names that must never appear in score output, UI, or the derived table. */
const NAMED_PARTIES = [
  'iMPROve',
  'Federal Hearings',
  'Island Peer Review',
  'HaloMD',
  'Team Health',
  'Radiology Partners',
];

const PRIVATE_INPUTS = [
  'synthetic-idr',
  'getSyntheticIdrRecords',
  'getRedactedIdrPatterns',
  'idr-patterns.redacted',
  'demo-data',
  "from('cases')",
  'payer_idr',
  's3://',
  'efax-documents',
  'DATABASE_URL',
  'idr_external_outcomes',
  'supabase',
];

function walk(dir: string): string[] {
  const full = path.join(ROOT, dir);
  if (!statSync(full).isDirectory()) return [full];
  const out: string[] = [];
  for (const entry of readdirSync(full)) {
    const child = path.join(full, entry);
    if (statSync(child).isDirectory()) out.push(...walk(path.relative(ROOT, child)));
    else out.push(child);
  }
  return out;
}

function outputText(): string {
  return OUTPUT_PATHS.flatMap((entry) => walk(entry)).map((file) => readFileSync(file, 'utf8')).join('\n');
}

const base: VhgScoreInput = {
  network_status: 'out_of_network',
  specialty: 'emergency_medicine',
  cpt: '99285',
  service_line: 'Emergency medicine',
  billed_amount: 8400,
  qpa_amount: 980,
  state: 'TX',
  facility_type: 'freestanding_er',
  encounter: 'emergency',
};

describe('CMS public IDR ingestion', () => {
  it('parses a fixture file and drops dispute numbers, PHI, and entity names', () => {
    const result = spawnSync(
      'python3',
      [
        'scripts/cms-idr/derive_public_idr.py',
        '--fixture',
        '__tests__/fixtures/cms-idr/mini.csv',
        '--stdout',
        '--min-entity-n',
        '1',
      ],
      { cwd: ROOT, encoding: 'utf8' },
    );
    expect(result.status).toBe(0);
    const rates = JSON.parse(result.stdout);
    expect(rates.data_source).toBe('CMS public IDR PUF');
    expect(rates.line_items).toBe(5);
    expect(rates.service_codes.find((row: { code: string }) => row.code === '99285').provider_prevailing_n).toBe(2);
    expect(rates.offer_to_qpa_bands.find((row: { band: string }) => row.band === 'over_5').n).toBe(1);
    expect(rates.arbiter_dispersion).toEqual([
      expect.objectContaining({
        service_code: '99285',
        state: 'TX',
        case_type: 'emergency',
        n_entities: 2,
        outcome_dispersion: 0.5,
      }),
    ]);
    expect(rates.excluded_from_dispersion_lines).toBe(1);
    const blob = JSON.stringify(rates);
    expect(blob).not.toMatch(/iMPROve|DISP-|example\.com|1999999999|North Entity|South Entity/);
    expect(blob).not.toMatch(/\b\d{3}-\d{2}-\d{4}\b/);
  });
});

describe('CMS public score provenance', () => {
  it('does not train from private case tables, buckets, or synthetic filings', () => {
    for (const file of TRAINING_FILES) {
      const text = readFileSync(path.join(ROOT, file), 'utf8');
      for (const token of PRIVATE_INPUTS) {
        expect(text, `${file} mentions ${token}`).not.toContain(token);
      }
    }
  });

  it('records the CMS public source and file versions on the score', () => {
    const rates = loadCmsFeatureRates();
    const score = scoreVhgCase(base, rates);
    expect(score.data_source).toBe('CMS public IDR PUF');
    expect(rates.data_source).toBe('CMS public IDR PUF');
    const ids = score.source_files.map((file) => file.id);
    expect(ids).toEqual(expect.arrayContaining(['puf-2024-q3', 'puf-2024-q4', 'puf-2025-q4', 'data-dictionary']));
    for (const file of score.source_files) {
      expect(file.sha256).toMatch(/^[a-f0-9]{64}$/);
      expect(file.published_as_of).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
    expect(score.drivers.slice(0, 3).every((driver) => /CMS|45 CFR/.test(driver.detail))).toBe(true);
    expect(JSON.stringify(score)).not.toMatch(/redacted pattern|our IDR|synthetic filing/i);
  });

  it('blocks dispute numbers, PHI patterns, and named entities in the score module', () => {
    const blob = outputText();
    expect(blob).not.toMatch(/\bDISP-\d{3,}\b/);
    expect(blob).not.toMatch(/\b\d{3}-\d{2}-\d{4}\b/);
    expect(blob).not.toMatch(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
    expect(blob).not.toMatch(/\b(?:\+?1[-.\s])?\(?\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}\b/);
    for (const name of NAMED_PARTIES) {
      expect(blob, name).not.toContain(name);
    }
    expect(blob).not.toMatch(/\bGhost\b/);
    const score = scoreVhgCase(base);
    expect(JSON.stringify(score)).not.toMatch(/iMPROve|Certified IDR Entity|DISP-/);
    expect(score.drivers.some((driver) => driver.key === 'outcome_dispersion')).toBe(true);
    expect(score.drivers.find((driver) => driver.key === 'outcome_dispersion')?.detail).not.toMatch(/[A-Z][a-z]+ (Health|LLC|Inc)/);
  });
});
