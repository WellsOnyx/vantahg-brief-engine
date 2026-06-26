import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Reviewer-independence enforcement — REAL refusal tests.
 *
 * The bug being fixed was a green suite that never exercised refusal. These
 * tests actually attempt to assign a CONFLICTED reviewer (the original denier /
 * a reviewer tied to the case via appeal_of_case_id + original_denying_reviewer_id)
 * and assert they are REFUSED — across all four write paths:
 *   1. autoAssignReviewer  (physician auto-assign)
 *   2. assignToPod         (nursing auto-assign)
 *   3. appeal intake re-entry (an appeal case flowing into assignment)
 *   4. manual PATCH assignment (hand-assignment bypass)
 *
 * Plus the no-regression guarantee: a first-pass case (no appeal_of_case_id)
 * still assigns the same reviewer.
 */

import {
  getConflictedReviewerIds,
  filterIndependentReviewers,
  assertReviewerIndependent,
  ReviewerIndependenceError,
  type LineageLoader,
  type OriginalCaseTouchpoints,
} from '@/lib/reviewer-independence';

// ── Hoisted mock fns (referenced inside vi.mock factories) ──────────────────
const h = vi.hoisted(() => ({
  isDemoMode: vi.fn(() => true),
  getDemoCase: vi.fn(),
  getDemoCases: vi.fn(() => [] as unknown[]),
  getDemoReviewers: vi.fn(() => [] as unknown[]),
  getDemoStaff: vi.fn(() => [] as unknown[]),
  getDemoPods: vi.fn(() => [] as unknown[]),
  updateDemoCase: vi.fn(),
  logAuditEvent: vi.fn(async () => {}),
  getServiceClient: vi.fn(),
  requireAuth: vi.fn(async () => ({ user: { email: 'admin@vantaum.com', role: 'admin' } })),
  applyRateLimit: vi.fn(async () => null),
  getRequestContext: vi.fn(() => ({})),
  deliverToClient: vi.fn(async () => false),
}));

vi.mock('@/lib/demo-mode', () => ({
  isDemoMode: h.isDemoMode,
  getDemoCase: h.getDemoCase,
  getDemoCases: h.getDemoCases,
  getDemoReviewers: h.getDemoReviewers,
  getDemoStaff: h.getDemoStaff,
  getDemoPods: h.getDemoPods,
  updateDemoCase: h.updateDemoCase,
}));
vi.mock('@/lib/audit', () => ({
  logAuditEvent: h.logAuditEvent,
  logDataAccess: vi.fn(async () => {}),
  logSecurityEvent: vi.fn(async () => {}),
}));
vi.mock('@/lib/supabase', () => ({
  getServiceClient: h.getServiceClient,
  hasSupabaseConfig: () => true,
  supabase: {},
}));
vi.mock('@/lib/auth-guard', () => ({ requireAuth: h.requireAuth }));
vi.mock('@/lib/rate-limit-middleware', () => ({ applyRateLimit: h.applyRateLimit }));
vi.mock('@/lib/security', () => ({ getRequestContext: h.getRequestContext, redactName: (n: string) => n }));
vi.mock('@/lib/notifications', () => ({ deliverToClient: h.deliverToClient }));

// Imports of code-under-test AFTER the mocks are declared.
import { autoAssignReviewer } from '@/lib/assignment-engine';
import { assignToPod } from '@/lib/pod-assignment-engine';
import { PATCH } from '@/app/api/cases/[id]/route';

// ── Helpers ─────────────────────────────────────────────────────────────────
function fakeLoader(original: OriginalCaseTouchpoints | null, denier: string | null = null): LineageLoader {
  return {
    loadCaseTouchpoints: async () => original,
    loadOriginalDenyingReviewerId: async () => denier,
  };
}

// =============================================================================
// 0. Core refusal primitives (the shared logic every path uses)
// =============================================================================
describe('reviewer-independence — core refusal primitives', () => {
  const appealCase = { id: 'appeal-1', appeal_of_case_id: 'orig-1' };
  const firstPass = { id: 'case-1', appeal_of_case_id: null };
  const original: OriginalCaseTouchpoints = {
    assigned_reviewer_id: 'rev-001',
    determined_by: 'rev-001',
    assigned_rn_id: 'rn-007',
    assigned_lpn_id: 'lpn-003',
  };

  it('first-pass case yields ZERO conflicts (no-regression for the ~90% UM path)', async () => {
    const conflicts = await getConflictedReviewerIds(firstPass, fakeLoader(original, 'rev-001'));
    expect(conflicts.size).toBe(0);
  });

  it('appeal case excludes the original reviewer, decider, RN, LPN, and appeals denier', async () => {
    const conflicts = await getConflictedReviewerIds(appealCase, fakeLoader(original, 'rev-555'));
    expect([...conflicts].sort()).toEqual(['lpn-003', 'rev-001', 'rev-555', 'rn-007']);
  });

  it('assertReviewerIndependent THROWS for the original denier', async () => {
    await expect(
      assertReviewerIndependent(appealCase, 'rev-001', fakeLoader(original)),
    ).rejects.toBeInstanceOf(ReviewerIndependenceError);
  });

  it('assertReviewerIndependent ALLOWS an independent reviewer', async () => {
    await expect(
      assertReviewerIndependent(appealCase, 'rev-009', fakeLoader(original)),
    ).resolves.toBeUndefined();
  });

  it('filterIndependentReviewers removes the conflicted reviewer', async () => {
    const out = await filterIndependentReviewers(
      appealCase,
      [{ id: 'rev-001' }, { id: 'rev-009' }],
      fakeLoader(original),
    );
    expect(out.map((r) => r.id)).toEqual(['rev-009']);
  });

  it('filterIndependentReviewers FAILS CLOSED (empty) when only the conflicted reviewer exists', async () => {
    const out = await filterIndependentReviewers(appealCase, [{ id: 'rev-001' }], fakeLoader(original));
    expect(out).toHaveLength(0);
  });
});

// =============================================================================
// 1. autoAssignReviewer  &  3. appeal intake re-entry
// =============================================================================
describe('PATH 1 + 3 — autoAssignReviewer refuses the original denier on appeal re-entry', () => {
  const ORIG = { id: 'orig-1', determined_by: 'rev-001', assigned_reviewer_id: 'rev-001' };
  const APPEAL = { id: 'appeal-1', case_number: 'VUM-CARD-0001-APPEAL', service_category: 'cardiology', appeal_of_case_id: 'orig-1' };
  const FIRST = { id: 'first-1', case_number: 'VUM-CARD-0002', service_category: 'cardiology', appeal_of_case_id: null };

  beforeEach(() => {
    vi.clearAllMocks();
    h.isDemoMode.mockReturnValue(true);
    h.getDemoCase.mockImplementation((id: string) =>
      id === 'orig-1' ? ORIG : id === 'appeal-1' ? APPEAL : id === 'first-1' ? FIRST : null,
    );
  });

  it('REFUSES rev-001 (the denier) when they are the only candidate for the appeal', async () => {
    h.getDemoReviewers.mockReturnValue([
      { id: 'rev-001', name: 'Dr. Conflicted', status: 'active', approved_service_categories: ['cardiology'] },
    ]);
    const res = await autoAssignReviewer('appeal-1');
    expect(res.assigned).toBe(false);
    expect(res.reason).toBe('no_independent_reviewer');
  });

  it('assigns an INDEPENDENT reviewer (rev-009) and never the denier when both exist', async () => {
    h.getDemoReviewers.mockReturnValue([
      { id: 'rev-001', name: 'Dr. Conflicted', status: 'active', approved_service_categories: ['cardiology'] },
      { id: 'rev-009', name: 'Dr. Independent', status: 'active', approved_service_categories: ['cardiology'] },
    ]);
    const res = await autoAssignReviewer('appeal-1');
    expect(res.assigned).toBe(true);
    expect(res.reviewerId).toBe('rev-009');
    expect(res.reviewerId).not.toBe('rev-001');
  });

  it('NO REGRESSION: a first-pass case still assigns the same reviewer (rev-001)', async () => {
    h.getDemoReviewers.mockReturnValue([
      { id: 'rev-001', name: 'Dr. X', status: 'active', approved_service_categories: ['cardiology'] },
    ]);
    const res = await autoAssignReviewer('first-1');
    expect(res.assigned).toBe(true);
    expect(res.reviewerId).toBe('rev-001');
  });
});

// =============================================================================
// 2. assignToPod  (nursing auto-assign)
// =============================================================================
describe('PATH 2 — assignToPod refuses a nurse who decided the original case', () => {
  const ORIG = { id: 'orig-2', determined_by: 'lpn-003', assigned_lpn_id: 'lpn-003' };
  const APPEAL = { id: 'appeal-2', case_number: 'VUM-CARD-0003-APPEAL', service_category: 'cardiology', appeal_of_case_id: 'orig-2' };

  beforeEach(() => {
    vi.clearAllMocks();
    h.isDemoMode.mockReturnValue(true);
    h.getDemoCases.mockReturnValue([APPEAL]);
    h.getDemoCase.mockImplementation((id: string) => (id === 'orig-2' ? ORIG : null));
    h.getDemoPods.mockReturnValue([
      { id: 'pod-1', name: 'Cardio Pod', is_active: true, service_categories: ['cardiology'], lpn_ids: ['lpn-003', 'lpn-009'], rn_id: 'rn-100' },
    ]);
  });

  it('REFUSES when the only available pod LPN is the original decider (lpn-003)', async () => {
    h.getDemoStaff.mockReturnValue([{ id: 'lpn-003', name: 'Nurse Conflicted', status: 'active' }]);
    const res = await assignToPod('appeal-2');
    expect(res.assigned).toBe(false);
    expect(res.reason).toBe('no_independent_reviewer');
  });

  it('assigns the INDEPENDENT LPN (lpn-009) and never the conflicted one', async () => {
    h.getDemoStaff.mockReturnValue([
      { id: 'lpn-003', name: 'Nurse Conflicted', status: 'active' },
      { id: 'lpn-009', name: 'Nurse Independent', status: 'active' },
    ]);
    const res = await assignToPod('appeal-2');
    expect(res.assigned).toBe(true);
    expect(res.lpnId).toBe('lpn-009');
    expect(res.lpnId).not.toBe('lpn-003');
  });
});

// =============================================================================
// 4. manual PATCH assignment  (the hand-assignment bypass — LIVE path)
// =============================================================================
describe('PATH 4 — manual PATCH refuses (409) a conflicted reviewer and does not write', () => {
  let updateSpy: ReturnType<typeof vi.fn>;

  function makeSupabase(spy: ReturnType<typeof vi.fn>) {
    const resolve = (table: string, val: unknown) => {
      if (table === 'cases') {
        if (val === 'appeal-3') return { data: { id: 'appeal-3', appeal_of_case_id: 'orig-3' }, error: null };
        if (val === 'orig-3') return { data: { determined_by: 'rev-001', assigned_reviewer_id: 'rev-001' }, error: null };
      }
      return { data: null, error: null };
    };
    return {
      from(table: string) {
        let val: unknown;
        const chain: Record<string, unknown> = {
          select: () => chain,
          eq: (_c: string, v: unknown) => {
            val = v;
            return chain;
          },
          single: async () => resolve(table, val),
          maybeSingle: async () => resolve(table, val),
          update: () => spy(),
        };
        return chain;
      },
    };
  }

  function patchRequest(body: unknown) {
    return {
      json: async () => body,
      headers: { get: () => undefined },
      url: 'http://localhost/api/cases/appeal-3',
      method: 'PATCH',
    } as never;
  }
  const params = { params: Promise.resolve({ id: 'appeal-3' }) } as never;

  beforeEach(() => {
    vi.clearAllMocks();
    h.isDemoMode.mockReturnValue(false);
    updateSpy = vi.fn(() => ({
      eq: () => ({ select: () => ({ single: async () => ({ data: { id: 'appeal-3' }, error: null }) }) }),
    }));
    h.getServiceClient.mockReturnValue(makeSupabase(updateSpy));
  });

  it('REFUSES the original denier (rev-001) with HTTP 409 and never writes the assignment', async () => {
    const res = await PATCH(patchRequest({ assigned_reviewer_id: 'rev-001' }), params);
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.code).toBe('reviewer_independence_violation');
    expect(updateSpy).not.toHaveBeenCalled();
  });

  it('ALLOWS an independent reviewer (rev-009) through and performs the write', async () => {
    const res = await PATCH(patchRequest({ assigned_reviewer_id: 'rev-009' }), params);
    expect(res.status).not.toBe(409);
    expect(updateSpy).toHaveBeenCalled();
  });
});
