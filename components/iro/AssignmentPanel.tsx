'use client';

import { useCallback, useEffect, useState } from 'react';
import { PageHero } from '@/components/layouts/PageLayouts';

interface Card {
  id: string;
  display_name: string;
  specialties: string[];
  jurisdictions: string[];
  availability: string;
  assignment_status: string;
  case_checks_complete: boolean;
}

interface PanelCase {
  case_ref: string;
  required_specialty: string;
  required_jurisdiction: string;
  assignment_state: string;
  assigned_physician_id: string | null;
  case_checks_complete: boolean;
}

interface PanelBody {
  physicians: Card[];
  case: PanelCase | null;
}

const CASE_REF = 'case_synth_iro_ortho_tx';

export function AssignmentPanel() {
  const [data, setData] = useState<PanelBody | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [physicianId, setPhysicianId] = useState('');
  const [conflictFree, setConflictFree] = useState(false);
  const [qualified, setQualified] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/iro/panel?case_ref=${CASE_REF}`, { cache: 'no-store' });
    const body = await res.json();
    if (!res.ok) {
      setError(body.reason || body.error || 'Assignment view is unavailable.');
      return;
    }
    setData(body as PanelBody);
    setPhysicianId((current) => current || body.physicians?.[0]?.id || '');
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/iro/panel?case_ref=${CASE_REF}`, { cache: 'no-store' });
        const body = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setError(body.reason || body.error || 'Assignment view is unavailable.');
          return;
        }
        setData(body as PanelBody);
        setPhysicianId((current) => current || body.physicians?.[0]?.id || '');
      } catch {
        if (!cancelled) setError('Could not load the assignment view.');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function attest() {
    setBusy(true);
    setNotice(null);
    const res = await fetch(`/api/iro/cases/${CASE_REF}/attestations`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        physician_id: physicianId,
        conflict_attested: true,
        conflict_free: conflictFree,
        conflict_note: conflictFree ? null : 'Synthetic conflict note SYN-CONFLICT-NOTE',
        qualification_attested: true,
        specialty_match: qualified,
        jurisdiction_match: qualified,
      }),
    });
    const body = await res.json();
    setBusy(false);
    if (!res.ok) {
      setNotice(body.error || 'Attestation was not recorded.');
      return;
    }
    setNotice(body.case_checks_complete ? 'Case checks complete for this physician.' : 'Attestation saved. Case checks are not complete.');
    await load();
  }

  async function assign() {
    setBusy(true);
    setNotice(null);
    const res = await fetch(`/api/iro/cases/${CASE_REF}/assign`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ physician_id: physicianId }),
    });
    const body = await res.json();
    setBusy(false);
    if (!res.ok) {
      setNotice(body.error === 'attestation_required'
        ? 'Assignment blocked until the reviewer completes conflict and qualification checks. Panel approval does not satisfy them.'
        : body.error || 'Assignment blocked.');
      return;
    }
    setNotice(`Assigned ${body.physician_id}.`);
    await load();
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 md:px-8">
      <PageHero
        eyebrow="VantaHG · IRO assignment"
        title="Panel availability"
        subtitle="Physician name, approved specialty, jurisdiction, availability, assignment status, and whether required case checks are done. HR records are not on this screen."
      />
      {error && (
        <p className="mt-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">
          {error}
        </p>
      )}
      {data && (
        <>
          {data.case && (
            <p className="mt-4 rounded-lg bg-navy px-4 py-3 text-sm text-white">
              Case {data.case.case_ref} needs {data.case.required_specialty.replaceAll('_', ' ')} in {data.case.required_jurisdiction}. Assignment is {data.case.assignment_state}. Case checks {data.case.case_checks_complete ? 'complete' : 'incomplete'}.
            </p>
          )}
          <div className="mt-6 overflow-hidden rounded-xl border border-navy/10 bg-white">
            <table className="w-full text-left text-sm">
              <thead className="bg-navy text-white">
                <tr>
                  <th className="px-4 py-2 font-medium">Physician</th>
                  <th className="px-4 py-2 font-medium">Specialty</th>
                  <th className="px-4 py-2 font-medium">Jurisdiction</th>
                  <th className="px-4 py-2 font-medium">Availability</th>
                  <th className="px-4 py-2 font-medium">Assignment</th>
                  <th className="px-4 py-2 font-medium">Case checks</th>
                </tr>
              </thead>
              <tbody>
                {data.physicians.map((row) => (
                  <tr key={row.id} className="border-t border-navy/10">
                    <td className="px-4 py-3 font-medium text-navy">{row.display_name}</td>
                    <td className="px-4 py-3">{row.specialties.map((item) => item.replaceAll('_', ' ')).join(', ')}</td>
                    <td className="px-4 py-3">{row.jurisdictions.join(', ')}</td>
                    <td className="px-4 py-3">{row.availability}</td>
                    <td className="px-4 py-3">{row.assignment_status.replaceAll('_', ' ')}</td>
                    <td className="px-4 py-3">{row.case_checks_complete ? 'Complete' : 'Not complete'}</td>
                  </tr>
                ))}
                {data.physicians.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-6 text-navy/70">No approved, unexpired physicians are assignable.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <form
            className="mt-6 rounded-xl border border-navy/10 bg-white p-4"
            onSubmit={(event) => {
              event.preventDefault();
            }}
          >
            <h2 className="font-[family-name:var(--font-dm-serif)] text-xl text-navy">Assign this case</h2>
            <label className="mt-3 block text-sm text-navy">
              Physician
              <select
                className="mt-1 w-full rounded-md border border-navy/20 px-3 py-2"
                value={physicianId}
                onChange={(event) => setPhysicianId(event.target.value)}
              >
                {data.physicians.map((row) => (
                  <option key={row.id} value={row.id}>{row.display_name}</option>
                ))}
              </select>
            </label>
            <label className="mt-3 flex items-center gap-2 text-sm">
              <input type="checkbox" checked={conflictFree} onChange={(event) => setConflictFree(event.target.checked)} />
              No conflict of interest on this case
            </label>
            <label className="mt-2 flex items-center gap-2 text-sm">
              <input type="checkbox" checked={qualified} onChange={(event) => setQualified(event.target.checked)} />
              Qualified for the specialty and jurisdiction
            </label>
            <div className="mt-4 flex flex-wrap gap-2">
              <button type="button" className="btn-primary" disabled={busy || !physicianId} onClick={attest}>
                Record case checks
              </button>
              <button type="button" className="btn-secondary" disabled={busy || !physicianId} onClick={assign}>
                Assign
              </button>
            </div>
            {notice && <p className="mt-3 text-sm text-navy" role="status">{notice}</p>}
          </form>
        </>
      )}
    </div>
  );
}
