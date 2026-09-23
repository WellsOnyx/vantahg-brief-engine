import { describe, expect, it } from 'vitest';
import { CaseSpineService, MemoryCaseSpineStore } from '@/lib/case-spine';
import {
  MemoryBillableEventLedger,
  SYNTHETIC_FEE_SCHEDULE,
} from '@/lib/billing/events';

const NOW = new Date('2026-09-18T12:00:00.000Z');
const CLIENT = '11111111-1111-1111-1111-111111111111';

const INTAKE = {
  external_id: 'ext-synth-bill',
  member_ref: 'memb_synth_bill',
  requesting_provider: 'prov_synth_bill',
  service_or_rx: 'CPT-73721',
  place_of_service: 'office',
  urgency: 'urgent' as const,
  clinicals_pointer: 's3://synth/packet/bill.pdf',
  received_at: NOW.toISOString(),
  benefit_type: 'medical' as const,
};

describe('billable event on sign', () => {
  it('writes a real ledger row linked to the case (not just a stub id)', async () => {
    const ledger = new MemoryBillableEventLedger();
    const spine = new CaseSpineService(new MemoryCaseSpineStore(), () => NOW, ledger);
    const created = await spine.createCase({
      client_id: CLIENT,
      priority: 'urgent',
      packet_storage_keys: ['s3://synth/packet/bill.pdf'],
      intake: INTAKE,
    });
    await spine.transitionCase(created.case.case_id, { to_state: 'intake_validated' });
    await spine.transitionCase(created.case.case_id, { to_state: 'routed' });
    await spine.attachBrief(created.case.case_id, { criteria_result: 'meet', enqueue_md: true });
    const signed = await spine.signDetermination(
      created.case.case_id,
      { determination: 'approve', rationale: 'Synthetic sign creates ledger row.' },
      'md_synth',
    );

    expect(signed.case.billable_event_id).toBeTruthy();
    const rows = await ledger.getByCase(created.case.case_id);
    expect(rows.length).toBe(3);
    const primary = rows.find((r) => r.sku === 'prior_auth');
    const rush = rows.find((r) => r.sku === 'rush_addon');
    const review = rows.find((r) => r.sku === 'um_review');
    expect(review?.bill_tier).toBe('md');
    expect(review?.unit_price).toBe(200);
    expect(rows.filter((r) => r.sku === 'um_review')).toHaveLength(1);
    expect(primary?.billable_event_id).toBe(signed.case.billable_event_id);
    expect(primary?.client_id).toBe(CLIENT);
    expect(primary?.case_id).toBe(created.case.case_id);
    expect(primary?.status).toBe('open');
    expect(primary?.invoice_id).toBeNull();
    expect(primary?.unit_price).toBe(SYNTHETIC_FEE_SCHEDULE.prior_auth);
    expect(rush?.unit_price).toBe(SYNTHETIC_FEE_SCHEDULE.rush_addon);
    expect(await ledger.get(primary!.billable_event_id)).toMatchObject({
      sku: 'prior_auth',
      quantity: 1,
      currency: 'USD',
    });
  });
});
