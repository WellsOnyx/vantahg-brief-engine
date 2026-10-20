import { beforeEach, describe, expect, it, vi } from 'vitest';
import { __setIroDocumentStorageForTests, createMemoryDocumentStorage } from '@/lib/iro/portal/documents';
import { __setIroPortalStoreForTests, createMemoryIroPortalStore } from '@/lib/iro/portal/store';

vi.mock('@/lib/supabase', () => ({
  hasSupabaseConfig: () => false,
  getSupabase: () => ({}),
  getServiceClient: () => ({}),
  supabase: {},
}));

vi.mock('@/lib/rate-limit-middleware', () => ({
  applyRateLimit: vi.fn().mockResolvedValue(null),
}));

const authUser = { id: 'staff-intake', email: 'intake@staff.invalid', role: 'concierge' as const };

vi.mock('@/lib/auth-guard', () => ({
  requireAuth: vi.fn(async () => ({ user: authUser })),
}));

describe('IRO portal HTTP', () => {
  beforeEach(() => {
    authUser.id = 'staff-intake';
    authUser.role = 'concierge';
    __setIroPortalStoreForTests(createMemoryIroPortalStore());
    __setIroDocumentStorageForTests(createMemoryDocumentStorage());
    delete process.env.LIVE_PHI_ENABLED;
    delete process.env.ENABLE_AWS_DB;
    delete process.env.DATABASE_URL;
    delete process.env.ENABLE_AWS_STORAGE;
    delete process.env.AWS_BAA_SIGNED;
    delete process.env.IRO_PORTAL_MFA_REQUIRED;
  });

  it('refuses real intake while the gate is off', async () => {
    const { POST } = await import('@/app/api/iro/cases/route');
    const res = await POST(jsonRequest({
      state_code: 'OH',
      receipts: { carrier_receipt_at: '2026-10-01T14:00:00.000Z', state_receipt_at: null, vanta_receipt_at: '2026-10-01T18:30:00.000Z' },
    }));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe('live_phi_disabled');
  });

  it('opens an Ohio case when the gate is on and audits the read', async () => {
    process.env.LIVE_PHI_ENABLED = 'true';
    process.env.ENABLE_AWS_DB = 'true';
    process.env.DATABASE_URL = 'postgres://vantaum@db.internal/vantaum';
    process.env.ENABLE_AWS_STORAGE = 'true';
    const { POST, GET } = await import('@/app/api/iro/cases/route');
    const created = await POST(jsonRequest({
      id: 'iro-oh-http-0001',
      state_code: 'OH',
      receipts: { carrier_receipt_at: '2026-10-01T14:00:00.000Z', state_receipt_at: null, vanta_receipt_at: '2026-10-01T18:30:00.000Z' },
    }));
    expect(created.status).toBe(200);
    const body = await created.json();
    expect(body.case.synthetic).toBe(false);
    expect(body.case.stage_label).toBe('Intake');
    expect(body.case.live_mail).toBe(false);
    const list = await GET(new Request('http://localhost/api/iro/cases'));
    expect(list.status).toBe(200);
    const listed = await list.json();
    expect(listed.cases).toHaveLength(1);
    const { GET: read } = await import('@/app/api/iro/cases/[id]/route');
    const one = await read(new Request('http://localhost/api/iro/cases/iro-oh-http-0001'), {
      params: Promise.resolve({ id: 'iro-oh-http-0001' }),
    });
    expect(one.status).toBe(200);
    const detail = await one.json();
    expect(detail.audit_count).toBeGreaterThan(0);
  });

  it('rejects a patient-name field and a non-staff role', async () => {
    process.env.LIVE_PHI_ENABLED = 'true';
    process.env.ENABLE_AWS_DB = 'true';
    process.env.DATABASE_URL = 'postgres://vantaum@db.internal/vantaum';
    process.env.ENABLE_AWS_STORAGE = 'true';
    const { POST } = await import('@/app/api/iro/cases/route');
    const phi = await POST(jsonRequest({
      state_code: 'OH',
      patient_name: 'Hidden',
      receipts: { carrier_receipt_at: '2026-10-01T14:00:00.000Z', state_receipt_at: null, vanta_receipt_at: null },
    }));
    expect(phi.status).toBe(400);
    expect((await phi.json()).error).toBe('phi_field_refused');
    authUser.role = 'client';
    const denied = await POST(jsonRequest({
      state_code: 'OH',
      receipts: { carrier_receipt_at: '2026-10-01T14:00:00.000Z', state_receipt_at: null, vanta_receipt_at: null },
    }));
    expect(denied.status).toBe(403);
  });
});

function jsonRequest(body: unknown): Request {
  return new Request('http://localhost/api/iro/cases', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}
