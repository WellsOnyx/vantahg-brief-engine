'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { createBrowserClient } from '@/lib/supabase-browser';

/**
 * Admin signup detail — read-only in this PR. Action buttons (approve
 * / reject / upload contract) land in subsequent pieces.
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
  const [accessChecked, setAccessChecked] = useState(false);
  const [hasAccess, setHasAccess] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function init() {
      const browser = createBrowserClient();
      if (!browser) {
        if (!cancelled) {
          setHasAccess(true);
          setAccessChecked(true);
          await load();
        }
        return;
      }
      const { data: { user } } = await browser.auth.getUser();
      if (!user) {
        if (!cancelled) {
          setHasAccess(false);
          setAccessChecked(true);
        }
        return;
      }
      const { data: profile } = await browser
        .from('user_profiles')
        .select('role')
        .eq('id', user.id)
        .maybeSingle();
      const role = profile?.role ?? 'reviewer';
      const allowed = role === 'admin' || role === 'ceo' || role === 'slt' || role === 'builder';
      if (!cancelled) {
        setHasAccess(allowed);
        setAccessChecked(true);
        if (allowed) await load();
      }
    }
    async function load() {
      try {
        const res = await fetch(`/api/admin/signups/${id}`);
        if (res.status === 404) {
          setError('Signup not found.');
          return;
        }
        if (!res.ok) {
          setError(`Failed to load (${res.status})`);
          return;
        }
        const data = (await res.json()) as SignupRow;
        if (!cancelled) setRow(data);
      } catch {
        if (!cancelled) setError('Failed to load signup');
      }
    }
    init();
    return () => { cancelled = true; };
  }, [id]);

  if (!accessChecked) {
    return <Frame><div className="text-muted">Loading…</div></Frame>;
  }

  if (!hasAccess) {
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
    <Frame>
      <div className="mb-6">
        <Link href="/admin/signups" className="text-sm text-muted hover:text-navy">
          ← Back to signups
        </Link>
      </div>

      {/* Header */}
      <div className="mb-8 flex flex-col md:flex-row md:items-start md:justify-between gap-4">
        <div>
          <h1 className="font-[family-name:var(--font-dm-serif)] text-3xl md:text-4xl text-navy">
            {row.legal_name}
          </h1>
          {row.dba && <p className="text-muted text-lg mt-1">dba {row.dba}</p>}
          <div className="flex items-center gap-3 mt-3">
            <span className={`inline-block px-3 py-1 rounded-full text-xs font-semibold border ${STATUS_PILL[row.status]}`}>
              {STATUS_LABEL[row.status]}
            </span>
            <span className="text-xs text-muted">
              Submitted {new Date(row.created_at).toLocaleString()}
            </span>
          </div>
        </div>
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-xs text-amber-900 max-w-sm">
          Read-only view. Approve / reject / contract-upload actions land in subsequent PRs.
        </div>
      </div>

      {/* Sections */}
      <div className="space-y-6">
        <Section title="Company">
          <Field label="Legal name" value={row.legal_name} />
          <Field label="DBA" value={row.dba} />
          <Field label="Entity state" value={row.entity_state} />
          <Field label="Address" value={formatAddress(row)} />
        </Section>

        <Section title="Primary contact">
          <Field label="Name" value={row.primary_contact_name} />
          <Field label="Title" value={row.primary_contact_title} />
          <Field label="Email" value={row.primary_contact_email} mono />
          <Field label="Phone" value={row.primary_contact_phone} />
        </Section>

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

        <Section title="Signed contract">
          {row.contract_storage_path ? (
            <>
              <Field label="Storage path" value={row.contract_storage_path} mono />
              <Field label="Uploaded by" value={row.contract_uploaded_by} mono />
              <Field label="Uploaded at" value={row.contract_uploaded_at ? new Date(row.contract_uploaded_at).toLocaleString() : null} />
            </>
          ) : (
            <p className="text-sm text-muted italic">No contract uploaded yet. Upload UI lands in piece 6/N.</p>
          )}
        </Section>
      </div>
    </Frame>
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
