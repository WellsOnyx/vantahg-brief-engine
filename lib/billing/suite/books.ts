import type { LineOfBusiness } from '@/lib/lines';
import type { FinanceBook } from './types';

const LINE_BOOKS: Record<LineOfBusiness, readonly FinanceBook[]> = {
  IRO: ['iro_operating'],
  IDR: ['idr_fees', 'idr_escrow'],
  MEDICAL_REVIEW: ['med_review'],
};

export function booksForLine(line: LineOfBusiness): readonly FinanceBook[] {
  return LINE_BOOKS[line];
}

export function lineOwnsBook(line: LineOfBusiness, book: FinanceBook): boolean {
  return LINE_BOOKS[line].includes(book);
}

/**
 * Escrow never settles IRO, Medical Review, or even IDR fee revenue.
 * A transfer across books is refused. There is no blended cash total.
 */
export function transferAllowed(from: FinanceBook, to: FinanceBook): boolean {
  return from === to && from !== 'idr_escrow';
}
