/**
 * Tiny markdown parser scoped to what contract bodies actually use.
 *
 * Supports:
 *   # H1 / ## H2 / ### H3
 *   blank-line-separated paragraphs
 *   inline **bold** and *italic*
 *   horizontal rules (--- on its own line)
 *   unordered lists (- item, * item)
 *
 * Intentionally does NOT support: tables, code blocks, images, links,
 * nested lists, ordered lists. Contract templates don't need them and
 * keeping the parser small means the PDF renderer stays predictable.
 *
 * If a future template needs more (tables, footnotes, etc.), swap in
 * `marked` + a real HTML→PDF pipeline. Until then this parser is small,
 * dependency-free, and easy to audit.
 */

export type InlineRun = {
  text: string;
  bold: boolean;
  italic: boolean;
};

export type MdBlock =
  | { type: 'heading'; level: 1 | 2 | 3; runs: InlineRun[] }
  | { type: 'paragraph'; runs: InlineRun[] }
  | { type: 'list'; items: InlineRun[][] }
  | { type: 'hr' }
  | { type: 'spacer' };

/**
 * Parse a single line of text into inline runs (bold/italic spans).
 * The parser is order-aware: ** beats *, so **bold *italic-inside* bold**
 * works without ambiguity.
 */
export function parseInline(line: string): InlineRun[] {
  const runs: InlineRun[] = [];
  let i = 0;
  let bold = false;
  let italic = false;
  let buf = '';

  const flush = () => {
    if (buf.length > 0) {
      runs.push({ text: buf, bold, italic });
      buf = '';
    }
  };

  while (i < line.length) {
    if (line[i] === '*' && line[i + 1] === '*') {
      flush();
      bold = !bold;
      i += 2;
      continue;
    }
    if (line[i] === '*') {
      flush();
      italic = !italic;
      i += 1;
      continue;
    }
    buf += line[i];
    i += 1;
  }
  flush();

  return runs.length > 0 ? runs : [{ text: '', bold: false, italic: false }];
}

const HEADING_RE = /^(#{1,3})\s+(.*)$/;
const HR_RE = /^---+$/;
const LIST_RE = /^[-*]\s+(.*)$/;

export function parseMarkdown(body: string): MdBlock[] {
  const lines = body.split(/\r?\n/);
  const blocks: MdBlock[] = [];

  let paragraphBuf: string[] = [];
  let listBuf: string[] = [];

  const flushParagraph = () => {
    if (paragraphBuf.length === 0) return;
    const joined = paragraphBuf.join(' ').replace(/\s+/g, ' ').trim();
    if (joined.length > 0) {
      blocks.push({ type: 'paragraph', runs: parseInline(joined) });
    }
    paragraphBuf = [];
  };

  const flushList = () => {
    if (listBuf.length === 0) return;
    blocks.push({
      type: 'list',
      items: listBuf.map((item) => parseInline(item)),
    });
    listBuf = [];
  };

  for (const raw of lines) {
    const line = raw.trimEnd();

    if (line.trim().length === 0) {
      flushParagraph();
      flushList();
      // Emit a small spacer on blank lines so paragraphs don't collide
      // visually in the rendered PDF. Multiple consecutive blanks
      // collapse to a single spacer.
      const last = blocks[blocks.length - 1];
      if (last && last.type !== 'spacer') {
        blocks.push({ type: 'spacer' });
      }
      continue;
    }

    if (HR_RE.test(line.trim())) {
      flushParagraph();
      flushList();
      blocks.push({ type: 'hr' });
      continue;
    }

    const headingMatch = line.match(HEADING_RE);
    if (headingMatch) {
      flushParagraph();
      flushList();
      const level = headingMatch[1].length as 1 | 2 | 3;
      blocks.push({ type: 'heading', level, runs: parseInline(headingMatch[2]) });
      continue;
    }

    const listMatch = line.match(LIST_RE);
    if (listMatch) {
      flushParagraph();
      listBuf.push(listMatch[1]);
      continue;
    }

    flushList();
    paragraphBuf.push(line);
  }

  flushParagraph();
  flushList();

  // Trim a trailing spacer so the doc doesn't end with extra whitespace.
  while (blocks.length > 0 && blocks[blocks.length - 1].type === 'spacer') {
    blocks.pop();
  }

  return blocks;
}
