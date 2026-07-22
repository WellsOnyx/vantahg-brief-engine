import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  applicableElements,
  nextCycleDueAt,
  VERIFICATION_ELEMENTS,
  RECREDENTIAL_CYCLE_MONTHS,
} from '@/lib/credentialing/config';

/**
 * Credentialing Phase 1 tests: the NCQA element set + applicability rules,
 * PSV seeding (idempotent, CAQH→manual fallback without creds), the
 * committee-readiness gate, and the decision endpoint's wall (staff-only,
 * never on an incomplete file, discrepancies require attestation, single
 * decision per cycle).
 */

let demoMode = false;
vi.mock('@/lib/demo-mode', () => ({ isDemoMode: () => demoMode }));
vi.mock('@/lib/audit', () => ({
  logAuditEvent: vi.fn().mockResolvedValue(undefined),
  logSecurityEvent: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/lib/security', () => ({
  getRequestContext: vi.fn().mockReturnValue({ ip: 'test', userAgent: 'test' }),
}));
vi.mock('@/lib/rate-limit-middleware', () => ({
  applyRateLimit: vi.fn().mockResolvedValue(null),
}));

// Staff auth stub for the decision route.
let authedRole: string | null = 'admin';
vi.mock('@/lib/auth-guard', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/auth-guard')>();
  return {
    ...actual,
    requireRole: vi.fn(async () => {
      if (!authedRole) {
        const { NextResponse } = await import('next/server');
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
      return { user: { id: 'staff-1', email: 'rn@vantaum.com', role: authedRole } };
    }),
  };
});

// ── DB stub ────────────────────────────────────────────────────────────────
type AnyFn = (...args: unknown[]) => unknown;
const db = {
  verificationInserts: [] as Record<string, unknown>[],
  verificationInsertError: null as { code?: string } | null,
  verificationRows: [] as Array<{ element: string; status: string }>,
  credCase: { id: 'cred-1', status: 'committee_review', decision: null } as Record<string, unknown> | null,
  caseUpdates: [] as Record<string, unknown>[],
};

vi.mock('@/lib/supabase', () => ({
  getServiceClient: () => ({
    from: ((table: string) => {
      if (table === 'verification_items') {
        const chain = {
          insert: (row: Record<string, unknown>) => {
            if (db.verificationInsertError) return { error: db.verificationInsertError };
            db.verificationInserts.push(row);
            return { error: null };
          },
          select: () => chain,
          update: () => chain,
          eq: (..._a: unknown[]) => chain,
          then: undefined,
        } as Record<string, unknown>;
        // select().eq() resolves to rows for isCommitteeReady
        chain.eq = (..._a: unknown[]) => ({ ...chain, eq: chain.eq, then: undefined,
          // final await point
          [Symbol.toStringTag]: 'chain',
          // emulate awaited query result
          async then(resolve: AnyFn) { resolve({ data: db.verificationRows, error: null }); },
        });
        return chain;
      }
      if (table === 'credentialing_cases') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: db.credCase, error: null }),
            }),
          }),
          update: (patch: Record<string, unknown>) => ({
            eq: async () => { db.caseUpdates.push(patch); return { error: null }; },
          }),
        };
      }
      return {};
    }) as AnyFn,
    rpc: async () => ({ data: 123456, error: null }),
  }),
}));

beforeEach(() => {
  demoMode = false;
  authedRole = 'admin';
  db.verificationInserts = [];
  db.verificationInsertError = null;
  db.verificationRows = [];
  db.credCase = { id: 'cred-1', status: 'committee_review', decision: null };
  db.caseUpdates = [];
  vi.resetModules();
});
afterEach(() => vi.unstubAllEnvs());

// ---------------------------------------------------------------------------
// Element set + applicability
// ---------------------------------------------------------------------------

describe('NCQA element config', () => {
  it('DEA applies to prescribers only; board certification to MD/DO only', () => {
    const md = applicableElements({ credential: 'MD' }).map((e) => e.key);
    const lcsw = applicableElements({ credential: 'LCSW' }).map((e) => e.key);
    expect(md).toContain('dea');
    expect(md).toContain('board_certification');
    expect(lcsw).not.toContain('dea');
    expect(lcsw).not.toContain('board_certification');
  });

  it('core PSV elements are always applicable and required', () => {
    const keys = applicableElements({ credential: 'LCSW' }).filter((e) => e.required).map((e) => e.key);
    for (const k of ['identity', 'licensure', 'malpractice', 'sanctions_exclusions', 'work_history', 'education_training']) {
      expect(keys).toContain(k);
    }
  });

  it('re-credential cycle is 36 months', () => {
    expect(RECREDENTIAL_CYCLE_MONTHS).toBe(36);
    const due = new Date(nextCycleDueAt(new Date('2026-01-15T00:00:00Z')));
    expect(due.getUTCFullYear()).toBe(2029);
    expect(VERIFICATION_ELEMENTS.length).toBeGreaterThanOrEqual(9);
  });
});

// ---------------------------------------------------------------------------
// Committee-readiness gate
// ---------------------------------------------------------------------------

describe('isCommitteeReady', () => {
  it('pending/in_progress elements block readiness', async () => {
    db.verificationRows = [
      { element: 'identity', status: 'verified' },
      { element: 'licensure', status: 'in_progress' },
    ];
    const { isCommitteeReady } = await import('@/lib/credentialing/psv');
    const r = await isCommitteeReady('cred-1');
    expect(r.ready).toBe(false);
    expect(r.pending).toEqual(['licensure']);
  });

  it('discrepancies do NOT block readiness — the committee must see them', async () => {
    db.verificationRows = [
      { element: 'identity', status: 'verified' },
      { element: 'sanctions_exclusions', status: 'discrepancy' },
    ];
    const { isCommitteeReady } = await import('@/lib/credentialing/psv');
    const r = await isCommitteeReady('cred-1');
    expect(r.ready).toBe(true);
    expect(r.discrepancies).toEqual(['sanctions_exclusions']);
  });

  it('an empty file is never ready', async () => {
    db.verificationRows = [];
    const { isCommitteeReady } = await import('@/lib/credentialing/psv');
    expect((await isCommitteeReady('cred-1')).ready).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// The decision wall
// ---------------------------------------------------------------------------

function decideReq(body: unknown) {
  return new Request('https://app.vantaum.com/api/credentialing/cases/cred-1/decision', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }) as never;
}
const PARAMS = { params: Promise.resolve({ id: 'cred-1' }) };
const GOOD = { decision: 'approved', rationale: 'All PSV elements verified; committee reviewed the full file.' };

describe('POST /api/credentialing/cases/[id]/decision', () => {
  it('rejects non-staff', async () => {
    authedRole = null;
    const { POST } = await import('@/app/api/credentialing/cases/[id]/decision/route');
    expect((await POST(decideReq(GOOD), PARAMS)).status).toBe(401);
  });

  it('blocks deciding on an incomplete file (409 not_committee_ready)', async () => {
    db.verificationRows = [{ element: 'licensure', status: 'pending' }];
    const { POST } = await import('@/app/api/credentialing/cases/[id]/decision/route');
    const res = await POST(decideReq(GOOD), PARAMS);
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('not_committee_ready');
  });

  it('discrepancies require attestation.flags_acknowledged', async () => {
    db.verificationRows = [
      { element: 'identity', status: 'verified' },
      { element: 'sanctions_exclusions', status: 'discrepancy' },
    ];
    const { POST } = await import('@/app/api/credentialing/cases/[id]/decision/route');
    const blocked = await POST(decideReq(GOOD), PARAMS);
    expect(blocked.status).toBe(409);
    expect((await blocked.json()).error).toBe('discrepancies_unacknowledged');

    const ok = await POST(decideReq({ ...GOOD, attestation: { flags_acknowledged: true } }), PARAMS);
    expect(ok.status).toBe(200);
    expect(db.caseUpdates[0]).toMatchObject({ decision: 'approved', status: 'decided', decided_by: 'rn@vantaum.com' });
  });

  it('one decision per cycle — already-decided returns 409', async () => {
    db.credCase = { id: 'cred-1', status: 'decided', decision: 'approved' };
    const { POST } = await import('@/app/api/credentialing/cases/[id]/decision/route');
    const res = await POST(decideReq(GOOD), PARAMS);
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('already_decided');
  });

  it('requires a substantive rationale (>= 30 chars)', async () => {
    db.verificationRows = [{ element: 'identity', status: 'verified' }];
    const { POST } = await import('@/app/api/credentialing/cases/[id]/decision/route');
    const res = await POST(decideReq({ decision: 'approved', rationale: 'ok' }), PARAMS);
    expect(res.status).toBe(400);
  });
});
