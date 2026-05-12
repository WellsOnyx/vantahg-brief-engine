import { describe, it, expect } from 'vitest';

// Demo-mode bootstrap. The route short-circuits when isDemoMode() is true,
// so we don't have to mock auth/supabase/storage for the happy path.
vi.mock('@/lib/supabase', () => ({
  hasSupabaseConfig: () => false,
  getSupabase: () => ({}),
  getServiceClient: () => ({}),
  supabase: {},
}));

// requireRole is hit BEFORE the demo-mode short-circuit. Return a fake admin
// auth result so we get past the gate.
vi.mock('@/lib/auth-guard', () => ({
  requireRole: async () => ({ user: { email: 'admin@vantaum.test', id: 'u1' } }),
}));

vi.mock('@/lib/rate-limit-middleware', () => ({
  applyRateLimit: async () => null,
}));

describe('POST /api/admin/contracts/[id]/send-for-signature', () => {
  it('returns deterministic demo envelope id in demo mode', async () => {
    const { POST } = await import('@/app/api/admin/contracts/[id]/send-for-signature/route');
    const request = new Request('http://localhost:3000/api/admin/contracts/abc/send-for-signature', {
      method: 'POST',
    });
    const response = await POST(request as any, { params: Promise.resolve({ id: 'abc' }) });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.demo).toBe(true);
    expect(data.signature_request_id).toBe('demo-sig-abc');
    expect(data.status).toBe('sent');
  });
});
