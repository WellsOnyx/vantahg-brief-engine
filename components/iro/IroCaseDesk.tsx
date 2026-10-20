'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';

interface PortalCase {
  id: string;
  step: string;
  stage: number;
  stage_label: string;
  status: string;
  state_code: string;
  deadline_due_at: string | null;
  reviewer_id: string | null;
  review_outcome: string | null;
  md_signed: boolean;
  closed: boolean;
  delivery_state: string;
  stop: { code: string; message: string } | null;
  synthetic: boolean;
  conflict_cleared: boolean | null;
  record_count: number;
}

interface SessionBody {
  user: { id: string; portal_role: string };
  mfa: { ready: boolean; satisfied: boolean; required: boolean };
  live_phi: { allowed: boolean; code: string };
}

async function postAction(caseId: string, body: Record<string, unknown>) {
  const res = await fetch(`/api/iro/cases/${caseId}/actions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = (await res.json()) as { ok: boolean; error?: string; message?: string; case?: PortalCase };
  return { res, json };
}

export function IroQueue() {
  const [session, setSession] = useState<SessionBody | null>(null);
  const [cases, setCases] = useState<PortalCase[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [stateCode, setStateCode] = useState('OH');
  const [carrierAt, setCarrierAt] = useState('');

  const load = useCallback(async () => {
    const sessionRes = await fetch('/api/iro/session');
    if (sessionRes.status === 401) {
      window.location.href = '/portal';
      return;
    }
    if (!sessionRes.ok) {
      setError('This account cannot open the IRO desk.');
      return;
    }
    setSession((await sessionRes.json()) as SessionBody);
    const list = await fetch('/api/iro/cases');
    const body = (await list.json()) as { ok?: boolean; cases?: PortalCase[]; error?: string };
    if (!list.ok) setError(body.error ?? 'Could not load cases.');
    else setCases(body.cases ?? []);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- WHY: fetch-on-mount hydrates IRO desk data after client mount (session unavailable during SSR)
    void load();
  }, [load]);

  async function openCase(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    const res = await fetch('/api/iro/cases', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        state_code: stateCode,
        receipts: {
          carrier_receipt_at: new Date(carrierAt).toISOString(),
          state_receipt_at: null,
          vanta_receipt_at: new Date().toISOString(),
        },
      }),
    });
    const body = (await res.json()) as { ok?: boolean; error?: string; message?: string; case?: PortalCase };
    if (!res.ok || !body.case) {
      setError(body.message ?? body.error ?? 'Intake was refused.');
      return;
    }
    window.location.href = `/portal/iro/${body.case.id}`;
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <p className="text-[11px] uppercase tracking-[0.16em] text-gold font-semibold">Vanta HG · IRO</p>
      <h1 className="font-[family-name:var(--font-display)] text-4xl text-navy mt-2">Case desk</h1>
      {session ? (
        <p className="text-sm text-muted mt-2">
          {session.user.portal_role.replace('_', ' ')}
          {session.mfa.satisfied ? ' · MFA on this session' : ' · MFA ready on the Cognito pool'}
          {session.live_phi.allowed ? ' · live intake on' : ' · live intake off'}
        </p>
      ) : null}
      {error ? <p className="mt-4 text-sm text-navy border-l-2 border-gold pl-3">{error}</p> : null}
      <form onSubmit={openCase} className="mt-8 grid sm:grid-cols-[8rem_1fr_auto] gap-3 items-end">
        <label className="text-xs uppercase tracking-wider text-muted">
          State
          <input value={stateCode} onChange={(e) => setStateCode(e.target.value.toUpperCase())} className="mt-1 block w-full border-b border-border bg-transparent py-2" />
        </label>
        <label className="text-xs uppercase tracking-wider text-muted">
          Carrier receipt
          <input type="datetime-local" required value={carrierAt} onChange={(e) => setCarrierAt(e.target.value)} className="mt-1 block w-full border-b border-border bg-transparent py-2" />
        </label>
        <button type="submit" className="bg-navy text-white text-xs uppercase tracking-wider px-4 py-3 rounded-md">
          Open case
        </button>
      </form>
      <ul className="mt-10 divide-y divide-border">
        {cases.map((row) => (
          <li key={row.id} className="py-4 flex items-center justify-between gap-4">
            <div>
              <Link href={`/portal/iro/${row.id}`} className="text-navy font-semibold underline-offset-2 hover:underline">
                {row.id}
              </Link>
              <p className="text-sm text-muted">
                {row.state_code} · stage {row.stage} {row.stage_label} · {row.status}
                {row.closed ? ' · closed' : ''}
              </p>
            </div>
            <span className="text-xs text-muted">{row.deadline_due_at ? row.deadline_due_at.slice(0, 10) : 'No deadline'}</span>
          </li>
        ))}
        {cases.length === 0 ? <li className="py-8 text-sm text-muted">No IRO cases on this desk.</li> : null}
      </ul>
    </div>
  );
}

export function IroCaseFile({ caseId }: { caseId: string }) {
  const [row, setRow] = useState<PortalCase | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reviewerId, setReviewerId] = useState('');
  const [question, setQuestion] = useState('');
  const [outcome, setOutcome] = useState('overturned');

  const load = useCallback(async () => {
    const res = await fetch(`/api/iro/cases/${caseId}`);
    if (res.status === 401) {
      window.location.href = '/portal';
      return;
    }
    const body = (await res.json()) as { ok?: boolean; case?: PortalCase; error?: string; message?: string };
    if (!res.ok || !body.case) setError(body.message ?? body.error ?? 'Case is not available.');
    else setRow(body.case);
  }, [caseId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- WHY: fetch-on-mount hydrates IRO desk data after client mount (session unavailable during SSR)
    void load();
  }, [load]);

  async function run(body: Record<string, unknown>) {
    setError(null);
    const { res, json } = await postAction(caseId, body);
    if (!res.ok || !json.case) {
      setError(json.message ?? json.error ?? 'Action was refused.');
      return;
    }
    setRow(json.case);
  }

  async function upload(file: File) {
    const form = new FormData();
    form.set('file', file);
    const res = await fetch(`/api/iro/cases/${caseId}/documents`, { method: 'POST', body: form });
    const json = (await res.json()) as { ok?: boolean; error?: string; message?: string; document_id?: string };
    if (!res.ok || !json.document_id) {
      setError(json.message ?? json.error ?? 'Upload was refused.');
      return;
    }
    await run({
      type: 'log_records',
      missing: false,
      documents: [{ ref: json.document_id, pages: 1, readable: true }],
    });
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <Link href="/portal/iro" className="text-xs uppercase tracking-wider text-navy">
        Case desk
      </Link>
      <h1 className="font-[family-name:var(--font-display)] text-4xl text-navy mt-3">{caseId}</h1>
      {row ? (
        <p className="text-sm text-muted mt-2">
          Stage {row.stage} · {row.stage_label} · step {row.step} · {row.status}
          {row.deadline_due_at ? ` · due ${row.deadline_due_at.slice(0, 10)}` : ''}
          {row.md_signed ? ' · signed' : ''}
          {row.closed ? ' · closed' : ''}
        </p>
      ) : null}
      {row?.stop ? <p className="mt-4 text-sm border-l-2 border-gold pl-3">{row.stop.message}</p> : null}
      {error ? <p className="mt-4 text-sm border-l-2 border-gold pl-3">{error}</p> : null}
      {row ? (
        <div className="mt-8 space-y-4">
          {row.step === 'intake' ? (
            <button type="button" className="bg-navy text-white text-xs uppercase tracking-wider px-4 py-3 rounded-md" onClick={() => run({
              type: 'log_intake',
              timezone: 'America/New_York',
              arrival_channel: 'portal_upload',
              referring_entity_ref: 'REF-PLAN',
              original_request_ref: `REF-${row.id}`,
            })}>
              Log intake
            </button>
          ) : null}
          {row.step === 'classification' ? (
            <form className="space-y-3" onSubmit={(event) => { event.preventDefault(); void run({ type: 'classify', category: 'medical_necessity', expedited: false, review_question: question }); }}>
              <input value={question} onChange={(e) => setQuestion(e.target.value)} required placeholder="Review question ref" className="block w-full border-b border-border bg-transparent py-2" />
              <button type="submit" className="bg-navy text-white text-xs uppercase tracking-wider px-4 py-3 rounded-md">Classify</button>
            </form>
          ) : null}
          {row.step === 'pathway_deadline' ? (
            <button type="button" className="bg-navy text-white text-xs uppercase tracking-wider px-4 py-3 rounded-md" onClick={() => run({ type: 'set_pathway_deadline' })}>
              Pin pathway and deadline
            </button>
          ) : null}
          {row.step === 'conflict_check' ? (
            <div className="flex gap-3">
              <button type="button" className="bg-navy text-white text-xs uppercase tracking-wider px-4 py-3 rounded-md" onClick={() => run({ type: 'record_conflict_check', possible: false, parties: [] })}>
                Record no conflict
              </button>
              <button type="button" className="border border-navy text-navy text-xs uppercase tracking-wider px-4 py-3 rounded-md" onClick={() => run({ type: 'clear_conflict' })}>
                Clear conflict
              </button>
            </div>
          ) : null}
          {row.step === 'acceptance' ? (
            <button type="button" className="bg-navy text-white text-xs uppercase tracking-wider px-4 py-3 rounded-md" onClick={() => run({ type: 'accept_case', benefit_exclusion: false })}>
              Accept case
            </button>
          ) : null}
          {row.step === 'records' ? (
            <label className="text-sm text-muted">
              PDF record
              <input type="file" accept="application/pdf" className="mt-2 block" onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void upload(file);
              }} />
            </label>
          ) : null}
          {row.step === 'referral' ? (
            <button type="button" className="bg-navy text-white text-xs uppercase tracking-wider px-4 py-3 rounded-md" onClick={() => run({ type: 'generate_referral' })}>
              Generate referral
            </button>
          ) : null}
          {row.step === 'reviewer_assignment' ? (
            <form className="space-y-3" onSubmit={(event) => { event.preventDefault(); void run({ type: 'assign_reviewer', reviewer_id: reviewerId }); }}>
              <input value={reviewerId} onChange={(e) => setReviewerId(e.target.value)} required placeholder="Reviewer id" className="block w-full border-b border-border bg-transparent py-2" />
              <button type="submit" className="bg-navy text-white text-xs uppercase tracking-wider px-4 py-3 rounded-md">Assign from shared credentialing</button>
            </form>
          ) : null}
          {row.step === 'attestation_gate' ? (
            <div className="flex gap-3">
              <button type="button" className="bg-navy text-white text-xs uppercase tracking-wider px-4 py-3 rounded-md" onClick={() => run({
                type: 'submit_attestation',
                signed: true,
                answers: { financial_conflict: 'no', familial_conflict: 'no', treating_relationship: 'no', credential_concern: 'no' },
              })}>
                Sign Part A
              </button>
              <button type="button" className="border border-navy text-navy text-xs uppercase tracking-wider px-4 py-3 rounded-md" onClick={() => run({ type: 'release_records' })}>
                Release records
              </button>
            </div>
          ) : null}
          {row.step === 'review' ? (
            <form className="space-y-3" onSubmit={(event) => { event.preventDefault(); void run({ type: 'complete_review', outcome }); }}>
              <select value={outcome} onChange={(e) => setOutcome(e.target.value)} className="block w-full border-b border-border bg-transparent py-2">
                <option value="upheld">Upheld</option>
                <option value="overturned">Overturned</option>
                <option value="partially_overturned">Partially overturned</option>
              </select>
              <button type="submit" className="bg-navy text-white text-xs uppercase tracking-wider px-4 py-3 rounded-md">Complete review</button>
            </form>
          ) : null}
          {row.step === 'md_signoff' ? (
            <div className="flex gap-3">
              <button type="button" className="border border-navy text-navy text-xs uppercase tracking-wider px-4 py-3 rounded-md" onClick={() => run({ type: 'team_lead_process_check' })}>
                Team lead check
              </button>
              <button type="button" className="bg-navy text-white text-xs uppercase tracking-wider px-4 py-3 rounded-md" onClick={() => run({ type: 'md_signoff' })}>
                Medical director sign-off
              </button>
            </div>
          ) : null}
          {row.step === 'notice' ? (
            <button type="button" className="bg-navy text-white text-xs uppercase tracking-wider px-4 py-3 rounded-md" onClick={() => run({ type: 'issue_notice' })}>
              Issue notice
            </button>
          ) : null}
          {row.step === 'delivery' ? (
            <button type="button" className="bg-navy text-white text-xs uppercase tracking-wider px-4 py-3 rounded-md" onClick={() => run({ type: 'record_delivery', channel: 'certified', to_ref: 'RECIPIENT-REF' })}>
              Record delivery (no live mail)
            </button>
          ) : null}
          {row.step === 'closure' ? (
            <button type="button" className="bg-navy text-white text-xs uppercase tracking-wider px-4 py-3 rounded-md" onClick={() => run({ type: 'close_case' })}>
              Close case
            </button>
          ) : null}
          {row.step === 'billing' ? <p className="text-sm text-muted">Closed. Billing is not posted from this desk.</p> : null}
        </div>
      ) : null}
    </div>
  );
}
