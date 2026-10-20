import { parseExactCents } from './money';
import type { DeterminationRequest, Figure, FigureKind, RawFigure } from './types';
import { FIGURE_KINDS } from './types';

/**
 * Reads offer and QPA figures from the supplied source fields.
 * A missing amount, an unparseable amount, or a missing document page is MISSING.
 * Nothing is copied from another figure and nothing is estimated.
 */
export function extractFigures(request: DeterminationRequest): Figure[] {
  const docIds = new Set(request.documents.map((doc) => doc.doc_id));
  const figures: Figure[] = [];
  for (const item of request.line_items) {
    for (const kind of FIGURE_KINDS) {
      figures.push(extractOne(item.line_id, kind, item[kind], docIds));
    }
  }
  return figures;
}

function extractOne(
  lineId: string,
  kind: FigureKind,
  raw: RawFigure,
  docIds: ReadonlySet<string>,
): Figure {
  const amount = parseExactCents(raw.amount);
  const page = raw.page;
  const docId = raw.doc_id?.trim() ?? '';
  const sourced = amount !== null && docId !== '' && docIds.has(docId) && Number.isInteger(page) && page !== null && page >= 1;
  if (!sourced || page === null) {
    return {
      line_id: lineId,
      kind,
      status: 'MISSING',
      amount_cents: null,
      source: null,
    };
  }
  return {
    line_id: lineId,
    kind,
    status: 'present',
    amount_cents: amount,
    source: { doc_id: docId, page },
  };
}
