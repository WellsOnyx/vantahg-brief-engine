import { describe, expect, it } from 'vitest';
import { CaseSpineService, MemoryCaseSpineStore } from '@/lib/case-spine';
import {
  MemoryBillableEventLedger,
  getMemoryBillableEventLedger,
  mintBillableEvent,
  resetMemoryBillableEventLedger,
} from '@/lib/billing/events';
import { getBillableEventLedger } from '@/lib/billing/ledger';
import { billableEventToRow, rowToBillableEvent } from '@/lib/billing/ledger-pg';
import {
  generateMonthlyStatement,
  MemoryStatementStore,
  renderStatementPdf,
} from '@/lib/billing/statement';
import { upsertUmReviewLine } from '@/lib/billing/um-invoice';
import { upsertMonthlyPlatformLine, resolvePlatformCensus } from '@/lib/billing/um-platform';
import { UM_PRICE_CARD } from '@/lib/billing/um-price-card';
import { OTHER_SYNTHETIC_CLIENT_ID, SYNTHETIC_CLIENT_ID } from '@/lib/intake/constants';

const NOW = new Date('2026-09-23T12:00:00.000Z');

const INTAKE = {
  external_id: 'ext-wire',
  member_ref: 'memb_wire',
  requesting_provider: 'prov_wire',
  service_or_rx: 'CPT-73721',
  place_of_service: 'office',
  urgency: 'standard' as const,
  clinicals_pointer: 's3://synth/packet/wire.pdf',
  received_at: NOW.toISOString(),
  benefit_type: 'medical' as const,
};

async function readyToSign(clientId: string, priority: 'standard' | 'urgent' = 'standard') {
  const ledger = new MemoryBillableEventLedger();
  const spine = new CaseSpineService(new MemoryCaseSpineStore(), () => NOW, ledger);
  const created = await spine.createCase({
    client_id: clientId,
    priority,
    packet_storage_keys: ['s3://synth/packet/wire.pdf'],
    intake: { ...INTAKE, urgency: priority },
  });
  await spine.transitionCase(created.case.case_id, { to_state: 'intake_validated' });
  await spine.transitionCase(created.case.case_id, { to_state: 'routed' });
  await spine.attachBrief(created.case.case_id, { criteria_result: 'meet', enqueue_md: true });
  return { ledger, spine, caseId: created.case.case_id };
}

describe('case close posts the locked review line', () => {
  it('posts auto at $0 and does not open a ledger row before a route exists', async () => {
    const ledger = new MemoryBillableEventLedger();
    const spine = new CaseSpineService(new MemoryCaseSpineStore(), () => NOW, ledger);
    const created = await spine.createCase({
      client_id: SYNTHETIC_CLIENT_ID,
      intake: { external_id: 'ext-empty', member_ref: 'memb_empty', received_at: NOW.toISOString() },
    });
    expect(created.case.touch_stack).toEqual([]);
    expect(await ledger.getByCase(created.case.case_id)).toHaveLength(0);

    const auto = await spine.assignReviewRoute(
      created.case.case_id,
      { touch: 'auto', auto_reason: 'rules_clear', trailing_auto_rate: 0.55 },
      'router',
    );
    expect(auto.case.billable).toBe(false);
    expect(auto.case.charge_amount).toBe(0);
    expect(auto.review_event?.sku).toBe('um_review');
    expect(auto.review_event?.unit_price).toBe(0);
    expect((await ledger.getByCase(created.case.case_id)).filter((row) => row.sku === 'um_review')).toHaveLength(1);
  });

  it('charges nurse, md, and external from the card and steps down when a trailing rate is passed', async () => {
    const ledger = new MemoryBillableEventLedger();
    const spine = new CaseSpineService(new MemoryCaseSpineStore(), () => NOW, ledger);

    async function routed(touch: 'nurse' | 'md' | 'external', rate: number) {
      const created = await spine.createCase({
        client_id: SYNTHETIC_CLIENT_ID,
        intake: {
          external_id: `ext-${touch}-${rate}`,
          member_ref: `memb_${touch}`,
          received_at: NOW.toISOString(),
        },
      });
      return spine.assignReviewRoute(
        created.case.case_id,
        { touch, trailing_auto_rate: rate },
        'router',
      );
    }

    const nurse = await routed('nurse', 0.55);
    const md = await routed('md', 0.55);
    const external = await routed('external', 0.55);
    const stepped = await routed('nurse', 0.72);

    expect(nurse.case.charge_amount).toBe(85);
    expect(nurse.case.billable).toBe(true);
    expect(md.case.charge_amount).toBe(200);
    expect(external.case.charge_amount).toBe(350);
    expect(stepped.case.charge_amount).toBe(70);
    expect(stepped.case.cost_amount).toBe(UM_PRICE_CARD.review.nurse.cost);
    expect(stepped.review_event?.unit_price).toBe(70);
  });

  it('keeps gold-card at $0 on MD sign and does not stack a second review fee', async () => {
    const { ledger, spine, caseId } = await readyToSign(SYNTHETIC_CLIENT_ID);
    await spine.assignReviewRoute(caseId, { touch: 'nurse', trailing_auto_rate: 0.55, gold_card: true }, 'router');
    const signed = await spine.signDetermination(
      caseId,
      { determination: 'approve', rationale: 'Gold-card provider. Synthetic.' },
      'md_synth',
    );
    expect(signed.case.gold_card).toBe(true);
    expect(signed.case.billable).toBe(false);
    expect(signed.case.charge_amount).toBe(0);
    expect(signed.case.bill_tier).toBe('auto');
    const reviews = (await ledger.getByCase(caseId)).filter((row) => row.sku === 'um_review');
    expect(reviews).toHaveLength(1);
    expect(reviews[0].unit_price).toBe(0);
    expect(reviews[0].touch_stack).toEqual(['nurse']);
  });

  it('MD sign posts one um_review at the md tier and keeps legacy SKUs only for the synthetic pack', async () => {
    const synthetic = await readyToSign(SYNTHETIC_CLIENT_ID, 'urgent');
    const signed = await synthetic.spine.signDetermination(
      synthetic.caseId,
      { determination: 'approve', rationale: 'Synthetic MD sign.' },
      'md_synth',
    );
    expect(signed.case.touch_stack).toEqual(['md']);
    expect(signed.case.charge_amount).toBe(200);
    const rows = await synthetic.ledger.getByCase(synthetic.caseId);
    expect(rows.filter((row) => row.sku === 'um_review')).toHaveLength(1);
    expect(rows.some((row) => row.sku === 'prior_auth')).toBe(true);
    expect(rows.some((row) => row.sku === 'rush_addon')).toBe(true);

    const nurseFirst = await readyToSign(SYNTHETIC_CLIENT_ID);
    await nurseFirst.spine.assignReviewRoute(
      nurseFirst.caseId,
      { touch: 'nurse', trailing_auto_rate: 0.55 },
      'router',
    );
    await nurseFirst.spine.signDetermination(
      nurseFirst.caseId,
      { determination: 'approve', rationale: 'Escalated to MD.' },
      'md_synth',
    );
    const stacked = (await nurseFirst.ledger.getByCase(nurseFirst.caseId)).filter((row) => row.sku === 'um_review');
    expect(stacked).toHaveLength(1);
    expect(stacked[0].unit_price).toBe(200);
    expect(stacked[0].touch_stack).toEqual(['nurse', 'md']);
    expect(stacked[0].unit_price).not.toBe(85 + 200);

    const other = await readyToSign(OTHER_SYNTHETIC_CLIENT_ID);
    await other.spine.signDetermination(
      other.caseId,
      { determination: 'approve', rationale: 'Commercial client sign.' },
      'md_synth',
    );
    const otherRows = await other.ledger.getByCase(other.caseId);
    expect(otherRows.map((row) => row.sku)).toEqual(['um_review']);
    expect(otherRows[0].unit_price).toBe(200);
  });
});

describe('monthly platform line', () => {
  it('upserts one um_platform row from lives-in-month and refuses a silent $0 platform', async () => {
    const ledger = new MemoryBillableEventLedger();
    const skipped = await upsertMonthlyPlatformLine(ledger, {
      clientId: SYNTHETIC_CLIENT_ID,
      periodKey: '2026-09',
      livesInMonth: null,
      occurredAt: NOW.toISOString(),
    });
    expect(skipped).toBeNull();
    expect(await ledger.list()).toHaveLength(0);

    const first = await upsertMonthlyPlatformLine(ledger, {
      clientId: SYNTHETIC_CLIENT_ID,
      periodKey: '2026-09',
      livesInMonth: 100,
      occurredAt: NOW.toISOString(),
    });
    expect(first?.sku).toBe('um_platform');
    expect(first?.unit_price).toBe(150);
    const again = await upsertMonthlyPlatformLine(ledger, {
      clientId: SYNTHETIC_CLIENT_ID,
      periodKey: '2026-09',
      livesInMonth: 80,
      occurredAt: NOW.toISOString(),
    });
    expect(again?.billable_event_id).toBe(first?.billable_event_id);
    expect(again?.unit_price).toBe(120);
    expect(await ledger.list({ client_id: SYNTHETIC_CLIENT_ID })).toHaveLength(1);

    const waived = await upsertMonthlyPlatformLine(ledger, {
      clientId: SYNTHETIC_CLIENT_ID,
      periodKey: '2026-10',
      livesInMonth: 10,
      waived: true,
      occurredAt: NOW.toISOString(),
    });
    expect(waived?.unit_price).toBe(0);

    expect(() =>
      resolvePlatformCensus({ livesInMonth: 10, waived: false, pmpm: 0 }),
    ).toThrow(/band|waiver|\$0/);
  });
});

describe('statement two-line presentation', () => {
  it('drops legacy SKUs when um_review exists and itemizes $0 auto next to the platform line', async () => {
    const ledger = new MemoryBillableEventLedger();
    const store = new MemoryStatementStore();
    await ledger.insert(
      mintBillableEvent({
        case_id: 'case-auto',
        client_id: SYNTHETIC_CLIENT_ID,
        sku: 'prior_auth',
        occurred_at: '2026-09-10T12:00:00.000Z',
      }),
    );
    await upsertUmReviewLine(ledger, {
      caseId: 'case-auto',
      clientId: SYNTHETIC_CLIENT_ID,
      tier: 'auto',
      charge: 0,
      cost: 3,
      touchStack: ['auto'],
      occurredAt: '2026-09-10T12:00:00.000Z',
    });
    await upsertUmReviewLine(ledger, {
      caseId: 'case-md',
      clientId: SYNTHETIC_CLIENT_ID,
      tier: 'md',
      charge: 200,
      cost: 80,
      touchStack: ['md'],
      occurredAt: '2026-09-11T12:00:00.000Z',
    });
    await upsertMonthlyPlatformLine(ledger, {
      clientId: SYNTHETIC_CLIENT_ID,
      periodKey: '2026-09',
      livesInMonth: 100,
      occurredAt: '2026-09-01T00:00:00.000Z',
    });

    const statement = await generateMonthlyStatement(ledger, store, {
      client_id: SYNTHETIC_CLIENT_ID,
      as_of: NOW,
      lives_in_month: 100,
      employees_in_month: 80,
      platform_pmpm: 1.5,
    });

    expect(statement.events.map((event) => event.sku).sort()).toEqual(['um_platform', 'um_review', 'um_review']);
    expect(statement.events.some((event) => event.sku === 'prior_auth')).toBe(false);
    expect(statement.subtotal).toBe(350);
    expect(statement.two_line?.platform.amount).toBe(150);
    expect(statement.two_line?.platform.label).toMatch(/\$1\.50 PMPM/);
    expect(statement.two_line?.platform.label).toMatch(/100/);
    expect(statement.two_line?.clinical.find((line) => line.case_id === 'case-auto')?.zero_priced).toBe(true);
    expect(statement.two_line?.clinical.find((line) => line.case_id === 'case-auto')?.label).toBe('auto / gold-card');
    expect(statement.two_line?.review_amount).toBe(200);
    expect(statement.two_line?.denominator_label).toMatch(/80 employees/);
    expect(statement.two_line?.denominator_label).toMatch(/100 lives/);
    expect(statement.two_line?.denominator_label).toMatch(/333k EE/);
    expect(statement.html).toContain('Platform');
    expect(statement.html).toContain('Clinical review');
    expect(statement.html).toContain('auto / gold-card');
    expect(statement.html).toContain('$0.00');
    expect(statement.html).toContain('um_review');
    expect(statement.html).not.toContain('prior_auth');

    const pdf = renderStatementPdf(statement);
    expect(pdf.subarray(0, 5).toString('utf8')).toBe('%PDF-');
  });
});

describe('RDS ledger mapping', () => {
  it('uses the memory ledger unless ENABLE_AWS_DB is on, and round-trips 032 columns', () => {
    resetMemoryBillableEventLedger();
    expect(getBillableEventLedger()).toBe(getMemoryBillableEventLedger());
    const event = mintBillableEvent({
      case_id: 'case-map',
      client_id: SYNTHETIC_CLIENT_ID,
      sku: 'prior_auth',
      occurred_at: NOW.toISOString(),
    });
    event.sku = 'um_review';
    event.line_kind = 'um_review';
    event.bill_tier = 'nurse';
    event.cost_amount = 35;
    event.touch_stack = ['nurse'];
    event.unit_price = 85;
    const row = billableEventToRow(event);
    row.unit_price = '85.00';
    row.cost_amount = '35';
    row.quantity = '1';
    const back = rowToBillableEvent(row);
    expect(back.sku).toBe('um_review');
    expect(back.unit_price).toBe(85);
    expect(back.cost_amount).toBe(35);
    expect(back.bill_tier).toBe('nurse');
    expect(back.touch_stack).toEqual(['nurse']);
    expect(back.line_kind).toBe('um_review');
  });
});
