import { loadIdrCatalogFromFiles } from './load';
import { IdrContentError } from './schema';
import type { ContentProposal, ContentProposalRefusal } from './types';

const CONTENT_PATH = /^config\/idr\/(?:templates\/[a-z0-9-]+\.md|qa-checklist\.yaml)$/;

/**
 * Reviewer feedback becomes a proposed content-file diff.
 * The running catalog is not modified. TypeScript sources are refused.
 */
export function proposeContentEdit(input: {
  reviewer_ref: string;
  comment: string;
  path: string;
  files: Readonly<Record<string, string>>;
  find: string;
  replace: string;
}): ContentProposal | ContentProposalRefusal {
  if (!input.reviewer_ref.trim() || !input.comment.trim()) {
    return refuse('empty_edit', 'Reviewer feedback needs a reviewer ref and a comment.');
  }
  if (/\.(ts|tsx|js|jsx)$/.test(input.path) || input.path.includes('lib/')) {
    return refuse('runtime_path', 'Reviewer feedback cannot edit runtime code.');
  }
  if (!CONTENT_PATH.test(input.path)) {
    return refuse('path_not_content', 'Edits are limited to config/idr templates and the QA checklist.');
  }
  const current = input.files[input.path];
  if (current === undefined) {
    return refuse('path_not_content', `No content file is loaded at ${input.path}.`);
  }
  if (!input.find) return refuse('empty_edit', 'The find text is empty.');
  const hits = countOccurrences(current, input.find);
  if (hits !== 1) {
    return refuse('edit_not_unique', `The find text occurred ${hits} times. A proposal needs one occurrence.`);
  }
  const next = current.replace(input.find, input.replace);
  const files = { ...input.files, [input.path]: next };
  try {
    loadIdrCatalogFromFiles(files);
  } catch (error) {
    const message = error instanceof IdrContentError ? error.message : 'The proposed file failed schema validation.';
    return refuse('schema_invalid', message);
  }
  return {
    ok: true,
    applies_to_runtime_code: false,
    path: input.path,
    diff: unifiedDiff(input.path, current, next),
    reviewer_ref: input.reviewer_ref,
    comment: input.comment,
    schema_valid: true,
  };
}

export function unifiedDiff(filePath: string, before: string, after: string): string {
  const a = before.split('\n');
  const b = after.split('\n');
  const ops = lineDiff(a, b);
  const hunks = hunksFrom(ops, 3);
  const lines = [`--- a/${filePath}`, `+++ b/${filePath}`];
  for (const hunk of hunks) {
    lines.push(`@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@`);
    lines.push(...hunk.lines);
  }
  return `${lines.join('\n')}\n`;
}

export function applyUnifiedDiff(original: string, diff: string): string {
  const originalLines = original.split('\n');
  const diffLines = diff.split('\n');
  const output: string[] = [];
  let cursor = 0;
  let i = 0;
  while (i < diffLines.length && (diffLines[i].startsWith('--- ') || diffLines[i].startsWith('+++ ') || diffLines[i] === '')) {
    i += 1;
  }
  while (i < diffLines.length) {
    const header = /^@@ -(\d+),(\d+) \+(\d+),(\d+) @@/.exec(diffLines[i] ?? '');
    if (!header) break;
    const oldStart = Number(header[1]);
    i += 1;
    while (cursor < oldStart - 1) {
      output.push(originalLines[cursor] ?? '');
      cursor += 1;
    }
    while (i < diffLines.length && !diffLines[i].startsWith('@@')) {
      const line = diffLines[i];
      const marker = line[0];
      const payload = line.slice(1);
      if (marker === ' ') {
        if ((originalLines[cursor] ?? '') !== payload) {
          throw new Error('Diff context does not match the source file.');
        }
        output.push(payload);
        cursor += 1;
      } else if (marker === '-') {
        if ((originalLines[cursor] ?? '') !== payload) {
          throw new Error('Diff deletion does not match the source file.');
        }
        cursor += 1;
      } else if (marker === '+') {
        output.push(payload);
      } else if (line === '') {
        break;
      } else {
        throw new Error('Diff line is not a unified-diff marker.');
      }
      i += 1;
    }
  }
  while (cursor < originalLines.length) {
    output.push(originalLines[cursor] ?? '');
    cursor += 1;
  }
  return output.join('\n');
}

function refuse(code: ContentProposalRefusal['code'], message: string): ContentProposalRefusal {
  return { ok: false, applies_to_runtime_code: false, code, message };
}

function countOccurrences(haystack: string, needle: string): number {
  let count = 0;
  let from = 0;
  while (from <= haystack.length) {
    const at = haystack.indexOf(needle, from);
    if (at < 0) break;
    count += 1;
    from = at + needle.length;
  }
  return count;
}

interface DiffOp {
  type: 'keep' | 'del' | 'add';
  line: string;
}

function lineDiff(a: readonly string[], b: readonly string[]): DiffOp[] {
  const n = a.length;
  const m = b.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const ops: DiffOp[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      ops.push({ type: 'keep', line: a[i] });
      i += 1;
      j += 1;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      ops.push({ type: 'del', line: a[i] });
      i += 1;
    } else {
      ops.push({ type: 'add', line: b[j] });
      j += 1;
    }
  }
  while (i < n) ops.push({ type: 'del', line: a[i++] });
  while (j < m) ops.push({ type: 'add', line: b[j++] });
  return ops;
}

interface Hunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  lines: string[];
}

function hunksFrom(ops: readonly DiffOp[], context: number): Hunk[] {
  const positioned = ops.map((op) => ({ ...op, oldLine: 0, newLine: 0 }));
  let oldLine = 1;
  let newLine = 1;
  for (const op of positioned) {
    op.oldLine = op.type === 'add' ? 0 : oldLine;
    op.newLine = op.type === 'del' ? 0 : newLine;
    if (op.type !== 'add') oldLine += 1;
    if (op.type !== 'del') newLine += 1;
  }
  const changes = positioned
    .map((op, index) => (op.type === 'keep' ? -1 : index))
    .filter((index) => index >= 0);
  if (changes.length === 0) return [];
  const ranges: Array<[number, number]> = [];
  for (const index of changes) {
    const start = Math.max(0, index - context);
    const end = Math.min(positioned.length, index + context + 1);
    const last = ranges[ranges.length - 1];
    if (last && start <= last[1]) last[1] = Math.max(last[1], end);
    else ranges.push([start, end]);
  }
  return ranges.map(([start, end]) => {
    const slice = positioned.slice(start, end);
    const lines: string[] = [];
    let oldCount = 0;
    let newCount = 0;
    for (const op of slice) {
      if (op.type === 'keep') {
        lines.push(` ${op.line}`);
        oldCount += 1;
        newCount += 1;
      } else if (op.type === 'del') {
        lines.push(`-${op.line}`);
        oldCount += 1;
      } else {
        lines.push(`+${op.line}`);
        newCount += 1;
      }
    }
    const oldStart = slice.find((op) => op.oldLine > 0)?.oldLine ?? 0;
    const newStart = slice.find((op) => op.newLine > 0)?.newLine ?? 0;
    return { oldStart, oldLines: oldCount, newStart, newLines: newCount, lines };
  });
}
