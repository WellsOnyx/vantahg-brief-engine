/**
 * Portal CM queue (09). Flagged determinations only.
 * Unflagged cases never appear.
 */

import type { CanonicalCase, CmFlag, SpineDetermination } from '@/lib/case-spine/types';
import { cmSecureSummaryUrl } from './webhook';

export interface CmFeedItem {
  case_id: string;
  case_number: string;
  client_id: string;
  external_id: string | null;
  flags: CmFlag[];
  determination: SpineDetermination;
  determined_at: string;
  secure_summary_url: string;
}

export function isCmFlagged(c: CanonicalCase): boolean {
  return Boolean(c.determination && c.cm_flags.length > 0);
}

export function toCmFeedItem(c: CanonicalCase, appUrl?: string): CmFeedItem | null {
  if (!isCmFlagged(c) || !c.determination || !c.determined_at) return null;
  return {
    case_id: c.case_id,
    case_number: c.case_number,
    client_id: c.client_id,
    external_id: c.external_id,
    flags: [...c.cm_flags],
    determination: c.determination,
    determined_at: c.determined_at,
    secure_summary_url: cmSecureSummaryUrl(c.case_id, appUrl),
  };
}

export function buildCmFeed(cases: CanonicalCase[], appUrl?: string): CmFeedItem[] {
  return cases
    .map((c) => toCmFeedItem(c, appUrl))
    .filter((item): item is CmFeedItem => item !== null)
    .sort((a, b) => b.determined_at.localeCompare(a.determined_at));
}
