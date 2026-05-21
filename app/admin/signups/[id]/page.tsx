'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { PageFocused, PageHero } from '@/components/layouts/PageLayouts';

/**
 * Admin signup detail view — part of the core review screen (Item 5).
 * Shows all data submitted via /signup-tpa, review trail, approve/reject controls,
 * and contract status. This is the primary place Jonathan reviews new TPA requests.
 *
 * Access is enforced server-side on `/api/admin/signups/:id` (requireRole).
 * The page treats the API response as the source of truth — no client-side
 * auth check duplicating the server contract (that was the old Supabase
 * browser-auth path and it breaks under Cognito).
 */

type Status = 'pending_review' | 'approved' | 'rejected' | 'signed' | 'live';

interface SignupRow {
  id: string;
  created_at: string;
  updated_at: string;
  status: Status;
  legal_name: string;
  dba: string | null;
  entity_state: string | null;
  street_address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  primary_contact_name: string;
  primary_contact_title: string | null;
  primary_contact_email: string;
  primary_contact_phone: string | null;
  signer_name: string | null;
  signer_title: string | null;
  signer_email: string | null;
  estimated_members: number | null;
  pepm_rate_cents: number | null;
  expected_weekly_auths: number | null;
  existing_tpa_system: string | null;
  notes: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  rejection_reason: string | null;
  contract_storage_path: string | null;
  contract_uploaded_at: string | null;
  contract_uploaded_by: string | null;
  client_id: string | null;
  approved_at: string | null;
  approved_by: string | null;
  latest_contract: LatestContract | null;
}

interface LatestContract {
  id: string;
  status: 'draft' | 'generated' | 'sent' | 'partially_signed' | 'signed' | 'void';
  hellosign_signature_request_id: string | null;
  sent_at: string | null;
  signed_at: string | null;
  generated_at: string | null;
}

const STATUS_LABEL: Record<Status, string> = {
  pending_review: 'Pending Review',
  approved: 'Approved',
  rejected: 'Rejected',
  signed: 'Signed',
  live: 'Live',
};

const STATUS_PILL: Record<Status, string> = {
  pending_review: 'bg-amber-100 text-amber-800 border-amber-200',
  approved: 'bg-blue-100 text-blue-800 border-blue-200',
  rejected: 'bg-red-100 text-red-800 border-red-200',
  signed: 'bg-teal-100 text-teal-800 border-teal-200',
  live: 'bg-emerald-100 text-emerald-800 border-emerald-200',
};

export default function AdminSignupDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const [row, setRow] = useState<SignupRow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [accessStatus, setAccessStatus] = useState<'unknown' | 'ok' | 'forbidden' | 'unauth'>('unknown');

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(`/api/admin/signups/${id}`, { cache: 'no-store' });
        if (cancelled) return;
        if (res.status === 401) {
          setAccessStatus('unauth');
          return;
        }
        if (res.status === 403) {
          setAccessStatus('forbidden');
          return;
        }
        if (res.status === 404) {
          setAccessStatus('ok');
          setError('Signup not found.');
          return;
        }
        if (!res.ok) {
          setAccessStatus('ok');
          setError(`Failed to load (${res.status})`);
          return;
        }
        const data = (await res.json()) as SignupRow;
        if (!cancelled) {
          setRow(data);
          setAccessStatus('ok');
        }
      } catch {
        if (!cancelled) {
          setAccessStatus('ok');
          setError('Failed to load signup');
        }
      }
    }
    load();
    return () => { cancelled = true; };
  }, [id]);

  if (accessStatus === 'unknown') {
    return <Frame><div className="text-muted">Loading…</div></Frame>;
  }

  if (accessStatus === 'unauth') {
    return (
      <Frame>
        <div className="bg-surface rounded-2xl border border-border shadow-sm p-10 text-center">
          <h1 className="font-[family-name:var(--font-dm-serif)] text-2xl text-navy mb-2">
            Sign in required
          </h1>
          <Link href={`/login?redirect=/admin/signups/${id}`} className="btn btn-primary mt-4 inline-flex">
            Go to login
          </Link>
        </div>
      </Frame>
    );
  }

  if (accessStatus === 'forbidden') {
    return (
      <Frame>
        <div className="bg-surface rounded-2xl border border-border shadow-sm p-10 text-center">
          <h1 className="font-[family-name:var(--font-dm-serif)] text-2xl text-navy mb-2">
            Signup Detail
          </h1>
          <p className="text-muted">Requires admin / executive / builder role.</p>
        </div>
      </Frame>
    );
  }

  if (error) {
    return (
      <Frame>
        <div className="bg-surface rounded-xl border border-red-200 shadow-sm p-6 text-red-800">
          {error}
          <div className="mt-4">
            <Link href="/admin/signups" className="text-sm text-navy hover:text-gold-dark underline">
              ← Back to signups
            </Link>
          </div>
        </div>
      </Frame>
    );
  }

  if (!row) {
    return <Frame><div className="text-muted">Loading signup…</div></Frame>;
  }

  return (
    <PageFocused
      hero={
        <PageHero
          eyebrow="TPA Onboarding"
          title={row.legal_name}
          subtitle={row.dba ? `dba ${row.dba}` : undefined}
          actions={
            row.status === 'pending_review' ? (
              <div className="flex gap-2">
                <button
                  onClick={() => setMode('confirming_approve')}
                  disabled={submitting}
                  className="bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50"
                >
                  Approve
                </button>
                <button
                  onClick={() => setMode('confirming_reject')}
                  disabled={submitting}
                  className="border border-red-300 text-red-700 px-4 py-2 rounded-lg text-sm font-semibold hover:bg-red-50"
                >
                  Reject
                </button>
              </div>
            ) : null
          }
        />
      }
    >
      <div className="text-sm text-muted">
        PageFocused + PageHero wrapper in place. Content migration starting now in small commits.
      </div>
    </PageFocused>
  );


        <Section title="Contract signer">
          {row.signer_name || row.signer_email ? (
            <>
              <Field label="Name" value={row.signer_name} />
              <Field label="Title" value={row.signer_title} />
              <Field label="Email" value={row.signer_email} mono />
            </>
          ) : (
            <p className="text-sm text-muted italic">Not provided — primary contact is the default signer.</p>
          )}
        </Section>

        <Section title="Operation">
          <Field label="Current TPA system" value={row.existing_tpa_system} />
          <Field label="Estimated members" value={row.estimated_members !== null ? row.estimated_members.toLocaleString() : null} />
          <Field label="Expected auths / week" value={row.expected_weekly_auths !== null ? row.expected_weekly_auths.toString() : null} />
          <Field
            label="Proposed PEPM"
            value={row.pepm_rate_cents !== null ? `$${(row.pepm_rate_cents / 100).toFixed(2)}` : null}
            hint="Set by admin during review."
          />
        </Section>

        {row.notes && (
          <Section title="Notes from prospect">
            <p className="text-sm text-navy whitespace-pre-wrap">{row.notes}</p>
          </Section>
        )}

        <Section title="Review trail">
          <Field label="Reviewed by" value={row.reviewed_by} mono />
          <Field label="Reviewed at" value={row.reviewed_at ? new Date(row.reviewed_at).toLocaleString() : null} />
          {row.rejection_reason && <Field label="Rejection reason" value={row.rejection_reason} />}
          <Field label="Approved by" value={row.approved_by} mono />
          <Field label="Approved at" value={row.approved_at ? new Date(row.approved_at).toLocaleString() : null} />
          <Field label="Linked client_id" value={row.client_id} mono hint="Set on approve. Links to the tenant created via bootstrap-real-client logic." />
        </Section>

        <section className="bg-surface rounded-xl border border-border shadow-sm p-6">
          <h2 className="font-semibold text-sm text-navy uppercase tracking-wide mb-4">
            Signed contract
          </h2>
          <ContractPanel row={row} onUpdate={(updated) => setRow(updated)} />
        </section>
      </div>
    </Frame>
  );
}

// ── Action Panel ───────────────────────────────────────────────────────────

type ActionMode = 'idle' | 'confirming_approve' | 'confirming_reject';

function ActionPanel({ row, onUpdate }: { row: SignupRow; onUpdate: (next: SignupRow) => void }) {
  const [mode, setMode] = useState<ActionMode>('idle');
  const [pepmDollars, setPepmDollars] = useState('');
  const [rejectReason, setRejectReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Only show actionable UI when the row is still pending. Other statuses
  // get a calm summary line instead.
  if (row.status !== 'pending_review') {
    return (
      <div className="bg-surface border border-border rounded-lg px-4 py-3 text-xs text-muted max-w-sm">
        Status is <span className="font-semibold text-navy">{STATUS_LABEL[row.status]}</span>.{' '}
        {row.status === 'rejected' && row.rejection_reason && (
          <span>Reason: <span className="text-navy">{row.rejection_reason}</span></span>
        )}
        {row.status === 'approved' && row.client_id && (
          <span>Tenant: <span className="font-mono text-navy">{row.client_id.slice(0, 8)}…</span></span>
        )}
      </div>
    );
  }

  async function submitApprove() {
    setError(null);
    setSubmitting(true);
    const body: { pepm_rate_cents?: number } = {};
    const dollars = parseFloat(pepmDollars);
    if (pepmDollars.trim().length > 0) {
      if (!Number.isFinite(dollars) || dollars < 0) {
        setError('PEPM must be a non-negative number.');
        setSubmitting(false);
        return;
      }
      body.pepm_rate_cents = Math.round(dollars * 100);
    }
    try {
      const res = await fetch(`/api/admin/signups/${row.id}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? `Approve failed (${res.status})`);
        return;
      }
      if (data.signup) {
        onUpdate(data.signup as SignupRow);
      }
      // Surface the auto-assignment outcome - admins want to know if a
      // concierge got assigned, or if they need to do it manually.
      const a = data.assignment as
        | { ok: true; concierge_name: string; concierge_email: string; delivery_lead_name: string | null; assigned_weekly_volume: number }
        | { ok: false; message: string }
        | null;
      if (a && a.ok) {
        const dlPart = a.delivery_lead_name ? ` · DL: ${a.delivery_lead_name}` : '';
        setSuccess(
          `Approved. Auto-assigned to ${a.concierge_name} (${a.concierge_email})${dlPart}. +${a.assigned_weekly_volume} weekly auths to their load.`,
        );
      } else if (a && !a.ok) {
        setSuccess(`Approved. ⚠️ Auto-assignment skipped: ${a.message} You'll need to assign a concierge manually.`);
      } else {
        setSuccess('Approved. Client tenant created.');
      }
      setMode('idle');
    } catch {
      setError('Network error. Try again.');
    } finally {
      setSubmitting(false);
    }
  }

  async function submitReject() {
    setError(null);
    if (rejectReason.trim().length === 0) {
      setError('A reason is required.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/admin/signups/${row.id}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: rejectReason.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? `Reject failed (${res.status})`);
        return;
      }
      if (data.signup) {
        onUpdate(data.signup as SignupRow);
      }
      setSuccess('Rejected.');
      setMode('idle');
    } catch {
      setError('Network error. Try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="w-full md:max-w-sm space-y-2">
      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 text-red-800 text-xs px-3 py-2">
          {error}
        </div>
      )}
      {success && (
        <div className="rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs px-3 py-2">
          {success}
        </div>
      )}

      {mode === 'idle' && (
        <div className="flex gap-2">
          <button
            onClick={() => { setMode('confirming_approve'); setError(null); setSuccess(null); }}
            className="flex-1 bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-emerald-700 transition-colors"
          >
            Approve
          </button>
          <button
            onClick={() => { setMode('confirming_reject'); setError(null); setSuccess(null); }}
            className="flex-1 bg-white border border-red-300 text-red-700 px-4 py-2 rounded-lg text-sm font-semibold hover:bg-red-50 transition-colors"
          >
            Reject
          </button>
        </div>
      )}

      {mode === 'confirming_approve' && (
        <div className="rounded-lg bg-surface border border-border p-4 space-y-3">
          <h3 className="text-sm font-semibold text-navy">Approve & create tenant</h3>
          <p className="text-xs text-muted">
            Creates a new client (TPA) row, links it back to this signup, and audit-logs both steps.
          </p>
          <label className="block">
            <span className="block text-xs font-medium text-navy mb-1">Negotiated PEPM in $/member/month (optional)</span>
            <input
              type="number"
              step="0.01"
              min={0}
              value={pepmDollars}
              onChange={(e) => setPepmDollars(e.target.value)}
              placeholder="e.g. 2.40"
              className="w-full px-3 py-2 border border-border rounded text-sm focus:outline-none focus:ring-2 focus:ring-gold/40"
            />
            <span className="block text-[11px] text-muted mt-1">
              Stored as integer cents. Leave blank to defer the rate decision.
            </span>
          </label>
          {!row.contract_storage_path && (
            <div className="rounded bg-amber-50 border border-amber-200 text-amber-900 text-[11px] px-2.5 py-2">
              No signed contract on file. Approve will succeed but a
              <code className="mx-1 bg-amber-100 px-1 rounded">security:signup_approved_without_baa</code>
              audit event will be written for traceability. Upload the signed contract first (piece 6) for the clean path.
            </div>
          )}
          <div className="flex gap-2">
            <button
              onClick={submitApprove}
              disabled={submitting}
              className="flex-1 bg-emerald-600 text-white px-3 py-1.5 rounded text-xs font-semibold hover:bg-emerald-700 disabled:opacity-50"
            >
              {submitting ? 'Approving…' : 'Confirm Approve'}
            </button>
            <button
              onClick={() => { setMode('idle'); setError(null); }}
              disabled={submitting}
              className="px-3 py-1.5 rounded text-xs font-medium text-muted hover:text-navy"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {mode === 'confirming_reject' && (
        <div className="rounded-lg bg-surface border border-border p-4 space-y-3">
          <h3 className="text-sm font-semibold text-red-800">Reject this application</h3>
          <p className="text-xs text-muted">
            The reason is required and stored on the signup row for the audit trail.
          </p>
          <label className="block">
            <span className="block text-xs font-medium text-navy mb-1">Reason</span>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              rows={3}
              placeholder="e.g. Out of target geography / not enough volume / poor fit"
              className="w-full px-3 py-2 border border-border rounded text-sm focus:outline-none focus:ring-2 focus:ring-red-200 resize-y"
            />
          </label>
          <div className="flex gap-2">
            <button
              onClick={submitReject}
              disabled={submitting}
              className="flex-1 bg-red-600 text-white px-3 py-1.5 rounded text-xs font-semibold hover:bg-red-700 disabled:opacity-50"
            >
              {submitting ? 'Rejecting…' : 'Confirm Reject'}
            </button>
            <button
              onClick={() => { setMode('idle'); setError(null); }}
              disabled={submitting}
              className="px-3 py-1.5 rounded text-xs font-medium text-muted hover:text-navy"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Contract Panel ─────────────────────────────────────────────────────────

function ContractPanel({ row, onUpdate }: { row: SignupRow; onUpdate: (next: SignupRow) => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [viewing, setViewing] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [sending, setSending] = useState(false);
  const [missingVars, setMissingVars] = useState<string[] | null>(null);

  // Item 6: Admin-provided additional clauses for the predefined injection section
  const [additionalProvisions, setAdditionalProvisions] = useState('');

  async function sendForSignature() {
    if (!row.latest_contract) {
      setError('No generated contract to send. Generate the MSA first.');
      return;
    }
    setError(null);
    setSuccess(null);
    setSending(true);
    try {
      const res = await fetch(`/api/admin/contracts/${row.latest_contract.id}/send-for-signature`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? `Send failed (${res.status})`);
        return;
      }
      // Refresh by re-fetching the signup row so latest_contract updates.
      const refetch = await fetch(`/api/admin/signups/${row.id}`);
      const refreshed = await refetch.json().catch(() => null);
      if (refreshed && refreshed.id) onUpdate(refreshed as SignupRow);
      setSuccess(
        data.demo
          ? 'Sent for signature (demo mode — no real email).'
          : 'Sent for signature. The TPA signer will receive the Dropbox Sign email. Jonathan Arias will counter-sign second.',
      );
    } catch {
      setError('Network error. Try again.');
    } finally {
      setSending(false);
    }
  }

  async function generateContract() {
    setError(null);
    setSuccess(null);
    setMissingVars(null);
    setGenerating(true);
    try {
      const injections = additionalProvisions.trim()
        ? { additional_provisions: additionalProvisions.trim() }
        : undefined;

      const res = await fetch(`/api/admin/signups/${row.id}/generate-contract`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          template_slug: 'msa-with-baa',
          ...(injections && { injections }),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (Array.isArray(data.missing) && data.missing.length > 0) {
          setMissingVars(data.missing as string[]);
        }
        setError(data.error ?? `Generate failed (${res.status})`);
        return;
      }
      if (data.signup) onUpdate(data.signup as SignupRow);

      const injectedText = additionalProvisions.trim();
      setSuccess(
        injectedText
          ? 'Contract generated with additional provisions.'
          : 'Contract generated from template.'
      );

      // After a clean generation with no injection, clear the field.
      // If text was provided, leave it visible so the admin can see exactly
      // what went into the Additional Provisions section before sending.
      if (!injectedText) {
        setAdditionalProvisions('');
      }
    } catch {
      setError('Network error. Try again.');
    } finally {
      setGenerating(false);
    }
  }

  async function submitUpload() {
    setError(null);
    setSuccess(null);
    if (!file) {
      setError('Choose a PDF first.');
      return;
    }
    if (file.type !== 'application/pdf') {
      setError('PDF only.');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError(`File too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Max is 10 MB.`);
      return;
    }
    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch(`/api/admin/signups/${row.id}/contract`, {
        method: 'POST',
        body: fd,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? `Upload failed (${res.status})`);
        return;
      }
      if (data.signup) onUpdate(data.signup as SignupRow);
      setSuccess('Contract uploaded.');
      setFile(null);
    } catch {
      setError('Network error. Try again.');
    } finally {
      setSubmitting(false);
    }
  }

  async function viewContract() {
    setError(null);
    setViewing(true);
    try {
      const res = await fetch(`/api/admin/signups/${row.id}/contract`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.url) {
        setError(data.error ?? `Could not open contract (${res.status})`);
        return;
      }
      window.open(data.url as string, '_blank', 'noopener,noreferrer');
    } catch {
      setError('Network error. Try again.');
    } finally {
      setViewing(false);
    }
  }

  return (
    <div className="space-y-4">
      {row.contract_storage_path ? (
        <div className="space-y-3">
          <dl className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3">
            <Field
              label="Storage path"
              value={row.contract_storage_path}
              mono
              hint="Private bucket — only accessible via signed URL."
            />
            <Field label="Uploaded by" value={row.contract_uploaded_by} mono />
            <Field
              label="Uploaded at"
              value={row.contract_uploaded_at ? new Date(row.contract_uploaded_at).toLocaleString() : null}
            />
          </dl>

          {row.latest_contract?.status === 'generated' && (
            <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm text-emerald-800">
              <strong>Ready to send.</strong> The contract (including any Additional Provisions) is generated and stored.
              Click <span className="font-semibold">“Send for signature”</span> below to email it to the TPA signer.
              Jonathan Arias will receive it for counter-signature after they sign.
            </div>
          )}

          {/* Item 6: Additional Provisions (available on regenerate too) */}
          <div>
            <label className="block text-sm font-medium text-navy mb-1.5">
              Additional Provisions <span className="text-muted font-normal">(optional — for regenerate)</span>
            </label>
            <textarea
              value={additionalProvisions}
              onChange={(e) => setAdditionalProvisions(e.target.value)}
              placeholder="Enter any specific additional clauses... (will only appear in the dedicated Additional Provisions section)"
              className="w-full min-h-[100px] rounded-lg border border-border bg-white p-3 text-sm font-mono placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-navy"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              onClick={viewContract}
              disabled={viewing}
              className="bg-navy text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-navy/90 disabled:opacity-50"
            >
              {viewing ? 'Opening…' : 'Open contract'}
            </button>
            <button
              onClick={generateContract}
              disabled={generating}
              className="bg-white border border-navy/30 text-navy px-4 py-2 rounded-lg text-sm font-medium hover:border-navy disabled:opacity-50"
              title="Regenerate the MSA from the template — replaces what's currently on file."
            >
              {generating ? 'Regenerating…' : 'Regenerate MSA'}
            </button>
            <label className="bg-white border border-border text-navy px-4 py-2 rounded-lg text-sm font-medium hover:border-navy/40 cursor-pointer">
              Replace…
              <input
                type="file"
                accept="application/pdf"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                className="hidden"
              />
            </label>
            {file && (
              <button
                onClick={submitUpload}
                disabled={submitting}
                className="bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50"
              >
                {submitting ? 'Uploading…' : `Upload ${file.name}`}
              </button>
            )}
          </div>

          <SignatureStatusRow contract={row.latest_contract} onSend={sendForSignature} sending={sending} signupId={row.id} />
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-muted">
            No contract on file. Generate the standard VantaUM MSA-with-BAA from the
            template (uses the captured signup data + any additional provisions below), or upload a custom signed PDF.
          </p>

          {/* Item 6: Additional Provisions injection textarea */}
          <div>
            <label className="block text-sm font-medium text-navy mb-1.5">
              Additional Provisions <span className="text-muted font-normal">(optional)</span>
            </label>
            <textarea
              value={additionalProvisions}
              onChange={(e) => setAdditionalProvisions(e.target.value)}
              placeholder="Enter any specific additional clauses or paragraphs Jonathan wants to include. This text will appear ONLY in the dedicated 'Additional Provisions' section of the locked template. The rest of the approved Florida-governed MSA + BAA framework remains unchanged."
              className="w-full min-h-[120px] rounded-lg border border-border bg-white p-3 text-sm font-mono placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-navy"
            />
            <p className="mt-1 text-[11px] text-muted">
              This is the only place admin-injected language is accepted (per the approved framework).
            </p>
          </div>

          <div className="flex flex-wrap gap-2 items-center">
            <button
              onClick={generateContract}
              disabled={generating}
              className="bg-navy text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-navy/90 disabled:opacity-50"
            >
              {generating ? 'Generating…' : 'Generate MSA'}
            </button>
            <span className="text-xs text-muted">or</span>
            <label className="bg-white border border-border text-navy px-4 py-2 rounded-lg text-sm font-medium hover:border-navy/40 cursor-pointer">
              Choose PDF…
              <input
                type="file"
                accept="application/pdf"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                className="hidden"
              />
            </label>
            {file && (
              <>
                <span className="text-xs text-muted">
                  {file.name} · {(file.size / 1024 / 1024).toFixed(2)} MB
                </span>
                <button
                  onClick={submitUpload}
                  disabled={submitting}
                  className="bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50"
                >
                  {submitting ? 'Uploading…' : 'Upload'}
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {missingVars && missingVars.length > 0 && (
        <div className="rounded-lg bg-amber-50 border border-amber-200 text-amber-900 text-xs px-3 py-2">
          <div className="font-semibold mb-1">Missing required variables — fill these on the signup row first:</div>
          <ul className="list-disc list-inside font-mono">
            {missingVars.map((k) => (<li key={k}>{k}</li>))}
          </ul>
        </div>
      )}
      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 text-red-800 text-xs px-3 py-2">
          {error}
        </div>
      )}
      {success && (
        <div className="rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs px-3 py-2">
          {success}
        </div>
      )}
    </div>
  );
}

// Renders e-signature status + a "Send for signature" button when the
// contract is in 'generated' state. Once sent, shows the envelope id and
// progress. The actual sending is wired by the parent ContractPanel.
function SignatureStatusRow({
  contract,
  onSend,
  sending,
  signupId,
}: {
  contract: LatestContract | null;
  onSend: () => void;
  sending: boolean;
  signupId: string;
}) {
  const [busy, setBusy] = useState<'resend' | 'void' | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  if (!contract) return null;

  const sigStatus = contract.status;
  const sigId = contract.hellosign_signature_request_id;

  const sigPill: Record<LatestContract['status'], { label: string; className: string }> = {
    draft: { label: 'Draft', className: 'bg-gray-100 text-gray-700 border-gray-200' },
    generated: { label: 'Generated · not yet sent', className: 'bg-amber-50 text-amber-800 border-amber-200' },
    sent: { label: 'Sent for signature · awaiting TPA', className: 'bg-blue-50 text-blue-800 border-blue-200' },
    partially_signed: { label: 'TPA signed · awaiting VantaUM counter-signature', className: 'bg-indigo-50 text-indigo-800 border-indigo-200' },
    signed: { label: 'Fully executed', className: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
    void: { label: 'Void', className: 'bg-red-50 text-red-800 border-red-200' },
  };
  const pill = sigPill[sigStatus];

  const canResend = sigStatus === 'sent' || sigStatus === 'partially_signed';
  const canVoid = sigStatus === 'sent' || sigStatus === 'partially_signed' || sigStatus === 'generated';

  async function resend() {
    setBusy('resend'); setActionError(null); setActionSuccess(null);
    try {
      const res = await fetch(`/api/admin/contracts/${contract!.id}/resend`, { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setActionError(data.error ?? `Failed (${res.status})`);
      } else {
        setActionSuccess(data.demo ? 'Reminder sent (demo).' : 'Reminder sent to the next pending signer.');
      }
    } catch {
      setActionError('Network error.');
    } finally {
      setBusy(null);
    }
  }

  async function voidContract() {
    if (!confirm('Void this contract? The signer will not be able to sign it. This cannot be undone.')) return;
    const reason = prompt('Reason (optional, max 200 chars):') ?? undefined;
    setBusy('void'); setActionError(null); setActionSuccess(null);
    try {
      const res = await fetch(`/api/admin/contracts/${contract!.id}/void`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(reason ? { reason } : {}),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setActionError(data.error ?? `Failed (${res.status})`);
      } else {
        setActionSuccess('Contract voided. Generate a new MSA to start over.');
        // Refresh the parent page state.
        const refetch = await fetch(`/api/admin/signups/${signupId}`);
        if (refetch.ok) {
          // Force a top-level state refresh by reloading.
          window.location.reload();
        }
      }
    } catch {
      setActionError('Network error.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="border-t border-border pt-3 mt-3 space-y-2">
      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-xs text-muted uppercase tracking-wide font-medium">Signature</span>
        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${pill.className}`}>
          {pill.label}
        </span>
        {sigId && (
          <span className="text-[11px] text-muted font-mono">env: {sigId}</span>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {sigStatus === 'generated' && (
          <button
            onClick={onSend}
            disabled={sending}
            className="bg-navy text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-navy/90 disabled:opacity-50"
            title="Send the generated MSA to the TPA signer via Dropbox Sign. Jonathan Arias will counter-sign automatically after."
          >
            {sending ? 'Sending…' : 'Send for signature'}
          </button>
        )}
        {canResend && (
          <button
            onClick={resend}
            disabled={busy !== null}
            className="bg-white border border-navy/30 text-navy px-4 py-2 rounded-lg text-sm font-medium hover:border-navy disabled:opacity-50"
            title="Re-send the signature request email. Dropbox Sign rate-limits reminders."
          >
            {busy === 'resend' ? 'Sending…' : 'Resend reminder'}
          </button>
        )}
        {canVoid && (
          <button
            onClick={voidContract}
            disabled={busy !== null}
            className="bg-white border border-red-300 text-red-700 px-4 py-2 rounded-lg text-sm font-medium hover:border-red-500 hover:bg-red-50 disabled:opacity-50"
            title="Cancel the signature request and mark this contract void. A new MSA will need to be generated."
          >
            {busy === 'void' ? 'Voiding…' : 'Void contract'}
          </button>
        )}
      </div>

      {actionError && (
        <div className="rounded-lg bg-red-50 border border-red-200 text-red-800 text-xs px-3 py-2">{actionError}</div>
      )}
      {actionSuccess && (
        <div className="rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs px-3 py-2">{actionSuccess}</div>
      )}

      {contract.sent_at && (
        <p className="text-[11px] text-muted">Sent {new Date(contract.sent_at).toLocaleString()}</p>
      )}
      {contract.signed_at && (
        <p className="text-[11px] text-muted">Signed {new Date(contract.signed_at).toLocaleString()}</p>
      )}
    </div>
  );
}

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div className="py-10 md:py-16 bg-background min-h-screen">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">{children}</div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="bg-surface rounded-xl border border-border shadow-sm p-6">
      <h2 className="font-semibold text-sm text-navy uppercase tracking-wide mb-4">{title}</h2>
      <dl className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3">
        {children}
      </dl>
    </section>
  );
}

function Field({ label, value, mono, hint }: { label: string; value: string | null; mono?: boolean; hint?: string }) {
  return (
    <div>
      <dt className="text-xs text-muted uppercase tracking-wide font-medium">{label}</dt>
      <dd className={`text-sm text-navy mt-0.5 ${mono ? 'font-mono' : ''}`}>
        {value && value.length > 0 ? value : <span className="text-muted italic">—</span>}
      </dd>
      {hint && <p className="text-[11px] text-muted mt-1">{hint}</p>}
    </div>
  );
}

function formatAddress(row: SignupRow): string | null {
  const parts = [row.street_address, row.city, row.state, row.zip].filter(Boolean);
  return parts.length > 0 ? parts.join(', ') : null;
}
