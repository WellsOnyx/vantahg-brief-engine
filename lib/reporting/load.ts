import { getBillableEventLedger } from '@/lib/billing/ledger';
import { getCaseSpineService, type SpineViewer } from '@/lib/case-spine';
import type { ReportFilters, ReportSource } from './types';

export async function loadReportSource(
  viewer: SpineViewer,
  filters: ReportFilters = {},
): Promise<ReportSource> {
  const cases = await getCaseSpineService().listCases(viewer, {
    client_id: filters.client_id ?? undefined,
    type: filters.type ?? undefined,
  });
  const ledger = await getBillableEventLedger().list({
    client_id: filters.client_id ?? undefined,
  });
  return { cases, ledger };
}
