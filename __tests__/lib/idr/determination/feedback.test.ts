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

  it('proposes a template wording diff', () => {
    const files = readIdrContentFiles();
    const path = 'config/idr/templates/ip-brief-single.md';
    const proposal = proposeContentEdit({
      reviewer_ref: 'nicole',
      comment: 'Soften the opening line.',
      path,
      files,
      find: 'was reviewed.',
      replace: 'was opened for review.',
    });
    expect(proposal.ok).toBe(true);
    if (!proposal.ok) return;
    expect(applyUnifiedDiff(files[path], proposal.diff)).toContain('was opened for review.');
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
      comment: 'Remove the QPA sentence.',
      path: 'config/idr/templates/ip-brief-single.md',
      files,
      find: 'The qualifying payment amount for this item or service is {{qpa}}.',
      replace: 'The amount is stated elsewhere.',
    });
    expect(broken.ok).toBe(false);
    if (broken.ok) return;
    expect(broken.code).toBe('schema_invalid');
  });
});
