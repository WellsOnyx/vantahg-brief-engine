import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

/**
 * Tests for GET /api/clinician/summary — the personal day-plan view
 * backing /clinician. Same harness pattern as quality-audits.test.ts:
 * empty Supabase env puts the route in demo mode; NODE_ENV decides
 * whether demo mode authenticates (dev) or 401s (prod).
 */

vi.mock('@/lib/rate-limit-middleware', () => ({
  applyRateLimit: vi.fn().mockResolvedValue(null),
}));

vi.mock('@/lib/audit', () => ({
  logAuditEvent: vi.fn().mockResolvedValue(undefined),
  logSecurityEvent: vi.fn().mockResolvedValue(undefined),
}));

function clearSupabaseEnv() {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
  vi.stubEnv('SUPABASE_URL', '');
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '');
}

function makeRequest(query: string) {
  return new Request(`https://app.vantaum.com/api/clinician/summary${query}`) as never;
}

const ROSA_LPN = 'staff-001-rosa-martinez-lpn';
const CARTER_RN = 'staff-004-michelle-carter-rn';
const LOPEZ_ADMIN = 'staff-006-carlos-lopez-admin';

describe('GET /api/clinician/summary', () => {
  beforeEach(() => vi.resetModules());
  afterEach(() => vi.unstubAllEnvs());

  it('returns 401 in production demo mode', async () => {
    clearSupabaseEnv();
    vi.stubEnv('NODE_ENV', 'production');
    const { GET } = await import('@/app/api/clinician/summary/route');
    const res = await GET(makeRequest(`?staff_id=${ROSA_LPN}`));
    expect(res.status).toBe(401);
  });

  it('returns 400 when staff_id is missing', async () => {
    clearSupabaseEnv();
    vi.stubEnv('NODE_ENV', 'development');
    const { GET } = await import('@/app/api/clinician/summary/route');
    const res = await GET(makeRequest(''));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/staff_id/);
  });

  it('returns 404 for an unknown staff member in dev demo mode', async () => {
    clearSupabaseEnv();
    vi.stubEnv('NODE_ENV', 'development');
    const { GET } = await import('@/app/api/clinician/summary/route');
    const res = await GET(makeRequest('?staff_id=staff-does-not-exist'));
    expect(res.status).toBe(404);
  });

  it('returns 400 for admin_staff — day plans are clinical-only', async () => {
    clearSupabaseEnv();
    vi.stubEnv('NODE_ENV', 'development');
    const { GET } = await import('@/app/api/clinician/summary/route');
    const res = await GET(makeRequest(`?staff_id=${LOPEZ_ADMIN}`));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/lpn and rn/);
  });

  it('returns staff, EDF-ordered plan, and quality summary for an LPN', async () => {
    clearSupabaseEnv();
    vi.stubEnv('NODE_ENV', 'development');
    const { GET } = await import('@/app/api/clinician/summary/route');
    const res = await GET(makeRequest(`?staff_id=${ROSA_LPN}`));
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.staff.id).toBe(ROSA_LPN);
    expect(body.staff.role).toBe('lpn');

    // Plan shape + invariants
    expect(body.plan.next_case_id).toBe(body.plan.ordered[0]?.case.id ?? null);
    expect(body.plan.capacity.active_count).toBe(body.plan.ordered.length);
    expect(['on_track', 'tight', 'at_risk']).toContain(body.plan.feasibility);

    // Every queued case belongs to this LPN in an active LPN status
    for (const p of body.plan.ordered) {
      expect(p.case.assigned_lpn_id).toBe(ROSA_LPN);
      expect(['lpn_review', 'pend_missing_info']).toContain(p.case.status);
    }

    // EDF: deadlines are non-decreasing across deadline-bearing entries
    const deadlines = body.plan.ordered
      .map((p: { case: { turnaround_deadline: string | null } }) => p.case.turnaround_deadline)
      .filter(Boolean)
      .map((d: string) => new Date(d).getTime());
    const sorted = [...deadlines].sort((a, b) => a - b);
    expect(deadlines).toEqual(sorted);

    // Rosa has a completed demo audit, so the summary is populated
    expect(body.quality.audit_count).toBeGreaterThan(0);
    expect(body.quality.avg_overall_score).not.toBeNull();
  });

  it('limits an RN plan to their personal rn_review cases (no pod oversight)', async () => {
    clearSupabaseEnv();
    vi.stubEnv('NODE_ENV', 'development');
    const { GET } = await import('@/app/api/clinician/summary/route');
    const res = await GET(makeRequest(`?staff_id=${CARTER_RN}`));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.staff.role).toBe('rn');
    for (const p of body.plan.ordered) {
      expect(p.case.assigned_rn_id).toBe(CARTER_RN);
      expect(p.case.status).toBe('rn_review');
    }
  });
});
