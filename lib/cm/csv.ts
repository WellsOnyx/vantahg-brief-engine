/**
 * Daily CM CSV drop stub (09). Flagged determinations only.
 * SFTP is later — this records the file contents + an outbound intent.
 */

import { buildCmFeed, type CmFeedItem } from './feed';
import type { CanonicalCase } from '@/lib/case-spine/types';

export const CM_CSV_COLUMNS = [
  'case_id',
  'external_id',
  'flags',
  'determination',
  'determined_at',
  'secure_summary_url',
] as const;

function csvCell(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function cmFeedToCsv(items: CmFeedItem[]): string {
  const header = CM_CSV_COLUMNS.join(',');
  const lines = items.map((item) =>
    [
      item.case_id,
      item.external_id ?? '',
      item.flags.join('|'),
      item.determination,
      item.determined_at,
      item.secure_summary_url,
    ]
      .map(csvCell)
      .join(','),
  );
  return [header, ...lines].join('\n');
}

export function buildDailyCmCsv(
  cases: CanonicalCase[],
  opts: { day?: string; appUrl?: string } = {},
): { csv: string; items: CmFeedItem[]; day: string } {
  const day = opts.day ?? new Date().toISOString().slice(0, 10);
  const items = buildCmFeed(cases, opts.appUrl).filter((item) => item.determined_at.startsWith(day));
  return { csv: cmFeedToCsv(items), items, day };
}
