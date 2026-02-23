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

describe('GET /api/cases', () => {
  it('returns demo cases in demo mode', async () => {
    const { GET } = await import('@/app/api/cases/route');
    const request = new Request('http://localhost:3000/api/cases');
    const response = await GET(request as any);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBeGreaterThan(0);
  });

  it('filters demo cases by status', async () => {
    const { GET } = await import('@/app/api/cases/route');
    const request = new Request('http://localhost:3000/api/cases?status=brief_ready');
    const response = await GET(request as any);
    const data = await response.json();

    for (const c of data) {
      expect(c.status).toBe('brief_ready');
    }
  });
});
