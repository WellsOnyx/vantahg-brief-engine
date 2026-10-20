import { describe, expect, it } from 'vitest';
import {
  IdrContentError,
  loadIdrCatalog,
  loadIdrCatalogFromFiles,
  readIdrContentFiles,
  REQUIRED_GATE_IDS,
} from '@/lib/idr/determination';

describe('IDR content loader', () => {
  it('loads the versioned template set and checklist from config/idr', () => {
    const catalog = loadIdrCatalog();
    expect(catalog.templates).toHaveLength(8);
    expect(catalog.checklist.version).toBe('2026-10-20.1');
    expect(catalog.checklist.schema).toBe('idr-qa-checklist');
    expect(catalog.checklist.gates.map((gate) => gate.id)).toEqual([...REQUIRED_GATE_IDS]);
    expect(catalog.checklist.gates.every((gate) => gate.blocking)).toBe(true);
    for (const template of catalog.templates) {
      expect(template.version).toBe('2026-10-20.1');
      expect(template.paragraphs).toHaveLength(4);
      expect(template.path.startsWith('config/idr/templates/')).toBe(true);
    }
    const acuity = catalog.checklist.gates.find((gate) => gate.id === 'no_cpt_in_acuity');
    expect(acuity && 'forbid_pattern' in acuity && new RegExp(acuity.forbid_pattern).test('99285')).toBe(true);
  });

  it('rejects a checklist that drops a hard-stop gate', () => {
    const files = readIdrContentFiles();
    files['config/idr/qa-checklist.yaml'] = files['config/idr/qa-checklist.yaml'].replace(
      '  - id: factor_7_rule\n    blocking: true\n    label: "Factor 7 is never credited to the initiating party."\n    factor: additional_information\n    never_credit_party: IP\n    credit_patterns:\n      - "supports the initiating party"\n      - "weighs in favor of the initiating party"\n      - "favors the initiating party"\n      - "credited to the initiating party"\n      - "initiating party prevails on this factor"\n',
      '',
    );
    expect(() => loadIdrCatalogFromFiles(files)).toThrow(IdrContentError);
    expect(() => loadIdrCatalogFromFiles(files)).toThrow(/factor_7_rule/);
  });

  it('rejects an unknown gate and a factor 7 credit pointed at the non-initiating party', () => {
    const files = readIdrContentFiles();
    const unknown = {
      ...files,
      'config/idr/qa-checklist.yaml': files['config/idr/qa-checklist.yaml'].replace(
        'id: template_match',
        'id: reviewer_invented_gate',
      ),
    };
    expect(() => loadIdrCatalogFromFiles(unknown)).toThrow(/template_match|invalid/);

    const flipped = {
      ...files,
      'config/idr/qa-checklist.yaml': files['config/idr/qa-checklist.yaml'].replace(
        'never_credit_party: IP\n    credit_patterns:',
        'never_credit_party: NIP\n    credit_patterns:',
      ),
    };
    expect(() => loadIdrCatalogFromFiles(flipped)).toThrow(/initiating party/);
  });

  it('rejects a template whose QPA wording does not match its dispute shape', () => {
    const files = readIdrContentFiles();
    const path = 'config/idr/templates/ip-brief-single.md';
    files[path] = files[path].replace('qpa_wording: single', 'qpa_wording: batch');
    expect(() => loadIdrCatalogFromFiles(files)).toThrow(/qpa_wording/);
  });

  it('rejects a template set that is missing a variant', () => {
    const files = readIdrContentFiles();
    delete files['config/idr/templates/nip-no-brief-batch.md'];
    expect(() => loadIdrCatalogFromFiles(files)).toThrow(/nip-no-brief-batch/);
  });

  it('rejects tabs in a content file', () => {
    const files = readIdrContentFiles();
    files['config/idr/qa-checklist.yaml'] = files['config/idr/qa-checklist.yaml'].replace('version:', '\tversion:');
    expect(() => loadIdrCatalogFromFiles(files)).toThrow(/Tabs/);
  });
});
