import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextResponse } from 'next/server';

vi.mock('@/lib/audit', () => ({
  logAuditEvent: vi.fn().mockResolvedValue(undefined),
  logSecurityEvent: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/auth-guard', () => ({
  requireAuth: vi.fn(),
}));

import { requireAuth } from '@/lib/auth-guard';
import { SYNTH_ADA_ID, SYNTH_CASE_REF, SYNTH_NIA_ID, SYNTH_SENTINELS } from '@/lib/iro/fixtures';
import { resetIroMemory } from '@/lib/iro/repository';
import { GET as hrGet } from '@/app/api/iro/credentialing/route';
import { GET as physicianGet } from '@/app/api/iro/credentialing/physicians/[id]/route';
import { GET as licensesGet } from '@/app/api/iro/credentialing/physicians/[id]/licenses/route';
import { GET as sanctionsGet } from '@/app/api/iro/credentialing/physicians/[id]/sanctions/route';
import { GET as agreementsGet } from '@/app/api/iro/credentialing/physicians/[id]/agreements/route';
import { GET as experienceGet } from '@/app/api/iro/credentialing/physicians/[id]/experience/route';
import { GET as evidenceGet } from '@/app/api/iro/credentialing/physicians/[id]/evidence/route';
import { GET as signGet } from '@/app/api/iro/credentialing/physicians/[id]/evidence/sign/route';
import { GET as contractsGet } from '@/app/api/iro/credentialing/physicians/[id]/contracts/route';
import { POST as transitionPost } from '@/app/api/iro/credentialing/physicians/[id]/transition/route';
import { GET as eventsGet } from '@/app/api/iro/credentialing/events/route';
import { GET as approvalsGet } from '@/app/api/iro/approvals/route';
import { POST as decidePost } from '@/app/api/iro/approvals/[id]/decide/route';
import { GET as panelGet } from '@/app/api/iro/panel/route';
import { POST as assignPost } from '@/app/api/iro/cases/[caseRef]/assign/route';
import { POST as attestPost } from '@/app/api/iro/cases/[caseRef]/attestations/route';
import { POST as completePost } from '@/app/api/iro/cases/[caseRef]/complete/route';
import { GET as remindersGet } from '@/app/api/cron/iro-reminders/route';

function asRole(role: string) {
  vi.mocked(requireAuth).mockResolvedValue({
    user: { id: 'user-1', email: `${role}@synthetic.invalid`, role },
  } as never);
}

function jsonRequest(url: string, body: unknown) {
  return new Request(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('IRO routes deny restricted records', () => {
  beforeEach(() => {
    vi.stubEnv('ENABLE_IRO_PANEL', 'true');
    vi.stubEnv('IRO_LINE_CONTRACT', 'true');
    vi.stubEnv('IRO_STORE', 'memory');
    resetIroMemory();
    asRole('reviewer');
  });

  const idParams = { params: Promise.resolve({ id: SYNTH_ADA_ID }) };
  const restrictedGets: Array<[string, (request: Request, ctx: { params: Promise<{ id: string }> }) => Promise<Response>]> = [
    ['physician', physicianGet],
    ['licenses', licensesGet],
    ['sanctions', sanctionsGet],
    ['agreements', agreementsGet],
    ['experience', experienceGet],
    ['evidence', evidenceGet],
    ['contracts', contractsGet],
  ];

  it.each(restrictedGets)('denies a reviewer on %s', async (_name, handler) => {
    const res = await handler(new Request('http://localhost/api/iro/credentialing'), idParams);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(JSON.stringify(body)).not.toContain(SYNTH_SENTINELS.license_number);
    expect(JSON.stringify(body)).not.toContain(SYNTH_SENTINELS.contract_ref);
    expect(JSON.stringify(body)).not.toContain(SYNTH_SENTINELS.finding_summary);
  });

  it('denies the HR workspace, events, and evidence signing for a reviewer', async () => {
    expect((await hrGet(new Request('http://localhost/api/iro/credentialing'))).status).toBe(403);
    expect((await eventsGet(new Request('http://localhost/api/iro/credentialing/events'))).status).toBe(403);
    const signed = await signGet(
      new Request(`http://localhost/api/iro/sign?path=${encodeURIComponent(SYNTH_SENTINELS.cv_storage_key)}`),
      idParams,
    );
    expect(signed.status).toBe(403);
    expect((await approvalsGet(new Request('http://localhost/api/iro/approvals'))).status).toBe(403);
  });

  it('returns only the assignment card to front-line and to admin', async () => {
    for (const role of ['reviewer', 'concierge', 'delivery-lead', 'practice-lead', 'admin', 'credentialing_admin']) {
      asRole(role);
      const res = await panelGet(new Request(`http://localhost/api/iro/panel?case_ref=${SYNTH_CASE_REF}`));
      expect(res.status).toBe(200);
      const body = await res.json();
      const serialized = JSON.stringify(body);
      for (const sentinel of Object.values(SYNTH_SENTINELS)) {
        expect(serialized, role).not.toContain(sentinel);
      }
      expect(body.physicians[0].display_name).toBe('Ada Okonkwo, MD');
      expect(body.physicians[0].case_checks_complete).toBe(false);
      expect(body.view).toBe('assignment');
    }
  });

  it('blocks assignment and completion until the reviewer attests', async () => {
    const assign = await assignPost(
      jsonRequest('http://localhost/api/iro/assign', { physician_id: SYNTH_ADA_ID }),
      { params: Promise.resolve({ caseRef: SYNTH_CASE_REF }) },
    );
    expect(assign.status).toBe(409);
    expect((await assign.json()).error).toBe('attestation_required');

    const complete = await completePost(
      new Request('http://localhost/api/iro/complete', { method: 'POST' }),
      { params: Promise.resolve({ caseRef: SYNTH_CASE_REF }) },
    );
    expect(complete.status).toBe(409);

    asRole('concierge');
    const conciergeAttest = await attestPost(
      jsonRequest('http://localhost/api/iro/attest', {
        physician_id: SYNTH_ADA_ID,
        conflict_attested: true,
        conflict_free: true,
        qualification_attested: true,
        specialty_match: true,
        jurisdiction_match: true,
      }),
      { params: Promise.resolve({ caseRef: SYNTH_CASE_REF }) },
    );
    expect(conciergeAttest.status).toBe(403);

    asRole('reviewer');
    const attest = await attestPost(
      jsonRequest('http://localhost/api/iro/attest', {
        physician_id: SYNTH_ADA_ID,
        conflict_attested: true,
        conflict_free: true,
        conflict_note: 'SYN-CONFLICT-NOTE',
        qualification_attested: true,
        specialty_match: true,
        jurisdiction_match: true,
      }),
      { params: Promise.resolve({ caseRef: SYNTH_CASE_REF }) },
    );
    expect(attest.status).toBe(200);

    const assigned = await assignPost(
      jsonRequest('http://localhost/api/iro/assign', { physician_id: SYNTH_ADA_ID }),
      { params: Promise.resolve({ caseRef: SYNTH_CASE_REF }) },
    );
    expect(assigned.status).toBe(200);

    const panel = await panelGet(new Request(`http://localhost/api/iro/panel?case_ref=${SYNTH_CASE_REF}`));
    const panelBody = await panel.json();
    expect(JSON.stringify(panelBody)).not.toContain('SYN-CONFLICT-NOTE');
    expect(panelBody.case.case_checks_complete).toBe(true);
  });

  it('refuses panel approval from HR and from admin', async () => {
    asRole('credentialing_admin');
    const hr = await transitionPost(
      jsonRequest('http://localhost/api/iro/transition', { to: 'approved' }),
      { params: Promise.resolve({ id: SYNTH_NIA_ID }) },
    );
    expect(hr.status).toBe(403);

    asRole('admin');
    const admin = await decidePost(
      jsonRequest('http://localhost/api/iro/decide', { decision: 'approved', note: 'no' }),
      { params: Promise.resolve({ id: SYNTH_NIA_ID }) },
    );
    expect(admin.status).toBe(403);

    asRole('clinical_approver');
    const queue = await approvalsGet(new Request('http://localhost/api/iro/approvals'));
    expect(queue.status).toBe(200);
    const packet = JSON.stringify(await queue.json());
    expect(packet).not.toContain(SYNTH_SENTINELS.nia_contract);
    expect(packet).toContain('TX-SYN-77003');

    const contracts = await contractsGet(
      new Request('http://localhost/api/iro/contracts'),
      { params: Promise.resolve({ id: SYNTH_NIA_ID }) },
    );
    expect(contracts.status).toBe(403);
  });

  it('hides the module when the flag or the IRO contract is off', async () => {
    vi.stubEnv('ENABLE_IRO_PANEL', 'false');
    expect((await panelGet(new Request('http://localhost/api/iro/panel'))).status).toBe(404);

    vi.stubEnv('ENABLE_IRO_PANEL', 'true');
    vi.stubEnv('IRO_LINE_CONTRACT', 'false');
    const denied = await hrGet(new Request('http://localhost/api/iro/credentialing'));
    expect(denied.status).toBe(403);
    expect((await denied.json()).error).toBe('missing_iro_line_contract');
  });

  it('writes reminder rows from the cron stub', async () => {
    const res = await remindersGet(new Request('http://localhost/api/cron/iro-reminders?as_of=2026-10-09T12:00:00.000Z'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.stub).toBe(true);
    expect(body.open).toBeGreaterThan(0);
  });

  it('returns 401 when the session is missing', async () => {
    vi.mocked(requireAuth).mockResolvedValue(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) as never);
    expect((await panelGet(new Request('http://localhost/api/iro/panel'))).status).toBe(401);
  });
});
