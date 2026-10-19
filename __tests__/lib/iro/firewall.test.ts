import { describe, expect, it } from 'vitest';
import {
  exportLine,
  isOnIroQueue,
  linesFromExplicitGrants,
  reportLine,
  routeIntake,
  searchLine,
  type FirewallAuditEvent,
  type LineActor,
  type LineScopedRecord,
} from '@/lib/lines';
import { applyIroAction, createIroCase, iroWorkQueue } from '@/lib/iro';
import { IRO_FEE_SCHEDULES } from '@/lib/iro/config/fee-schedule';
import { DEFAULT_IRO_ACCESS_POLICY } from '@/lib/iro/config/access-policy';
import { STATE_SETTINGS_REGISTRY } from '@/lib/iro/config/state-settings';
import { URAC_IRO_BASELINE } from '@/lib/iro/config/urac-baseline';
import { stubCredentialingService, stubMailingAdapter, stubStorageAdapter } from '@/lib/iro/adapters/stubs';
import type { IroActor, IroDeps } from '@/lib/iro';

const NOW = '2026-10-19T15:00:00.000Z';

function record(line: LineScopedRecord['line_of_business'], id: string): LineScopedRecord {
  return {
    id,
    case_id: id,
    company: 'VANTA_HG',
    line_of_business: line,
    kind: 'case',
  };
}

function actor(partial: Partial<LineActor> & Pick<LineActor, 'id' | 'lines'>): LineActor {
  return {
    companies: ['VANTA_HG'],
    case_restricted: false,
    assigned_case_ids: [],
    line_wide: false,
    ...partial,
  };
}

describe('line firewall', () => {
  const idr = record('IDR', 'idr-syn-1');
  const iro = record('IRO', 'iro-syn-1');
  const med = record('MEDICAL_REVIEW', 'mr-syn-1');
  const rows = [idr, iro, med];

  it('denies cross-line case, report, export, and search access and audits the denial', () => {
    const audit: FirewallAuditEvent[] = [];
    const iroOnly = actor({ id: 'iro-user', lines: ['IRO'] });
    const options = { now: () => NOW, audit };

    expect(searchLine(iroOnly, rows, { line: 'IDR' }, options)).toMatchObject({
      ok: false,
      code: 'cross_line',
      rows: [],
    });
    expect(reportLine(iroOnly, rows, { line: 'MEDICAL_REVIEW' }, options).ok).toBe(false);
    expect(exportLine(iroOnly, rows, { line: 'IDR' }, options).ok).toBe(false);

    const own = searchLine(iroOnly, rows, { line: 'IRO' }, options);
    expect(own.ok).toBe(true);
    if (own.ok) expect(own.rows.map((row) => row.id)).toEqual(['iro-syn-1']);

    expect(audit.map((event) => event.record_line).sort()).toEqual(['IDR', 'IDR', 'MEDICAL_REVIEW']);
    expect(audit.every((event) => event.type === 'line_access_denied')).toBe(true);
    expect(JSON.stringify(audit)).not.toMatch(/patient|dob|member/i);
  });

  it('keeps a case-restricted actor on assigned cases inside their line', () => {
    const audit: FirewallAuditEvent[] = [];
    const assigned = actor({
      id: 'coord',
      lines: ['IRO'],
      case_restricted: true,
      assigned_case_ids: ['iro-syn-1'],
    });
    const other = record('IRO', 'iro-syn-2');
    const seen = searchLine(assigned, [iro, other], { line: 'IRO' }, { audit, now: () => NOW });
    expect(seen.ok).toBe(true);
    if (seen.ok) expect(seen.rows.map((row) => row.id)).toEqual(['iro-syn-1']);
  });

  it('does not let a med-review contract open the IRO line', () => {
    expect(
      linesFromExplicitGrants({
        vanta_med_review_contract: true,
        explicit_lines: ['MEDICAL_REVIEW'],
      }),
    ).toEqual(['MEDICAL_REVIEW']);
  });

  it('routes non-IRO intake out of the IRO queue', () => {
    expect(isOnIroQueue(routeIntake('iro'))).toBe(true);
    for (const kind of ['idre', 'idr', 'um', 'medical_review', 'internal_review'] as const) {
      const route = routeIntake(kind);
      expect(route.stop).toBe(true);
      expect(route.iro_queue).toBe(false);
      expect(isOnIroQueue(route)).toBe(false);
    }
    expect(routeIntake('idre').target_line).toBe('IDR');
    expect(routeIntake('medical_review').target_line).toBe('MEDICAL_REVIEW');
    expect(routeIntake('um').target_line).toBeNull();
  });

  it('drops a classified UM request from the IRO work queue', () => {
    const deps: IroDeps = {
      now: () => NOW,
      settings: STATE_SETTINGS_REGISTRY.versions,
      fees: IRO_FEE_SCHEDULES,
      urac: URAC_IRO_BASELINE,
      policy: DEFAULT_IRO_ACCESS_POLICY,
      credentials: stubCredentialingService({}),
      mailing: stubMailingAdapter(() => NOW),
      storage: stubStorageAdapter(),
      audit: [],
    };
    const coordinator: IroActor = {
      id: 'syn-coord',
      role: 'iro_coordinator',
      companies: ['VANTA_HG'],
      lines: ['IRO'],
      case_restricted: false,
      assigned_case_ids: [],
      line_wide: false,
      selector: 'vanta',
      clearance_role: null,
    };
    const created = createIroCase(
      {
        id: 'iro-syn-misroute',
        state_code: 'OH',
        receipts: {
          carrier_receipt_at: NOW,
          state_receipt_at: null,
          vanta_receipt_at: NOW,
        },
      },
      coordinator,
      deps,
    );
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const logged = applyIroAction(
      created.case,
      {
        type: 'log_intake',
        timezone: 'America/New_York',
        arrival_channel: 'synthetic_upload',
        referring_entity_ref: 'SYN-PLAN',
        original_request_ref: 'SYN-REQ',
      },
      coordinator,
      deps,
    );
    const classified = applyIroAction(
      logged.case,
      { type: 'classify', category: 'um', expedited: false, review_question: 'SYN-Q' },
      coordinator,
      deps,
    );
    expect(classified.ok).toBe(false);
    if (classified.ok) return;
    expect(classified.code).toBe('routed_out_of_iro');
    expect(iroWorkQueue([classified.case])).toEqual([]);

    const medActor: IroActor = { ...coordinator, id: 'mr-user', lines: ['MEDICAL_REVIEW'] };
    const denied = applyIroAction(created.case, { type: 'pause_deadline' }, medActor, deps);
    expect(denied.ok).toBe(false);
    if (!denied.ok) expect(denied.code).toBe('cross_line');
  });
});
