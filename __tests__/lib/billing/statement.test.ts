import { describe, expect, it } from 'vitest';
import {
  MemoryBillableEventLedger,
  mintBillableEvent,
  SYNTHETIC_FEE_SCHEDULE,
} from '@/lib/billing/events';
import { generateMonthlyStatement, MemoryStatementStore } from '@/lib/billing/statement';

const CLIENT = '11111111-1111-1111-1111-111111111111';
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
    await ledger.insert(
      mintBillableEvent({
        case_id: 'case-other',
        client_id: '22222222-2222-2222-2222-222222222222',
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
    expect(statement.status).toBe('draft');

    const listed = await store.list(CLIENT);
    expect(listed).toHaveLength(1);
    expect(listed[0].event_ids).toHaveLength(2);
  });
});
