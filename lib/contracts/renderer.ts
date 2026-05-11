/**
 * Contract PDF renderer.
 *
 * Takes resolved markdown (output of the resolver) and produces a PDF
 * Buffer. Uses jsPDF — same library the determination-letter renderer
 * uses — so we stay on one PDF stack across the platform.
 *
 * Layout decisions:
 *   - Portrait, US Letter, 1-inch margins. Standard contract presentation.
 *   - Helvetica throughout (jsPDF built-in, no font registration).
 *   - H1 → 18pt bold, with a thin gold rule under it (brand cue).
 *   - H2 → 14pt bold.
 *   - H3 → 11pt bold.
 *   - Body → 11pt regular, justified-style (line-wrap via splitTextToSize).
 *   - Lists → indented, hyphen bullet.
 *   - HR → thin gray rule across the content width.
 *   - Page footer: "VantaUM MSA — Page N of M" centered.
 *
 * Note: The renderer is intentionally hand-rolled rather than using a
 * markdown-to-html-to-pdf pipeline because:
 *   1. We only need a tight subset of markdown (see markdown-parser.ts)
 *   2. Headless-browser rendering on serverless is fragile
 *   3. Determinism in output makes legal-review easier
 */

import { jsPDF } from 'jspdf';
import { parseMarkdown, type MdBlock, type InlineRun } from './markdown-parser';

const NAVY = '#0c2340';
const GOLD = '#c9a227';
const GRAY = '#6b7280';
const LIGHT_GRAY = '#d1d5db';

// US Letter in mm. (216 x 279.4)
const PAGE_WIDTH_MM = 215.9;
const PAGE_HEIGHT_MM = 279.4;
const MARGIN_MM = 25.4; // 1 inch
const CONTENT_WIDTH_MM = PAGE_WIDTH_MM - MARGIN_MM * 2;

const BODY_FONT_SIZE = 11;
const BODY_LINE_HEIGHT_MM = 5.5;
const PARAGRAPH_GAP_MM = 3;
const HEADING_GAP_MM = 4;
const LIST_INDENT_MM = 6;

const FOOTER_RESERVE_MM = 15; // bottom area for page numbers

export interface ContractPdfOptions {
  /** Footer line, e.g. "VantaUM MSA v1 — confidential" */
  footerLabel?: string;
  /** Header line, e.g. "VantaUM, Inc.  •  Master Services Agreement" */
  headerLabel?: string;
}

interface RenderState {
  doc: jsPDF;
  y: number;
  pageCount: number;
  options: ContractPdfOptions;
}

function newPage(state: RenderState): void {
  state.doc.addPage();
  state.pageCount += 1;
  state.y = MARGIN_MM;
  drawHeader(state);
}

function ensureRoom(state: RenderState, requiredMm: number): void {
  if (state.y + requiredMm > PAGE_HEIGHT_MM - MARGIN_MM - FOOTER_RESERVE_MM) {
    newPage(state);
  }
}

function drawHeader(state: RenderState): void {
  if (!state.options.headerLabel) return;
  state.doc.setFontSize(8);
  state.doc.setTextColor(GRAY);
  state.doc.setFont('helvetica', 'normal');
  state.doc.text(state.options.headerLabel, MARGIN_MM, MARGIN_MM - 8);
  state.doc.setDrawColor(LIGHT_GRAY);
  state.doc.setLineWidth(0.2);
  state.doc.line(
    MARGIN_MM,
    MARGIN_MM - 5,
    PAGE_WIDTH_MM - MARGIN_MM,
    MARGIN_MM - 5,
  );
  state.y = MARGIN_MM;
}

function drawFooters(doc: jsPDF, totalPages: number, label: string | undefined): void {
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setFontSize(8);
    doc.setTextColor(GRAY);
    doc.setFont('helvetica', 'normal');

    const leftText = label ?? '';
    const rightText = `Page ${p} of ${totalPages}`;
    if (leftText) {
      doc.text(leftText, MARGIN_MM, PAGE_HEIGHT_MM - 10);
    }
    doc.text(
      rightText,
      PAGE_WIDTH_MM - MARGIN_MM,
      PAGE_HEIGHT_MM - 10,
      { align: 'right' },
    );
  }
}

function setFontFor(doc: jsPDF, bold: boolean, italic: boolean): void {
  let style: 'normal' | 'bold' | 'italic' | 'bolditalic' = 'normal';
  if (bold && italic) style = 'bolditalic';
  else if (bold) style = 'bold';
  else if (italic) style = 'italic';
  doc.setFont('helvetica', style);
}

/**
 * Render a sequence of inline runs as a single text line, wrapping
 * across multiple lines when the line exceeds the maxWidth.
 *
 * Wrap-aware: words flow correctly even when bold/italic toggles
 * mid-sentence. Implemented by laying out word-by-word and tracking
 * the cursor across runs.
 */
function renderRuns(
  state: RenderState,
  runs: InlineRun[],
  startX: number,
  maxWidth: number,
  fontSize: number,
): void {
  const { doc } = state;
  doc.setFontSize(fontSize);
  doc.setTextColor(NAVY);

  // Tokenize each run into words, attach formatting metadata.
  type Token = { word: string; bold: boolean; italic: boolean; trailingSpace: boolean };
  const tokens: Token[] = [];
  for (const run of runs) {
    const parts = run.text.split(/(\s+)/); // keep whitespace boundaries
    for (const part of parts) {
      if (part.length === 0) continue;
      if (/^\s+$/.test(part)) {
        const prev = tokens[tokens.length - 1];
        if (prev) prev.trailingSpace = true;
        continue;
      }
      tokens.push({ word: part, bold: run.bold, italic: run.italic, trailingSpace: false });
    }
  }

  if (tokens.length === 0) return;

  let cursorX = startX;
  let lineStartY = state.y;
  const lineHeight = fontSize === BODY_FONT_SIZE ? BODY_LINE_HEIGHT_MM : fontSize * 0.45;

  ensureRoom(state, lineHeight);

  for (const tok of tokens) {
    setFontFor(doc, tok.bold, tok.italic);
    const wordWidth = doc.getTextWidth(tok.word);
    const spaceWidth = tok.trailingSpace ? doc.getTextWidth(' ') : 0;

    if (cursorX + wordWidth > startX + maxWidth && cursorX > startX) {
      // Wrap to next line.
      state.y += lineHeight;
      ensureRoom(state, lineHeight);
      cursorX = startX;
      lineStartY = state.y;
    }

    doc.text(tok.word, cursorX, lineStartY);
    cursorX += wordWidth + spaceWidth;
  }

  state.y += lineHeight;
}

function renderHeading(
  state: RenderState,
  level: 1 | 2 | 3,
  runs: InlineRun[],
): void {
  const size = level === 1 ? 18 : level === 2 ? 14 : 11;
  const gap = level === 1 ? 6 : level === 2 ? 4 : 3;

  ensureRoom(state, size * 0.5 + gap);
  state.y += gap;

  state.doc.setFontSize(size);
  state.doc.setTextColor(NAVY);
  setFontFor(state.doc, true, false);

  const text = runs.map((r) => r.text).join('');
  const lines = state.doc.splitTextToSize(text, CONTENT_WIDTH_MM) as string[];
  for (const line of lines) {
    ensureRoom(state, size * 0.5);
    state.doc.text(line, MARGIN_MM, state.y + size * 0.4);
    state.y += size * 0.55;
  }

  if (level === 1) {
    // Gold rule under the H1.
    state.doc.setDrawColor(GOLD);
    state.doc.setLineWidth(0.4);
    state.doc.line(
      MARGIN_MM,
      state.y + 1,
      MARGIN_MM + CONTENT_WIDTH_MM,
      state.y + 1,
    );
    state.y += 4;
  }

  state.y += HEADING_GAP_MM;
}

function renderParagraph(state: RenderState, runs: InlineRun[]): void {
  renderRuns(state, runs, MARGIN_MM, CONTENT_WIDTH_MM, BODY_FONT_SIZE);
  state.y += PARAGRAPH_GAP_MM;
}

function renderList(state: RenderState, items: InlineRun[][]): void {
  for (const item of items) {
    ensureRoom(state, BODY_LINE_HEIGHT_MM);
    state.doc.setFontSize(BODY_FONT_SIZE);
    state.doc.setTextColor(NAVY);
    state.doc.setFont('helvetica', 'normal');
    state.doc.text('–', MARGIN_MM + 1, state.y + BODY_FONT_SIZE * 0.4);
    renderRuns(
      state,
      item,
      MARGIN_MM + LIST_INDENT_MM,
      CONTENT_WIDTH_MM - LIST_INDENT_MM,
      BODY_FONT_SIZE,
    );
  }
  state.y += PARAGRAPH_GAP_MM;
}

function renderHr(state: RenderState): void {
  ensureRoom(state, 6);
  state.y += 2;
  state.doc.setDrawColor(LIGHT_GRAY);
  state.doc.setLineWidth(0.2);
  state.doc.line(
    MARGIN_MM,
    state.y,
    MARGIN_MM + CONTENT_WIDTH_MM,
    state.y,
  );
  state.y += 4;
}

function renderBlock(state: RenderState, block: MdBlock): void {
  switch (block.type) {
    case 'heading':
      renderHeading(state, block.level, block.runs);
      break;
    case 'paragraph':
      renderParagraph(state, block.runs);
      break;
    case 'list':
      renderList(state, block.items);
      break;
    case 'hr':
      renderHr(state);
      break;
    case 'spacer':
      state.y += PARAGRAPH_GAP_MM * 0.6;
      break;
  }
}

/**
 * Render a contract body (resolved markdown) to a PDF Buffer.
 */
export function renderContractPdf(
  resolvedMd: string,
  options: ContractPdfOptions = {},
): Buffer {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' });
  const state: RenderState = {
    doc,
    y: MARGIN_MM,
    pageCount: 1,
    options,
  };

  drawHeader(state);

  const blocks = parseMarkdown(resolvedMd);
  for (const block of blocks) {
    renderBlock(state, block);
  }

  drawFooters(doc, state.pageCount, options.footerLabel);

  const arrayBuffer = doc.output('arraybuffer') as ArrayBuffer;
  return Buffer.from(arrayBuffer);
}
