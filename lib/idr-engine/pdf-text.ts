import { readFile } from 'fs/promises';
import type { PageText } from './types';

/**
 * Per-page text extraction for SEARCHABLE PDFs (spec §1: the workspace
 * holds searchable PDFs — OCR is out of scope for Phase 0; a scanned/
 * image-only PDF simply yields empty pages and the answer sheet flags the
 * gap rather than guessing).
 *
 * `.txt` files are accepted alongside PDFs (treated as one page per
 * form-feed-separated block) so fixtures and quick manual runs don't need
 * PDF tooling.
 */

export async function extractPages(filePath: string): Promise<PageText[]> {
  if (/\.txt$/i.test(filePath)) {
    const raw = await readFile(filePath, 'utf-8');
    return raw.split('\f').map((text, i) => ({ page: i + 1, text: text.trim() }));
  }

  const data = new Uint8Array(await readFile(filePath));
  // Dynamic import: pdfjs-dist is ESM-only; this module is only ever used
  // by the CLI/worker path, never bundled into the app.
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const loadingTask = pdfjs.getDocument({ data, useSystemFonts: true });
  const doc = await loadingTask.promise;

  const pages: PageText[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    const text = content.items
      .map((item) => ('str' in item ? item.str : ''))
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
    pages.push({ page: p, text });
  }
  await loadingTask.destroy();
  return pages;
}

export function fullText(pages: PageText[]): string {
  return pages.map((p) => p.text).join('\n');
}

/** Text with explicit page markers, for prompts that must cite pages. */
export function pageMarkedText(pages: PageText[], maxCharsPerPage = 6000): string {
  return pages
    .map((p) => `[PAGE ${p.page}]\n${p.text.slice(0, maxCharsPerPage)}`)
    .join('\n\n');
}
