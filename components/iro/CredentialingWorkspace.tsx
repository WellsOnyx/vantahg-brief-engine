'use client';

import { useEffect, useState } from 'react';
import { PageHero } from '@/components/layouts/PageLayouts';

interface LicenseRow {
  state: string;
  license_number: string;
  expires_on: string;
  primary_source_verified_at: string | null;
  primary_source_result: string | null;
}

interface SanctionRow {
  source: string;
  screened_at: string;
  result: string;
  finding_summary: string;
}

interface PhysicianRow {
  id: string;
  display_name: string;
  legal_name: string;
  email: string;
  npi: string;
  status: string;
  responsibility: string;
  specialties: string[];
  jurisdictions: string[];
  contract_ref: string | null;
  notes_hr: string | null;
  verification_gaps: string[];
  licenses: LicenseRow[];
  sanctions: SanctionRow[];
  outstanding_items: { label: string; resolved_at: string | null }[];
  clinical_experience: { setting: string; direct_patient_care: boolean }[];
}

interface Workspace {
  cutover_gate: string;
  cutover_missing: string[];
  physicians: PhysicianRow[];
  reminders: { id: string; display_name: string; kind: string; message: string }[];
}

const STATUS_TONE: Record<string, string> = {
  applicant: 'bg-slate-100 text-slate-700',
  in_verification: 'bg-amber-50 text-amber-900',
  pending_clinical_approval: 'bg-sky-50 text-sky-900',
  approved: 'bg-emerald-50 text-emerald-900',
  conditional: 'bg-teal-50 text-teal-900',
  denied: 'bg-red-50 text-red-800',
  suspended: 'bg-orange-50 text-orange-900',
  expired: 'bg-stone-100 text-stone-700',
};

export function CredentialingWorkspace() {
  const [data, setData] = useState<Workspace | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch('/api/iro/credentialing', { cache: 'no-store' });
      const body = await res.json();
      if (cancelled) return;
      if (!res.ok) {
        setError(body.reason || body.error || 'Credentialing workspace is unavailable.');
        return;
      }
      setData(body as Workspace);
      setSelectedId(body.physicians?.[0]?.id ?? null);
    })().catch(() => setError('Could not load the credentialing workspace.'));
    return () => {
      cancelled = true;
    };
  }, []);

  const selected = data?.physicians.find((row) => row.id === selectedId) ?? data?.physicians[0];

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 md:px-8">
      <PageHero
        eyebrow="VantaHG · IRO"
        title="Credentialing workspace"
        subtitle="Restricted to Head of HR (credentialing_admin). Licenses, screening findings, contracts, and evidence stay on this screen."
      />
      {error && (
        <p className="mt-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">
          {error}
        </p>
      )}
      {data && (
        <>
          <p className="mt-4 rounded-lg border border-gold/40 bg-gold/10 px-4 py-3 text-sm text-navy">
            Cutover gate is <strong>{data.cutover_gate}</strong>.
            {data.cutover_gate !== 'open' && data.cutover_missing.length > 0
              ? ` Still open: ${data.cutover_missing.join(', ')}. The interim workbook remains the source until those checks are confirmed.`
              : ' Portal is the credentialing system of record.'}
          </p>
          <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
            <section className="overflow-hidden rounded-xl border border-navy/10 bg-white">
              <header className="border-b border-navy/10 px-4 py-3">
                <h2 className="font-[family-name:var(--font-dm-serif)] text-xl text-navy">Pipeline</h2>
              </header>
              <table className="w-full text-left text-sm">
                <thead className="bg-navy text-white">
                  <tr>
                    <th className="px-4 py-2 font-medium">Physician</th>
                    <th className="px-4 py-2 font-medium">Status</th>
                    <th className="px-4 py-2 font-medium">Responsible</th>
                  </tr>
                </thead>
                <tbody>
                  {data.physicians.map((row) => (
                    <tr
                      key={row.id}
                      className={row.id === selected?.id ? 'bg-gold/10' : 'hover:bg-navy/5'}
                    >
                      <td className="px-4 py-3">
                        <button type="button" className="text-left font-medium text-navy" onClick={() => setSelectedId(row.id)}>
                          {row.display_name}
                        </button>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`rounded-full px-2 py-1 text-xs ${STATUS_TONE[row.status] ?? ''}`}>{row.status.replaceAll('_', ' ')}</span>
                      </td>
                      <td className="px-4 py-3 text-navy/80">{row.responsibility.split('—')[0]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
            {selected && (
              <section className="rounded-xl border border-navy/10 bg-white p-4" aria-label="HR record">
                <p className="text-xs font-semibold uppercase tracking-wide text-gold-dark">HR record</p>
                <h2 className="mt-1 font-[family-name:var(--font-dm-serif)] text-2xl text-navy">{selected.display_name}</h2>
                <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <dt className="text-navy/60">Legal name</dt>
                    <dd>{selected.legal_name}</dd>
                  </div>
                  <div>
                    <dt className="text-navy/60">NPI</dt>
                    <dd>{selected.npi}</dd>
                  </div>
                  <div className="col-span-2">
                    <dt className="text-navy/60">Email</dt>
                    <dd>{selected.email}</dd>
                  </div>
                  <div className="col-span-2 rounded-md border border-navy/10 bg-navy/5 p-2">
                    <dt className="text-navy/60">Contract</dt>
                    <dd className="font-medium">{selected.contract_ref ?? 'None on file'}</dd>
                    {selected.notes_hr && <dd className="mt-1 text-navy/80">{selected.notes_hr}</dd>}
                  </div>
                </dl>
                <h3 className="mt-4 text-sm font-semibold text-navy">Licenses and primary source</h3>
                <ul className="mt-1 space-y-1 text-sm">
                  {selected.licenses.map((license) => (
                    <li key={license.license_number}>
                      {license.state} {license.license_number} · expires {license.expires_on} · PSV {license.primary_source_result ?? 'pending'} {license.primary_source_verified_at ?? ''}
                    </li>
                  ))}
                  {selected.licenses.length === 0 && <li>No license on file.</li>}
                </ul>
                <h3 className="mt-4 text-sm font-semibold text-navy">Sanctions screening</h3>
                <ul className="mt-1 space-y-1 text-sm">
                  {selected.sanctions.map((row) => (
                    <li key={`${row.source}-${row.screened_at}`}>
                      {row.source} {row.result} on {row.screened_at}. {row.finding_summary}
                    </li>
                  ))}
                  {selected.sanctions.length === 0 && <li>No screening stored.</li>}
                </ul>
                {selected.outstanding_items.length > 0 && (
                  <>
                    <h3 className="mt-4 text-sm font-semibold text-navy">Outstanding</h3>
                    <ul className="mt-1 list-disc pl-5 text-sm">
                      {selected.outstanding_items.map((item) => (
                        <li key={item.label}>{item.label}</li>
                      ))}
                    </ul>
                  </>
                )}
                {selected.verification_gaps.length > 0 && (
                  <p className="mt-3 text-sm text-amber-900">Verification gaps: {selected.verification_gaps.join(', ')}</p>
                )}
              </section>
            )}
          </div>
          <section className="mt-6 rounded-xl border border-navy/10 bg-white p-4">
            <h2 className="font-[family-name:var(--font-dm-serif)] text-xl text-navy">Reminders</h2>
            {data.reminders.length === 0 ? (
              <p className="mt-2 text-sm text-navy/70">No open reminders yet. The nightly job writes expirations, recredentialing, and outstanding items here.</p>
            ) : (
              <ul className="mt-2 space-y-1 text-sm">
                {data.reminders.map((row) => (
                  <li key={row.id}>
                    <span className="font-medium">{row.display_name}</span> · {row.kind} · {row.message}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}
