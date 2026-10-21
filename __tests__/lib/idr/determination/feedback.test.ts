import { describe, expect, it } from 'vitest';
import {
  applyUnifiedDiff,
  loadIdrCatalogFromFiles,
  proposeContentEdit,
  readIdrContentFiles,
} from '@/lib/idr/determination';

describe('reviewer feedback proposals', () => {
  it('proposes a checklist diff and leaves the loaded files unchanged', () => {
    const files = readIdrContentFiles();
    const original = files['config/idr/qa-checklist.yaml'];
    const proposal = proposeContentEdit({
      reviewer_ref: 'nicole',
      comment: 'Add the phrase from the latest review note.',
      path: 'config/idr/qa-checklist.yaml',
      files,
      find: '- "frivolous"',
      replace: '- "frivolous"\n      - "synthetic-ban-word"',
    });
    expect(proposal.ok).toBe(true);
    if (!proposal.ok) return;
    expect(proposal.applies_to_runtime_code).toBe(false);
    expect(proposal.schema_valid).toBe(true);
    expect(proposal.diff.startsWith('--- a/config/idr/qa-checklist.yaml')).toBe(true);
    expect(files['config/idr/qa-checklist.yaml']).toBe(original);
    const applied = applyUnifiedDiff(original, proposal.diff);
    expect(applied).toContain('synthetic-ban-word');
    expect(applied).not.toBe(original);
    const next = { ...files, 'config/idr/qa-checklist.yaml': applied };
    expect(loadIdrCatalogFromFiles(next).checklist.gates.find((gate) => gate.id === 'neutral_tone')).toMatchObject({
      forbid_phrases: expect.arrayContaining(['synthetic-ban-word']),
    });
  });

  it('proposes a template version diff while the shell stays a placeholder', () => {
    const files = readIdrContentFiles();
    const path = 'config/idr/templates/ip-brief-single.md';
    const proposal = proposeContentEdit({
      reviewer_ref: 'nicole',
      comment: 'Stamp the next content version. Live prose is still unmarked.',
      path,
      files,
      find: 'version: "2026-10-21.1"',
      replace: 'version: "2026-10-21.2"',
    });
    expect(proposal.ok).toBe(true);
    if (!proposal.ok) return;
    const applied = applyUnifiedDiff(files[path], proposal.diff);
    expect(applied).toContain('version: "2026-10-21.2"');
    expect(applied).toContain('TODO-LIVE-TEXT');
    expect(applied).toContain('{{winner_paragraph}}');
  });

  it('refuses runtime code edits and schema-breaking content edits', () => {
    const files = readIdrContentFiles();
    const code = proposeContentEdit({
      reviewer_ref: 'nicole',
      comment: 'Change the gate in code.',
      path: 'lib/idr/determination/workflow.ts',
      files,
      find: 'ready for review',
      replace: 'final',
    });
    expect(code.ok).toBe(false);
    if (code.ok) return;
    expect(code.code).toBe('runtime_path');
    expect(code.applies_to_runtime_code).toBe(false);

    const broken = proposeContentEdit({
      reviewer_ref: 'nicole',
      comment: 'Remove the chart placeholder.',
      path: 'config/idr/templates/ip-brief-single.md',
      files,
      find: '{{chart_paragraph}}',
      replace: 'The chart is described here.',
    });
    expect(broken.ok).toBe(false);
    if (broken.ok) return;
    expect(broken.code).toBe('schema_invalid');
  });
});
