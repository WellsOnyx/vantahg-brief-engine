'use client';

import { useEffect, useState } from 'react';
import { PageHero } from '@/components/layouts/PageLayouts';

interface Packet {
  id: string;
  display_name: string;
  status: string;
  responsibility: string;
  licenses: { state: string; license_number: string }[];
  sanctions: { source: string; result: string; finding_summary: string }[];
}

export function ApprovalQueue() {
  const [packets, setPackets] = useState<Packet[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch('/api/iro/approvals', { cache: 'no-store' });
      const body = await res.json();
      if (cancelled) return;
      if (!res.ok) {
        setError(body.reason || body.error || 'Approval queue is unavailable.');
        return;
      }
      setPackets(body.physicians ?? []);
    })().catch(() => setError('Could not load the approval queue.'));
    return () => {
      cancelled = true;
    };
  }, []);

  async function decide(id: string) {
    const res = await fetch(`/api/iro/approvals/${id}/decide`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ decision: 'approved', note: 'Synthetic sign-off' }),
    });
    const body = await res.json();
    setNotice(
      res.ok
        ? 'Panel approval recorded.'
        : body.error === 'Forbidden'
          ? 'Only the clinical_approver role can sign. The Medical Director is not appointed yet, and the role is assignable from Team.'
          : body.error || 'Decision was not recorded.',
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 md:px-8">
      <PageHero
        eyebrow="VantaHG · IRO"
        title="Clinical panel approval"
        subtitle="The designated Medical Director (clinical_approver) signs after HR verification. Contracts are not on this screen."
      />
      {error && <p className="mt-6 text-sm text-red-800" role="alert">{error}</p>}
      {packets && packets.length === 0 && <p className="mt-6 text-sm text-navy/70">No files are waiting on the Medical Director.</p>}
      <ul className="mt-6 space-y-4">
        {packets?.map((packet) => (
          <li key={packet.id} className="rounded-xl border border-navy/10 bg-white p-4">
            <h2 className="font-[family-name:var(--font-dm-serif)] text-2xl text-navy">{packet.display_name}</h2>
            <p className="text-sm text-navy/70">{packet.responsibility}</p>
            <ul className="mt-2 text-sm">
              {packet.licenses.map((license) => (
                <li key={license.license_number}>{license.state} {license.license_number}</li>
              ))}
              {packet.sanctions.map((row) => (
                <li key={row.source}>{row.source}: {row.result}. {row.finding_summary}</li>
              ))}
            </ul>
            <button type="button" className="btn-primary mt-4" onClick={() => decide(packet.id)}>
              Sign panel approval
            </button>
          </li>
        ))}
      </ul>
      {notice && <p className="mt-4 text-sm text-navy" role="status">{notice}</p>}
    </div>
  );
}
