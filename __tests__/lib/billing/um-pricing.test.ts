import { describe, expect, it } from 'vitest';
import { CaseSpineService, MemoryCaseSpineStore } from '@/lib/case-spine';
import { MemoryBillableEventLedger } from '@/lib/billing/events';
import { requireCriteriaCogs } from '@/lib/billing/criteria-cogs';
import { UmProductGuardError, assertNoAutoReviewFee } from '@/lib/billing/um-guards';
import { bookTiles, planningLockTiles } from '@/lib/billing/um-dashboard';
import { buildTwoLineInvoice, upsertPlatformLine, upsertUmReviewLine } from '@/lib/billing/um-invoice';
import {
  BASE_MIX,
  DECK_MILLION_HUNDREDTHS,
  MIX_SENSITIVITY,
  PUBLISHED_UNIT_RATES,
  UM_DENOMINATORS,
  UM_PRICE_CARD,
  baseYearExact,
  deckMillions,
  priceTouchStack,
  resolvePlatformPmpm,
  reviewCharge,
  stepDownBand,
  trailingAutoRate,
} from '@/lib/billing/um-price-card';

const NOW = new Date('2026-09-23T12:00:00.000Z');
const CLIENT = '11111111-1111-1111-1111-111111111111';

describe('two-line UM price card', () => {
  it('matches the locked base-year dollar products', () => {
    const year = baseYearExact();
    expect(year.platform).toBe(9_000_000);
    expect(year.nurse).toBe(24_225_000);
    expect(year.md).toBe(13_500_000);
    expect(year.external).toBe(7_875_000);
    expect(year.reviewRevenue).toBe(45_600_000);
    expect(year.totalRevenue).toBe(54_600_000);
    expect(year.rulesCogs).toBe(1_125_000);
    expect(year.nurseCogs).toBe(9_975_000);
    expect(year.mdCogs).toBe(5_400_000);
    expect(year.externalCogs).toBe(6_300_000);
    expect(year.variableCogs).toBe(22_800_000);
    expect(year.contribution).toBe(31_800_000);
    expect(BASE_MIX.auto.count + BASE_MIX.nurse.count + BASE_MIX.md.count + BASE_MIX.external.count).toBe(
      UM_DENOMINATORS.inboundAnnual,
    );
  });

  it('publishes the rounded deck millions without inventing a third total', () => {
    const sum =
      DECK_MILLION_HUNDREDTHS.platform +
      DECK_MILLION_HUNDREDTHS.nurse +
      DECK_MILLION_HUNDREDTHS.md +
      DECK_MILLION_HUNDREDTHS.external;
    expect(sum).toBe(DECK_MILLION_HUNDREDTHS.totalRevenue);
    expect(deckMillions(DECK_MILLION_HUNDREDTHS.totalRevenue)).toBe(54.61);
    expect(deckMillions(DECK_MILLION_HUNDREDTHS.variableCogs)).toBe(22.81);
    expect(deckMillions(DECK_MILLION_HUNDREDTHS.contribution)).toBe(31.8);
    expect(PUBLISHED_UNIT_RATES.totalPmpm).toBe(9.11);
    expect(PUBLISHED_UNIT_RATES.totalPepm).toBe(13.67);
    expect(MIX_SENSITIVITY.lean60.total).toBe(45_100_000);
    expect(MIX_SENSITIVITY.heavy40.pepm).toBe(16.07);
    expect(MIX_SENSITIVITY.platformAnnual).toBe(9_000_000);
  });

  it('steps review prices down with the trailing auto-rate and never steps the platform', () => {
    expect(stepDownBand(0.5).id).toBe('card');
    expect(stepDownBand(0.59).id).toBe('card');
    expect(reviewCharge('nurse', 0.55)).toBe(85);
    expect(reviewCharge('md', 0.55)).toBe(200);
    expect(reviewCharge('external', 0.55)).toBe(350);

    expect(stepDownBand(0.6).id).toBe('r16_60');
    expect(reviewCharge('nurse', 0.69)).toBe(75);
    expect(reviewCharge('md', 0.69)).toBe(185);
    expect(reviewCharge('external', 0.69)).toBe(330);

    expect(stepDownBand(0.7).id).toBe('r16_70');
    expect(reviewCharge('nurse', 0.7)).toBe(70);
    expect(reviewCharge('md', 0.9)).toBe(175);
    expect(reviewCharge('external', 1)).toBe(315);

    expect(reviewCharge('auto', 0.9)).toBe(0);
    expect(resolvePlatformPmpm()).toBe(UM_PRICE_CARD.platform.defaultPmpm);
    expect(resolvePlatformPmpm({ pmpm: 1.25 })).toBe(1.25);
    expect(UM_PRICE_CARD.platform.stepsDown).toBe(false);
    expect(() => resolvePlatformPmpm({ pmpm: 1 })).toThrow(/band/);
  });

  it('excludes voids and duplicates from the auto-rate', () => {
    const received = NOW.toISOString();
    const rate = trailingAutoRate(
      [
        { route: 'auto', received_at: received, state: 'received' },
        { route: 'auto', received_at: received, state: 'withdrawn' },
        { route: 'nurse', received_at: received, duplicate_of_case_id: 'dup' },
        { route: 'md', received_at: received, state: 'determined' },
        { route: 'nurse', received_at: '2020-01-01T00:00:00.000Z', state: 'determined' },
      ],
      NOW,
    );
    expect(rate).toBe(0.5);
  });
});

describe('two-line invoice', () => {
  it('bills platform plus one review tier and still posts auto at $0', async () => {
    const invoice = buildTwoLineInvoice({
      clientId: CLIENT,
      periodStart: '2026-09-01T00:00:00.000Z',
      periodEnd: '2026-09-30T23:59:59.000Z',
      livesInMonth: 100,
      employeesInMonth: 80,
      cases: [
        {
          case_id: 'nurse-1',
          bill_tier: 'nurse',
          charge_amount: 85,
          cost_amount: 35,
          excluded: false,
        },
        {
          case_id: 'auto-1',
          bill_tier: 'auto',
          charge_amount: 0,
          cost_amount: 3,
          excluded: false,
        },
      ],
    });

    expect(invoice.platform.amount).toBe(150);
    expect(invoice.platform.pmpm).toBe(1.5);
    expect(invoice.reviews).toHaveLength(2);
    expect(invoice.reviews.find((row) => row.case_id === 'auto-1')?.amount).toBe(0);
    expect(invoice.review_amount).toBe(85);
    expect(invoice.total).toBe(235);
    expect(invoice.variable_cogs).toBe(38);
    expect(invoice.contribution).toBe(197);
    expect(invoice.pepm).toBe(2.94);
    expect(invoice.pmpm).toBe(2.35);
    expect(invoice.denominator_label).toMatch(/80 employees/);
    expect(invoice.denominator_label).toMatch(/100 lives/);
    expect(requireCriteriaCogs('nurse').criteria_engine).toBe('required_stub');
    expect(requireCriteriaCogs('auto').fully_loaded_cost).toBe(3);

    const ledger = new MemoryBillableEventLedger();
    const auto = await upsertUmReviewLine(ledger, {
      caseId: 'auto-1',
      clientId: CLIENT,
      tier: 'auto',
      charge: 0,
      cost: 3,
      touchStack: ['auto'],
      occurredAt: NOW.toISOString(),
    });
    expect(auto.sku).toBe('um_review');
    expect(auto.unit_price).toBe(0);
    expect(auto.status).toBe('open');
    const platform = await upsertPlatformLine(ledger, {
      clientId: CLIENT,
      periodKey: '2026-09',
      livesInMonth: 100,
      pmpm: 1.5,
      occurredAt: NOW.toISOString(),
    });
    expect(platform.sku).toBe('um_platform');
    expect(platform.unit_price).toBe(150);
    expect(await ledger.list({ client_id: CLIENT })).toHaveLength(2);
  });

  it('refuses a review fee on auto', () => {
    expect(() => assertNoAutoReviewFee('auto', 85)).toThrow(UmProductGuardError);
    expect(() =>
      buildTwoLineInvoice({
        clientId: CLIENT,
        periodStart: '2026-09-01T00:00:00.000Z',
        periodEnd: '2026-09-30T23:59:59.000Z',
        livesInMonth: 1,
        cases: [
          { case_id: 'bad', bill_tier: 'auto', charge_amount: 10, cost_amount: 3, excluded: false },
        ],
      }),
    ).toThrow(/R2/);
  });
});

describe('case spine review routing', () => {
  it('posts auto at $0 and invoices a stacked touch once', async () => {
    const ledger = new MemoryBillableEventLedger();
    const spine = new CaseSpineService(new MemoryCaseSpineStore(), () => NOW, ledger);
    const created = await spine.createCase({
      client_id: CLIENT,
      intake: { external_id: 'ext-price', member_ref: 'memb_price', received_at: NOW.toISOString() },
    });
    const auto = await spine.assignReviewRoute(
      created.case.case_id,
      { touch: 'auto', auto_reason: 'rules_clear', trailing_auto_rate: 0.55 },
      'router',
    );
    expect(auto.case.route).toBe('auto');
    expect(auto.case.billable).toBe(false);
    expect(auto.case.charge_amount).toBe(0);
    expect(auto.case.cost_amount).toBe(3);
    expect(auto.case.auto_reason).toBe('rules_clear');
    expect(auto.review_event?.unit_price).toBe(0);
    expect(auto.review_event?.sku).toBe('um_review');

    const stacked = await spine.assignReviewRoute(
      created.case.case_id,
      { touch: 'md', trailing_auto_rate: 0.55, gold_card: true },
      'router',
    );
    expect(stacked.case.touch_stack).toEqual(['auto', 'md']);
    expect(stacked.case.route).toBe('md');
    expect(stacked.case.bill_tier).toBe('md');
    expect(stacked.case.billable).toBe(true);
    expect(stacked.case.charge_amount).toBe(200);
    expect(stacked.case.gold_card).toBe(true);
    const rows = (await ledger.getByCase(created.case.case_id)).filter((row) => row.sku === 'um_review');
    expect(rows).toHaveLength(1);
    expect(rows[0].unit_price).toBe(200);
    expect(rows[0].touch_stack).toEqual(['auto', 'md']);

    const stepped = priceTouchStack({
      touchStack: ['nurse'],
      autoRateValue: 0.72,
    });
    expect(stepped.charge_amount).toBe(70);
  });

  it('blocks an AI medical-necessity deny and allows a clinician deny', async () => {
    const ledger = new MemoryBillableEventLedger();
    const spine = new CaseSpineService(new MemoryCaseSpineStore(), () => NOW, ledger);
    const created = await spine.createCase({
      client_id: CLIENT,
      priority: 'standard',
      packet_storage_keys: ['s3://synth/packet/deny.pdf'],
      intake: {
        external_id: 'ext-deny',
        member_ref: 'memb_deny',
        service_or_rx: 'CPT-73721',
        received_at: NOW.toISOString(),
        clinicals_pointer: 's3://synth/packet/deny.pdf',
      },
    });
    await spine.transitionCase(created.case.case_id, { to_state: 'intake_validated' });
    await spine.transitionCase(created.case.case_id, { to_state: 'routed' });
    await spine.attachBrief(created.case.case_id, { criteria_result: 'gray', enqueue_md: true });

    await expect(
      spine.signDetermination(
        created.case.case_id,
        {
          determination: 'deny',
          rationale: 'Model says not necessary.',
          actor_kind: 'ai',
          deny_reason_code: 'medical_necessity',
        },
        'model',
      ),
    ).rejects.toMatchObject({ code: 'r9_ai_deny_mn' });
    expect(await ledger.getByCase(created.case.case_id)).toHaveLength(0);

    const signed = await spine.signDetermination(
      created.case.case_id,
      {
        determination: 'deny',
        rationale: 'Clinician denies medical necessity.',
        actor_kind: 'clinician',
        deny_reason_code: 'medical_necessity',
      },
      'md_synth',
    );
    expect(signed.case.determination).toBe('deny');
    expect(signed.case.signer_id).toBe('md_synth');
  });
});

describe('UM pricing tiles', () => {
  it('labels planning denominators and leaves first-pass undefined', () => {
    const tiles = planningLockTiles();
    expect(tiles.inbound).toBe(750_000);
    expect(tiles.auto_pct).toBe(50);
    expect(tiles.nurse_pct).toBe(38);
    expect(tiles.md_pct).toBe(9);
    expect(tiles.external_pct).toBe(3);
    expect(tiles.first_pass_pct).toBeNull();
    expect(tiles.billed_pepm).toBe(13.67);
    expect(tiles.billed_pmpm).toBe(9.11);
    expect(tiles.contribution).toBe(31_800_000);
    expect(tiles.denominator_label).toMatch(/333k EE/);
    expect(tiles.denominator_label).toMatch(/500k lives/);
  });

  it('omits book PEPM when employee and lives counts are absent', () => {
    const tiles = bookTiles([
      { route: 'auto', charge_amount: 0, cost_amount: 3 },
      { route: 'nurse', charge_amount: 85, cost_amount: 35 },
      { route: 'nurse', state: 'withdrawn', charge_amount: 85, cost_amount: 35 },
    ]);
    expect(tiles.inbound).toBe(2);
    expect(tiles.auto_pct).toBe(50);
    expect(tiles.nurse_pct).toBe(50);
    expect(tiles.billed_pepm).toBeNull();
    expect(tiles.billed_pmpm).toBeNull();
    expect(tiles.contribution).toBe(47);
    expect(tiles.denominator_label).toMatch(/omitted/);
  });
});
