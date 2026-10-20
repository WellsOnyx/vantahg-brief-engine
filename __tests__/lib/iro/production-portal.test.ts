import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';
import { evaluateAssignment } from '@/lib/credentialing';
import { documentStoragePlan } from '@/lib/iro/portal/documents';
import { evaluateLivePhiGate } from '@/lib/iro/portal/live-phi';
import { OHIO_LIVE_CASE_ID, runOhioLivePath } from '@/lib/iro/portal/ohio-path';
import { resolvePortalRole, toIroActor } from '@/lib/iro/portal/roles';
import { readMfaStatus } from '@/lib/iro/portal/mfa';
import { actOnIroCase, openIroCase, readIroCase } from '@/lib/iro/portal/service';
import { createMemoryIroPortalStore } from '@/lib/iro/portal/store';

const OPEN_ENV: NodeJS.ProcessEnv = {
  LIVE_PHI_ENABLED: 'true',
  ENABLE_AWS_DB: 'true',
  DATABASE_URL: 'postgres://vantaum@db.internal/vantaum',
  ENABLE_AWS_STORAGE: 'true',
};

describe('live PHI gate', () => {
  it('stays off unless LIVE_PHI_ENABLED is true on the existing AWS flags', () => {
    expect(evaluateLivePhiGate({}).allowed).toBe(false);
    expect(evaluateLivePhiGate({}).code).toBe('live_phi_disabled');
    expect(evaluateLivePhiGate({ LIVE_PHI_ENABLED: 'true' }).code).toBe('aws_db_required');
    expect(
      evaluateLivePhiGate({ LIVE_PHI_ENABLED: 'true', ENABLE_AWS_DB: 'true', DATABASE_URL: 'postgres://db/vantaum' }).code,
    ).toBe('aws_storage_required');
    const open = evaluateLivePhiGate(OPEN_ENV);
    expect(open.allowed).toBe(true);
    expect(open.baa).toBe('signed');
    expect(evaluateLivePhiGate({ ...OPEN_ENV, AWS_BAA_SIGNED: 'false' })).toMatchObject({
      allowed: false,
      code: 'baa_revoked',
      baa: 'revoked',
    });
  });
});

describe('Ohio production path', () => {
  it('runs the six SOP stages on a real-shaped record with shared credentialing and no live mail', async () => {
    const store = createMemoryIroPortalStore();
    const run = await runOhioLivePath({ store });
    expect(run.case.id).toBe(OHIO_LIVE_CASE_ID);
    expect(run.case.synthetic).toBe(false);
    expect(run.case.stage_label).toBe('Notice / close');
    expect(run.case.closed).toBe(true);
    expect(run.case.md_signed).toBe(true);
    expect(run.case.review_outcome).toBe('overturned');
    expect(run.case.reviewer_id).toBe('syn-reviewer-oh');
    expect(run.live_mail).toBe(false);
    expect(run.case.delivery_state).toBe('delivered');
    expect(run.storage_key.startsWith(`iro/${OHIO_LIVE_CASE_ID}/`)).toBe(true);
    expect(run.audit_count).toBeGreaterThan(6);
    const stored = await store.getCase(OHIO_LIVE_CASE_ID);
    expect(stored?.case.line_of_business).toBe('IRO');
    expect(stored?.case.company).toBe('VANTA_HG');
    const trail = await store.listAudit(OHIO_LIVE_CASE_ID);
    expect(trail.some((row) => row.action === 'read')).toBe(true);
    expect(trail.some((row) => row.action === 'create')).toBe(true);
    expect(trail.some((row) => row.action === 'md_signoff' && row.code === 'ok')).toBe(true);
    expect(JSON.stringify(trail)).not.toMatch(/patient_name|member_id|ssn/);
    const credentials = await store.getCredentialing();
    const again = evaluateAssignment(
      credentials,
      {
        line: 'IRO',
        reviewer_id: 'syn-reviewer-oh',
        due_at: stored!.case.deadline!.due_at,
        state_code: 'OH',
      },
      '2026-10-20T15:00:00.000Z',
    );
    expect(again.ok).toBe(true);
  });

  it('refuses intake when the gate is off and blocks a reviewer who is not assigned', async () => {
    const store = createMemoryIroPortalStore();
    const ctx = {
      store,
      now: () => '2026-10-20T15:00:00.000Z',
      gate: evaluateLivePhiGate({}),
    };
    const intake = { id: 'staff-intake', email: 'intake@staff.invalid', role: 'concierge' as const };
    const refused = await openIroCase(
      intake,
      {
        state_code: 'OH',
        receipts: { carrier_receipt_at: '2026-10-01T14:00:00.000Z', state_receipt_at: null, vanta_receipt_at: null },
      },
      ctx,
    );
    expect(refused.ok).toBe(false);
    if (!refused.ok) expect(refused.code).toBe('live_phi_disabled');

    await runOhioLivePath({ store, gate: { allowed: true, code: 'ok', message: 'test', baa: 'signed' } });
    const stranger = { id: 'other-reviewer', email: 'rev@staff.invalid', role: 'reviewer' as const };
    const hidden = await readIroCase(stranger, OHIO_LIVE_CASE_ID, {
      store,
      now: () => '2026-10-20T15:00:00.000Z',
      gate: { allowed: true, code: 'ok', message: 'test', baa: 'signed' },
    });
    expect(hidden.ok).toBe(false);
    if (!hidden.ok) expect(hidden.code).toBe('case_not_assigned');

    const client = { id: 'client-1', email: 'c@example.invalid', role: 'client' as const };
    const denied = await actOnIroCase(client, OHIO_LIVE_CASE_ID, { type: 'close_case' }, {
      store,
      now: () => '2026-10-20T15:00:00.000Z',
      gate: { allowed: true, code: 'ok', message: 'test', baa: 'signed' },
    });
    expect(denied.ok).toBe(false);
    if (!denied.ok) expect(denied.code).toBe('role_denied');
  });
});

describe('portal roles and MFA', () => {
  it('maps staff roles onto the SOP roles', () => {
    expect(resolvePortalRole({ role: 'concierge' })).toBe('intake');
    expect(resolvePortalRole({ role: 'delivery-lead' })).toBe('case_manager');
    expect(resolvePortalRole({ role: 'reviewer' })).toBe('reviewer');
    expect(resolvePortalRole({ role: 'slt' })).toBe('approver');
    expect(resolvePortalRole({ role: 'admin' })).toBe('admin');
    expect(resolvePortalRole({ role: 'client' })).toBeNull();
    const reviewer = toIroActor({ id: 'r1', email: 'r@staff.invalid', role: 'reviewer' }, ['iro-1']);
    expect(reviewer?.role).toBe('iro_physician');
    expect(reviewer?.lines).toEqual(['IRO']);
    expect(reviewer?.case_restricted).toBe(true);
    const admin = toIroActor({ id: 'a1', email: 'a@staff.invalid', role: 'admin' }, []);
    expect(admin?.role).toBe('iro_team_lead');
    expect(admin?.line_wide).toBe(true);
  });

  it('reads MFA from the Cognito amr claim and stays optional by default', () => {
    const header = `vantaum_session=${encodeURIComponent(JSON.stringify({ id_token: fakeJwt({ amr: ['pwd', 'mfa'] }) }))}`;
    const request = new Request('http://localhost/api/iro/session', { headers: { cookie: header } });
    expect(readMfaStatus(request, {}).satisfied).toBe(true);
    expect(readMfaStatus(request, {}).required).toBe(false);
    expect(readMfaStatus(request, { IRO_PORTAL_MFA_REQUIRED: 'true' }).required).toBe(true);
    const passwordOnly = new Request('http://localhost/api/iro/session', {
      headers: { cookie: `vantaum_session=${encodeURIComponent(JSON.stringify({ id_token: fakeJwt({ amr: ['pwd'] }) }))}` },
    });
    expect(readMfaStatus(passwordOnly, {}).satisfied).toBe(false);
  });
});

describe('existing AWS document plan', () => {
  it('points at the existing private efax bucket and does not add a key or account', () => {
    const plan = documentStoragePlan();
    expect(plan).toMatchObject({
      bucket: 'efax-documents',
      encryption: 'SSE-KMS',
      encryption_source: 'bucket-default',
      public_access: 'blocked',
      transport: 'tls',
    });
    const sql = readFileSync('infra-aws/rds-migrations/033_iro_portal.sql', 'utf8');
    expect(sql).toContain('iro_cases');
    expect(sql).toContain('iro_case_audit');
    expect(sql).toContain('efax-documents');
    expect(sql).not.toMatch(/create bucket|aws_s3_bucket|aws_kms_key/i);
    const storage = readFileSync('infra-aws/lib/storage-stack.ts', 'utf8');
    expect(storage).toContain('BucketEncryption.KMS');
    expect(storage).toContain('efax-documents');
  });
});

function fakeJwt(payload: Record<string, unknown>): string {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `eyJhbGciOiJub25lIn0.${body}.sig`;
}
