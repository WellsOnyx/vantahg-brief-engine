import { describe, it, expect } from 'vitest';

// Mock supabase so we're in demo mode
vi.mock('@/lib/supabase', () => ({
  hasSupabaseConfig: () => false,
  getSupabase: () => ({}),
  getServiceClient: () => ({}),
  supabase: {},
}));

// Mock supabase-server for auth
vi.mock('@/lib/supabase-server', () => ({
  createServerClient: async () => ({
    auth: {
      getUser: async () => ({ data: { user: null }, error: null }),
    },
    from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: null, error: null }) }) }) }),
  }),
}));

// Mock claude.ts to avoid Anthropic SDK browser error
vi.mock('@/lib/claude', () => ({
  generateClinicalBrief: async () => '{}',
}));

describe('POST /api/generate-brief', () => {
  it('returns 400 when case_id is missing', async () => {
    const { POST } = await import('@/app/api/generate-brief/route');
    const request = new Request('http://localhost:3000/api/generate-brief', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    const response = await POST(request as any);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain('case_id');
  });

  it('returns demo brief for valid demo case id', async () => {
    // Import demo data to get a valid demo case ID
    const { getDemoCases } = await import('@/lib/demo-mode');
    const cases = getDemoCases();
    const caseWithBrief = cases.find((c) => c.ai_brief);

    if (caseWithBrief) {
      const { POST } = await import('@/app/api/generate-brief/route');
      const request = new Request('http://localhost:3000/api/generate-brief', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ case_id: caseWithBrief.id }),
      });
      const response = await POST(request as any);

      expect(response.status).toBe(200);
    }
  });
});
