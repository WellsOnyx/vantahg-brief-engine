import { describe, it, expect } from 'vitest';

// Mock the supabase module so isDemoMode returns true
vi.mock('@/lib/supabase', () => ({
  hasSupabaseConfig: () => false,
  getSupabase: () => ({}),
  getServiceClient: () => ({}),
}));

// Need to import after mocking
const { isDemoMode, getDemoCases, getDemoReviewers, getDemoClients } = await import('@/lib/demo-mode');

describe('isDemoMode', () => {
  it('returns true when Supabase config is not available', () => {
    expect(isDemoMode()).toBe(true);
  });
});

describe('getDemoCases', () => {
  it('returns an array of cases', () => {
    const cases = getDemoCases();
    expect(Array.isArray(cases)).toBe(true);
    expect(cases.length).toBeGreaterThan(0);
  });

  it('filters by status', () => {
    const cases = getDemoCases({ status: 'brief_ready' });
    for (const c of cases) {
      expect(c.status).toBe('brief_ready');
    }
  });

  it('filters by service_category', () => {
    const all = getDemoCases();
    const categories = new Set(all.map((c) => c.service_category));
    if (categories.size > 0) {
      const first = [...categories][0];
      const filtered = getDemoCases({ service_category: first });
      for (const c of filtered) {
        expect(c.service_category).toBe(first);
      }
    }
  });

  it('each case has required fields', () => {
    const cases = getDemoCases();
    for (const c of cases) {
      expect(c.id).toBeTruthy();
      expect(c.case_number).toBeTruthy();
      expect(c.status).toBeTruthy();
    }
  });
});

describe('getDemoReviewers', () => {
  it('returns an array of reviewers', () => {
    const reviewers = getDemoReviewers();
    expect(Array.isArray(reviewers)).toBe(true);
    expect(reviewers.length).toBeGreaterThan(0);
  });
});

describe('getDemoClients', () => {
  it('returns an array of clients', () => {
    const clients = getDemoClients();
    expect(Array.isArray(clients)).toBe(true);
    expect(clients.length).toBeGreaterThan(0);
  });
});
