import { describe, expect, it } from 'vitest';
import { MemoryBillableEventLedger, recordBillableEventsForSign } from '@/lib/billing/events';
import { CaseSpineService, MemoryCaseSpineStore } from '@/lib/case-spine';
import {
  REPORT_CSV_COLUMNS,
  buildReportBundle,
  parseCsvHeader,
  reportToCsv,
} from '@/lib/reporting';

const NOW = new Date('2026-09-18T18:00:00.000Z');
const CLIENT = '11111111-1111-1111-1111-111111111111';

async function signedMix() {
  const store = new MemoryCaseSpineStore();
  const ledger = new MemoryBillableEventLedger();
  const spine = new CaseSpineService(store, () => NOW, ledger);

  async function make(
    suffix: string,
    receivedAt: string,
    sign?: {
      determination: 'approve' | 'deny' | 'pend' | 'partial';
      rationale: string;
      deny_reason_code?: 'criteria_not_met';
      cm_flags?: Array<'high_cost'>;
    },
  ) {
    const created = await spine.createCase({
      client_id: CLIENT,
      external_id: `ext-synth-rpt-${suffix}`,
      packet_storage_keys: [`s3://synth/packet/rpt-${suffix}.pdf`],
      intake: {
        external_id: `ext-synth-rpt-${suffix}`,
        member_ref: `memb_synth_rpt_${suffix}`,
        received_at: receivedAt,
        benefit_type: 'medical',
      },
    });
    if (!sign) return created.case;
    await spine.transitionCase(created.case.case_id, { to_state: 'intake_validated' });
    await spine.transitionCase(created.case.case_id, { to_state: 'routed' });
    await spine.attachBrief(created.case.case_id, { criteria_result: 'fail', enqueue_md: true });
    const signed = await spine.signDetermination(created.case.case_id, sign, 'md_synth');
    return signed.case;
  }

  await make('open', '2026-09-16T08:00:00.000Z');
  await make('approve', '2026-09-16T10:00:00.000Z', {
    determination: 'approve',
    rationale: 'Synthetic approve.',
  });
  await make('deny', '2026-09-17T10:00:00.000Z', {
    determination: 'deny',
    rationale: 'Synthetic deny.',
    deny_reason_code: 'criteria_not_met',
    cm_flags: ['high_cost'],
  });
  await make('pend', '2026-09-17T12:00:00.000Z', {
    determination: 'pend',
    rationale: 'Synthetic pend.',
  });

  const cases = await spine.listCases({ id: 'test', role: 'superadmin' }, { client_id: CLIENT });
  const events = await ledger.list({ client_id: CLIENT });
  return { cases, events, ledger };
}

describe('Phase 6 client reports', () => {
  it('volume signed matches distinct ledger case ids', async () => {
    const { cases, events } = await signedMix();
    const bundle = buildReportBundle({ cases, ledger: events }, { client_id: CLIENT });
    expect(bundle.volume.kind).toBe('volume');
    expect(bundle.signed_cases).toBe(3);
    expect(bundle.ledger_signed).toBe(3);
    expect(bundle.volume.totals.signed).toBe(3);
    expect(bundle.volume.totals.ledger_signed).toBe(3);
    expect(bundle.volume.ledger_match).toBe(true);
    expect(bundle.volume.totals.received).toBe(4);
    expect(bundle.volume.totals.open).toBeGreaterThanOrEqual(1);
  });

  it('CSV columns match the 08 report contract', async () => {
    const { cases, events } = await signedMix();
    const bundle = buildReportBundle({ cases, ledger: events }, { client_id: CLIENT, grain: 'day' });

    expect(parseCsvHeader(reportToCsv(bundle.volume))).toEqual([...REPORT_CSV_COLUMNS.volume]);
    expect(parseCsvHeader(reportToCsv(bundle.turnaround))).toEqual([...REPORT_CSV_COLUMNS.turnaround]);
    expect(parseCsvHeader(reportToCsv(bundle.outcomes))).toEqual([...REPORT_CSV_COLUMNS.outcomes]);
    expect(parseCsvHeader(reportToCsv(bundle.deny_reasons))).toEqual([...REPORT_CSV_COLUMNS.deny_reasons]);
    expect(parseCsvHeader(reportToCsv(bundle.sla))).toEqual([...REPORT_CSV_COLUMNS.sla]);

    expect(bundle.turnaround.rows.every((r) => typeof r.hours === 'number')).toBe(true);
    expect(bundle.turnaround.p50_hours).not.toBeNull();
    expect(bundle.outcomes.counts.approve).toBe(1);
    expect(bundle.outcomes.counts.deny).toBe(1);
    expect(bundle.deny_reasons.rows).toHaveLength(1);
    expect(bundle.deny_reasons.rows[0].deny_reason_code).toBe('criteria_not_met');
    expect(bundle.sla.counts.hit + bundle.sla.counts.miss + bundle.sla.counts.at_risk).toBe(bundle.sla.rows.length);
  });

  it('ledger void rows do not inflate signed volume', async () => {
    const { cases, ledger } = await signedMix();
    const extra = await recordBillableEventsForSign(ledger, {
      billable_event_id: 'void-synth',
      case_id: 'case-void-synth',
      client_id: CLIENT,
      type: 'prior_auth',
      priority: 'standard',
      occurred_at: NOW.toISOString(),
    });
    extra[0].status = 'void';
    extra[0].void_reason = 'test';
    await ledger.update(extra[0]);
    const events = await ledger.list({ client_id: CLIENT });
    const bundle = buildReportBundle({ cases, ledger: events }, { client_id: CLIENT });
    expect(bundle.volume.ledger_match).toBe(true);
    expect(bundle.ledger_signed).toBe(bundle.signed_cases);
  });
});
