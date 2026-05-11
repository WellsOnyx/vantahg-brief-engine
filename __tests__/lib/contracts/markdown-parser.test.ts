import { describe, it, expect } from 'vitest';
import { parseInline, parseMarkdown } from '@/lib/contracts/markdown-parser';

describe('parseInline', () => {
  it('returns a single plain run for unformatted text', () => {
    expect(parseInline('hello world')).toEqual([
      { text: 'hello world', bold: false, italic: false },
    ]);
  });

  it('parses **bold**', () => {
    const runs = parseInline('a **b** c');
    expect(runs).toEqual([
      { text: 'a ', bold: false, italic: false },
      { text: 'b', bold: true, italic: false },
      { text: ' c', bold: false, italic: false },
    ]);
  });

  it('parses *italic*', () => {
    const runs = parseInline('a *b* c');
    expect(runs).toEqual([
      { text: 'a ', bold: false, italic: false },
      { text: 'b', bold: false, italic: true },
      { text: ' c', bold: false, italic: false },
    ]);
  });

  it('handles bold-then-italic in same line', () => {
    const runs = parseInline('**bold** then *italic*');
    expect(runs).toEqual([
      { text: 'bold', bold: true, italic: false },
      { text: ' then ', bold: false, italic: false },
      { text: 'italic', bold: false, italic: true },
    ]);
  });

  it('returns an empty run for empty input', () => {
    expect(parseInline('')).toEqual([{ text: '', bold: false, italic: false }]);
  });
});

describe('parseMarkdown', () => {
  it('parses a single H1', () => {
    const blocks = parseMarkdown('# Title');
    expect(blocks).toEqual([
      { type: 'heading', level: 1, runs: [{ text: 'Title', bold: false, italic: false }] },
    ]);
  });

  it('parses H1, H2, H3', () => {
    const blocks = parseMarkdown('# A\n\n## B\n\n### C');
    const headings = blocks.filter((b) => b.type === 'heading');
    expect(headings.map((h) => h.level)).toEqual([1, 2, 3]);
  });

  it('collapses multi-line paragraphs into a single paragraph block', () => {
    const blocks = parseMarkdown('line one\nline two\nline three');
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({
      type: 'paragraph',
    });
    if (blocks[0].type === 'paragraph') {
      expect(blocks[0].runs[0].text).toBe('line one line two line three');
    }
  });

  it('separates paragraphs by blank lines', () => {
    const blocks = parseMarkdown('first para.\n\nsecond para.');
    const paragraphs = blocks.filter((b) => b.type === 'paragraph');
    expect(paragraphs).toHaveLength(2);
  });

  it('parses lists', () => {
    const blocks = parseMarkdown('- a\n- b\n- c');
    expect(blocks).toHaveLength(1);
    expect(blocks[0].type).toBe('list');
    if (blocks[0].type === 'list') {
      expect(blocks[0].items).toHaveLength(3);
    }
  });

  it('parses horizontal rules', () => {
    const blocks = parseMarkdown('before\n\n---\n\nafter');
    expect(blocks.some((b) => b.type === 'hr')).toBe(true);
  });

  it('handles a realistic contract preamble', () => {
    const blocks = parseMarkdown(`# Master Services Agreement

This Agreement is entered into between **VantaUM** and **Acme TPA**.

## 1. Services

VantaUM provides UM.

---`);
    const types = blocks.map((b) => b.type);
    expect(types).toContain('heading');
    expect(types).toContain('paragraph');
    expect(types).toContain('hr');
  });

  it('trims trailing spacer blocks', () => {
    const blocks = parseMarkdown('hello\n\n\n\n');
    const last = blocks[blocks.length - 1];
    expect(last.type).not.toBe('spacer');
  });
});
