import { describe, it, expect } from 'vitest';
import {
  createCustomer,
  createProduct,
  createInvoice,
  getInvoice,
  meowStatusToLocal,
  type MeowInvoiceStatus,
} from '@/lib/billing/meow-client';

/**
 * Demo-mode tests. isRealMeowEnabled() returns false when no Meow env
 * vars are set (which is the default in tests), so every call returns
 * a deterministic stub.
 */

describe('Meow client - demo mode', () => {
  it('createCustomer returns a stub with predictable id', async () => {
    const r = await createCustomer({ nickname: 'Acme TPA', email: 'a@a.test' });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.demo).toBe(true);
      expect(r.data.id).toBe('demo-customer-acme-tpa');
      expect(r.data.nickname).toBe('Acme TPA');
      expect(r.data.email).toBe('a@a.test');
    }
  });

  it('createProduct returns a stub with decimal-string price', async () => {
    const r = await createProduct({ name: 'VantaUM PEPM', default_price: 2.4 });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.id).toBe('demo-product-vantaum-pepm');
      expect(r.data.default_price).toBe('2.40');
    }
  });

  it('createInvoice totals line items correctly in the stub', async () => {
    const r = await createInvoice({
      customer_id: 'demo-customer-x',
      collection_account_id: '00000000-0000-0000-0000-000000000000',
      invoice_date: '2026-05-01',
      due_date: '2026-05-31',
      payment_method_types: ['BANK_TRANSFER', 'ACH_DIRECT_DEBIT'],
      send_email_on_creation: true,
      line_items: [
        { product_id: 'p1', quantity: 1500, price: 2.4 },
      ],
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.total).toBe('3600.00');
      expect(r.data.status).toBe('OPEN');
    }
  });

  it('getInvoice returns a stub with OPEN status', async () => {
    const r = await getInvoice('any-id');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.id).toBe('any-id');
      expect(r.data.status).toBe('OPEN');
    }
  });
});

describe('meowStatusToLocal', () => {
  const cases: Array<[MeowInvoiceStatus, string]> = [
    ['DRAFT', 'draft'],
    ['OPEN', 'sent'],
    ['PAID', 'paid'],
    ['UNCOLLECTIBLE', 'void'],
    ['VOID', 'void'],
  ];
  for (const [meow, local] of cases) {
    it(`maps ${meow} -> ${local}`, () => {
      expect(meowStatusToLocal(meow)).toBe(local);
    });
  }
});
