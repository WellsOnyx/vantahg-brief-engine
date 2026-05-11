'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createBrowserClient } from '@/lib/supabase-browser';
import { getTimeRemaining, formatTimeRemaining, getSlaStatus } from '@/lib/sla-calculator';

interface MyCase {
  id: string;
  case_number: string;
  status: string;
  priority: 'standard' | 'urgent' | 'expedited';
  patient_name: string | null;
  patient_member_id: string | null;
  procedure_codes: string[] | null;
  procedure_description: string | null;
  created_at: string;
  turnaround_deadline: string | null;
  determination: string | null;
  determination_at: string | null;
  review_type: string | null;
  authorization_number: string | null;
  service_category: string | null;
  ai_brief_generated_at: string | null;
}

const STATUS_LABEL: Record<string, string> = {
  intake: 'Intake',
  processing: 'Processing',
  brief_ready: 'Brief Ready',
  lpn_review: 'Nursing Review',
  rn_review: 'Nursing Review',
  md_review: 'Physician Review',
  pend_missing_info: 'Pending Info',
  determination_made: 'Determined',
  delivered: 'Delivered',
};

const STATUS_PILL: Record<string, string> = {
  intake: 'bg-blue-100 text-blue-800',
  processing: 'bg-yellow-100 text-yellow-800',
  brief_ready: 'bg-teal-100 text-teal-800',
  lpn_review: 'bg-teal-100 text-teal-800',
  rn_review: 'bg-blue-100 text-blue-800',
  md_review: 'bg-purple-100 text-purple-800',
  pend_missing_info: 'bg-amber-100 text-amber-800',
  determination_made: 'bg-green-100 text-green-800',
  delivered: 'bg-emerald-100 text-emerald-800',
};

const DETERMINATION_LABEL: Record<string, string> = {
  approve: 'Approved',
  deny: 'Denied',
  partial_approve: 'Partial Approval',
  modify: 'Modified',
  pend: 'Pended',
  peer_to_peer_requested: 'P2P Requested',
};

const DETERMINATION_PILL: Record<string, string> = {
  approve: 'bg-green-100 text-green-800',
  deny: 'bg-red-100 text-red-800',
  partial_approve: 'bg-amber-100 text-amber-800',
  modify: 'bg-amber-100 text-amber-800',
  pend: 'bg-yellow-100 text-yellow-800',
  peer_to_peer_requested: 'bg-purple-100 text-purple-800',
};

export default function ClientCasesPage() {
  const router = useRouter();
  const [cases, setCases] = useState<MyCase[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      // Client-side guard: bounce to /login if not authenticated. The
      // server route also enforces this, but doing it here avoids a flash
      // of the empty dashboard before the 401 lands.
      const browser = createBrowserClient();
      if (browser) {
        const { data: { user } } = await browser.auth.getUser();
        if (!user) {
          router.replace('/login?redirect=/client/cases');
          return;
        }
        if (!cancelled) setUserEmail(user.email ?? null);
      }

      try {
        const res = await fetch('/api/client/my-cases');
        if (!res.ok) {
          if (res.status === 401) {
            router.replace('/login?redirect=/client/cases');
            return;
          }
          if (res.status === 403) {
            if (!cancelled) setError('Your account does not have client access. Contact your administrator.');
            return;
          }
          if (!cancelled) setError(`Failed to load cases (${res.status})`);
          return;
        }
        const data = (await res.json()) as MyCase[];
        if (!cancelled) setCases(data);
      } catch {
        if (!cancelled) setError('Failed to load cases');
      }
    }
    load();
    return () => { cancelled = true; };
  }, [router]);

  if (error) {
    return (
      <div className="py-10 md:py-16 bg-background min-h-screen">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="bg-surface rounded-xl border border-red-200 shadow-sm p-6 text-red-800">
            {error}
          </div>
        </div>
      </div>
    );
  }

  if (cases === null) {
    return (
      <div className="py-10 md:py-16 bg-background min-h-screen">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 text-muted">
          Loading your cases…
        </div>
      </div>
    );
  }

  const active = cases.filter((c) => c.status !== 'delivered');
  const completed = cases.filter((c) => c.status === 'delivered');

  return (
    <div className="py-10 md:py-16 bg-background min-h-screen">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8 flex flex-col md:flex-row md:items-end md:justify-between gap-3">
          <div>
            <h1 className="font-[family-name:var(--font-dm-serif)] text-3xl md:text-4xl text-navy">
              My Cases
            </h1>
            <p className="text-muted mt-1 text-lg">
              {userEmail && <span className="text-navy/70">{userEmail} · </span>}
              {cases.length} case{cases.length === 1 ? '' : 's'} · {active.length} active
            </p>
          </div>
        </div>

        {cases.length === 0 ? (
          <div className="bg-surface rounded-xl border border-border shadow-sm p-10 text-center">
            <p className="text-muted">
              No cases yet. Submitted cases will appear here as soon as they enter intake.
            </p>
          </div>
        ) : (
          <>
            {active.length > 0 && (
              <Section title={`Active (${active.length})`}>
                <CaseTable cases={active} />
              </Section>
            )}
            {completed.length > 0 && (
              <Section title={`Delivered (${completed.length})`}>
                <CaseTable cases={completed} />
              </Section>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-8">
      <h2 className="font-semibold text-sm text-navy uppercase tracking-wide mb-3">{title}</h2>
      <div className="bg-surface rounded-xl border border-border shadow-sm overflow-hidden">
        {children}
      </div>
    </section>
  );
}

function CaseTable({ cases }: { cases: MyCase[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead className="bg-gray-50 text-xs uppercase tracking-wide text-muted">
          <tr>
            <Th>Case</Th>
            <Th>Patient</Th>
            <Th>Procedure</Th>
            <Th>Status</Th>
            <Th>Determination</Th>
            <Th>SLA</Th>
            <Th className="text-right">Actions</Th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {cases.map((c) => (
            <CaseRow key={c.id} c={c} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CaseRow({ c }: { c: MyCase }) {
  const slaCell = renderSla(c);
  const briefReady = c.ai_brief_generated_at !== null;

  return (
    <tr className="hover:bg-gray-50">
      <Td>
        <div className="font-mono text-xs text-navy font-semibold">{c.case_number}</div>
        {c.authorization_number && (
          <div className="text-[10px] text-muted mt-0.5">{c.authorization_number}</div>
        )}
      </Td>
      <Td>
        <div className="font-medium">{c.patient_name || '—'}</div>
        {c.patient_member_id && (
          <div className="text-[10px] text-muted mt-0.5">{c.patient_member_id}</div>
        )}
      </Td>
      <Td>
        <div className="font-mono text-xs">{(c.procedure_codes ?? []).join(', ') || '—'}</div>
        {c.procedure_description && (
          <div className="text-[11px] text-muted mt-0.5 max-w-xs truncate">{c.procedure_description}</div>
        )}
      </Td>
      <Td>
        <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${STATUS_PILL[c.status] ?? 'bg-gray-100 text-gray-800'}`}>
          {STATUS_LABEL[c.status] ?? c.status}
        </span>
        {c.priority !== 'standard' && (
          <span className="ml-1 inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold bg-red-100 text-red-800 uppercase">
            {c.priority}
          </span>
        )}
      </Td>
      <Td>
        {c.determination ? (
          <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${DETERMINATION_PILL[c.determination] ?? 'bg-gray-100 text-gray-800'}`}>
            {DETERMINATION_LABEL[c.determination] ?? c.determination}
          </span>
        ) : (
          <span className="text-muted text-xs">Pending</span>
        )}
      </Td>
      <Td>{slaCell}</Td>
      <Td className="text-right">
        {briefReady ? (
          <a
            href={`/api/cases/${c.id}/brief-pdf`}
            download={`brief-${c.case_number}.pdf`}
            className="inline-flex items-center gap-1 px-3 py-1 rounded-lg bg-navy text-white text-xs font-semibold hover:bg-navy-light transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            PDF Brief
          </a>
        ) : (
          <span className="text-[11px] text-muted italic">Brief not yet ready</span>
        )}
      </Td>
    </tr>
  );
}

function renderSla(c: MyCase) {
  // Once the case has been determined, we surface the actual TAT instead of
  // a countdown — the deadline is historical information at that point.
  if (c.determination_at) {
    return <span className="text-xs text-muted">Decided {new Date(c.determination_at).toLocaleDateString()}</span>;
  }
  if (!c.turnaround_deadline) {
    return <span className="text-xs text-muted">—</span>;
  }
  const remaining = getTimeRemaining(c.turnaround_deadline);
  const status = getSlaStatus(c.turnaround_deadline);
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${status.bgColor} ${status.color} border ${status.borderColor}`}>
      {formatTimeRemaining(remaining)}
    </span>
  );
}

function Th({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <th className={`px-4 py-3 text-left font-semibold ${className}`}>{children}</th>;
}

function Td({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-4 py-3 align-top ${className}`}>{children}</td>;
}
