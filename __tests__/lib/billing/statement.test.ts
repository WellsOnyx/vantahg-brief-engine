import { describe, expect, it } from 'vitest';
import {
  MemoryBillableEventLedger,
  mintBillableEvent,
  SYNTHETIC_FEE_SCHEDULE,
} from '@/lib/billing/events';
import {
  generateMonthlyStatement,
  MemoryStatementStore,
  renderStatementPdf,
  runSyntheticMonthlyStatementJob,
} from '@/lib/billing/statement';
import { OTHER_SYNTHETIC_CLIENT_ID, SYNTHETIC_CLIENT_ID } from '@/lib/intake/constants';

const CLIENT = SYNTHETIC_CLIENT_ID;
const AS_OF = new Date('2026-09-18T12:00:00.000Z');

describe('monthly statement stub', () => {
  it('lists open events for one test client', async () => {
    const ledger = new MemoryBillableEventLedger();
    const store = new MemoryStatementStore();
    await ledger.insert(
      mintBillableEvent({
        case_id: 'case-a',
        client_id: CLIENT,
        sku: 'prior_auth',
        occurred_at: '2026-09-10T12:00:00.000Z',
      }),
    );
    await ledger.insert(
      mintBillableEvent({
        case_id: 'case-b',
        client_id: CLIENT,
        sku: 'first_level_appeal',
        occurred_at: '2026-09-12T12:00:00.000Z',
      }),
    );
    const invoiced = mintBillableEvent({
      case_id: 'case-invoiced',
      client_id: CLIENT,
      sku: 'prior_auth',
      occurred_at: '2026-09-11T12:00:00.000Z',
    });
    invoiced.status = 'invoiced';
    await ledger.insert(invoiced);
    await ledger.insert(
      mintBillableEvent({
        case_id: 'case-other',
        client_id: OTHER_SYNTHETIC_CLIENT_ID,
        sku: 'prior_auth',
        occurred_at: '2026-09-12T12:00:00.000Z',
      }),
    );

    const statement = await generateMonthlyStatement(ledger, store, {
      client_id: CLIENT,
      client_name: 'Synthetic Staging TPA',
      as_of: AS_OF,
    });

    expect(statement.events).toHaveLength(2);
    expect(statement.events.map((e) => e.case_id).sort()).toEqual(['case-a', 'case-b']);
    expect(statement.subtotal).toBe(
      SYNTHETIC_FEE_SCHEDULE.prior_auth + SYNTHETIC_FEE_SCHEDULE.first_level_appeal,
    );
    expect(statement.html).toContain('prior_auth');
    expect(statement.html).toContain('first_level_appeal');
    expect(statement.html).not.toContain('case-other');
    expect(statement.html).not.toContain('case-invoiced');
    expect(statement.status).toBe('draft');
    expect(statement.events.every((e) => e.status === 'open')).toBe(true);
    expect(statement.events.every((e) => e.statement_id === statement.statement_id)).toBe(true);

    const stamped = await ledger.list({ client_id: CLIENT, status: 'open' });
    expect(stamped.every((e) => e.statement_id === statement.statement_id)).toBe(true);
    expect((await ledger.getByCase('case-other'))[0].statement_id).toBeNull();
    expect((await ledger.getByCase('case-invoiced'))[0].status).toBe('invoiced');
    expect((await ledger.getByCase('case-invoiced'))[0].statement_id).toBeNull();

    const listed = await store.list(CLIENT);
    expect(listed).toHaveLength(1);
    expect(listed[0].event_ids).toHaveLength(2);
  });

  it('renders a PDF for the synthetic test client', async () => {
    const ledger = new MemoryBillableEventLedger();
    const store = new MemoryStatementStore();
    await ledger.insert(
      mintBillableEvent({
        case_id: 'case-pdf',
        client_id: CLIENT,
        sku: 'prior_auth',
        occurred_at: '2026-09-10T12:00:00.000Z',
      }),
    );

    const statement = await generateMonthlyStatement(ledger, store, {
      client_id: CLIENT,
      client_name: 'Synthetic Staging TPA',
      as_of: AS_OF,
    });
    const pdf = renderStatementPdf(statement);
    expect(pdf.subarray(0, 5).toString('utf8')).toBe('%PDF-');
    expect(pdf.length).toBeGreaterThan(200);
  });

  it('monthly job is locked to the synthetic staging client', async () => {
    await expect(
      runSyntheticMonthlyStatementJob({ client_id: OTHER_SYNTHETIC_CLIENT_ID }),
    ).rejects.toThrow('statement_stub_synthetic_only');
  });
});
