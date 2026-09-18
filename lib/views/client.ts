/**
 * Client lens on the canonical case object (04 / Phase 5.1).
 * Status, SLA clocks, decisions, invoices — never CX notes or raw briefs.
 */

import { getMemoryBillableEventLedger } from '@/lib/billing/events';
import { getMemoryStatementStore, type BillingStatement } from '@/lib/billing/statement';
import {
  getCaseSpineService,
  isOpenCase,
  type CanonicalCase,
  type SpineViewer,
} from '@/lib/case-spine';
import { getClientConfigService, type ClientConfigFields } from '@/lib/client-config';
import { isSignedForPortal, toPortalDetermination, type PortalDetermination } from '@/lib/fanout/portal';
import { SYNTHETIC_CLIENT_ID } from '@/lib/intake/constants';

export interface ClientConfigSummary {
  client_id: string;
  legal_name: string;
  sla_hours_standard: number;
  sla_hours_urgent: number;
  timezone: string;
  business_hours: ClientConfigFields['business_hours'];
  escalation_contacts: ClientConfigFields['escalation_contacts'];
  cx_owner: string;
  notify_channels: ClientConfigFields['notify_channels'];
  version: number | null;
}

export interface StatementSummary {
  statement_id: string;
  client_id: string;
  client_name: string;
  period_start: string;
  period_end: string;
  status: string;
  subtotal: number;
  event_count: number;
}

export interface ClientLens {
  view: 'client';
  client_id: string;
  open_cases: CanonicalCase[];
  sla: { ok: number; at_risk: number; missed: number };
  determinations: PortalDetermination[];
  appeals: CanonicalCase[];
  statements: StatementSummary[];
  config: ClientConfigSummary | null;
}

export function redactConfigForClient(fields: ClientConfigFields, version: number | null): ClientConfigSummary {
  return {
    client_id: fields.client_id,
    legal_name: fields.legal_name,
    sla_hours_standard: fields.sla_hours_standard,
    sla_hours_urgent: fields.sla_hours_urgent,
    timezone: fields.timezone,
    business_hours: fields.business_hours,
    escalation_contacts: fields.escalation_contacts,
    cx_owner: fields.cx_owner,
    notify_channels: fields.notify_channels,
    version,
  };
}

export function summarizeStatement(s: BillingStatement): StatementSummary {
  return {
    statement_id: s.statement_id,
    client_id: s.client_id,
    client_name: s.client_name,
    period_start: s.period_start,
    period_end: s.period_end,
    status: s.status,
    subtotal: s.subtotal,
    event_count: s.events.length,
  };
}

export function resolveClientLensTenant(viewer: SpineViewer, requested?: string | null): string {
  if (viewer.role === 'client') {
    return viewer.client_id || '__no_tenant__';
  }
  return requested || SYNTHETIC_CLIENT_ID;
}

export async function buildClientLens(
  viewer: SpineViewer,
  requestedClientId?: string | null,
): Promise<ClientLens> {
  const clientId = resolveClientLensTenant(viewer, requestedClientId);
  const spine = getCaseSpineService();
  const visible = await spine.listCases(viewer, { client_id: clientId });
  const open = visible.filter(isOpenCase);
  const sla = {
    ok: open.filter((c) => c.sla_status === 'ok').length,
    at_risk: open.filter((c) => c.sla_status === 'at_risk').length,
    missed: open.filter((c) => c.sla_status === 'missed').length,
  };

  const determinations: PortalDetermination[] = [];
  for (const c of visible.filter(isSignedForPortal)) {
    const pkg = await spine.getDeterminationPackage(c.case_id);
    determinations.push(toPortalDetermination(c, pkg, viewer));
  }

  const appeals = visible.filter((c) => c.type === 'first_level_appeal' || Boolean(c.parent_case_id));
  const statements = (await getMemoryStatementStore().list(clientId)).map(summarizeStatement);
  const latest = await getClientConfigService().getLatest(clientId);

  return {
    view: 'client',
    client_id: clientId,
    open_cases: open,
    sla,
    determinations,
    appeals,
    statements,
    config: latest ? redactConfigForClient(latest.config, latest.version) : null,
  };
}

/** Re-export so tests can assert notes never appear on this shape. */
export function clientLensHasCxNotes(lens: ClientLens): boolean {
  return 'notes' in lens || 'cx_notes' in lens || 'hypercare' in lens;
}
