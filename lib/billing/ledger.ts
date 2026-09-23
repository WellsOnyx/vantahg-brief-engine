/**
 * Ledger selector. ENABLE_AWS_DB uses the RDS store (030/032).
 * Otherwise the process-local memory ledger, including demo and tests.
 */

import { getMemoryBillableEventLedger, type BillableEventLedger } from './events';
import { getPgBillableEventLedger } from './ledger-pg';

export function usesRdsBillableLedger(): boolean {
  return process.env.ENABLE_AWS_DB === 'true';
}

export function getBillableEventLedger(): BillableEventLedger {
  if (usesRdsBillableLedger()) return getPgBillableEventLedger();
  return getMemoryBillableEventLedger();
}
