'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  PageEyebrow,
  PageHero,
  PageList,
  PageSectionHeading,
} from '@/components/layouts/PageLayouts';
import { EmptyState } from '@/components/EmptyState';

interface PortalDetermination {
  case_id: string;
  case_number: string;
  external_id: string | null;
  type: string;
  state: string;
  determination: string | null;
  determined_at: string | null;
  sla_status: string;
  fanout_status: string;
  download_url: string;
  letter_available: boolean;
}

const DETERMINATION_PILL: Record<string, string> = {
  approve: 'bg-green-100 text-green-800',
  deny: 'bg-red-100 text-red-800',
  pend: 'bg-yellow-100 text-yellow-800',
  partial: 'bg-amber-100 text-amber-800',
};

export default function TpaDeterminationsPage() {
  const [items, setItems] = useState<PortalDetermination[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/portal/determinations', { cache: 'no-store' });
        if (!res.ok) {
          if (!cancelled) setError(`Could not load determinations (${res.status}).`);
          return;
        }
        const data = (await res.json()) as { determinations: PortalDetermination[] };
        if (!cancelled) setItems(data.determinations ?? []);
      } catch {
        if (!cancelled) setError('Network error. Try again.');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <PageList
      hero={
        <PageHero
          eyebrow="TPA Portal"
          title="Determinations"
          subtitle="Signed decisions and downloadable packages. Synthetic staging — no live PHI."
        />
      }
    >
      <div className="card p-5 md:p-6">
        <PageSectionHeading hint={<Link href="/portal/tpa/statements" className="text-xs text-navy underline">Statements →</Link>}>
          Signed cases
        </PageSectionHeading>
        {error && <p className="text-sm text-red-700">{error}</p>}
        {items === null && !error && <p className="text-sm text-muted">Loading…</p>}
        {items && items.length === 0 && (
          <EmptyState
            tone="gold"
            title="No signed determinations yet."
            body="After an MD signs, the decision and package links land here."
          />
        )}
        {items && items.length > 0 && (
          <ul className="divide-y divide-border">
            {items.map((item) => (
              <li key={item.case_id} className="py-4 first:pt-0 last:pb-0">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <PageEyebrow>{item.type.replaceAll('_', ' ')}</PageEyebrow>
                    <p className="font-mono text-xs text-muted mt-1">{item.case_number}</p>
                    <p className="text-sm text-navy mt-1">
                      {item.determined_at
                        ? `Signed ${new Date(item.determined_at).toLocaleString()}`
                        : 'Signed'}
                    </p>
                    <p className="text-xs text-muted mt-1">
                      SLA {item.sla_status} · fan-out {item.fanout_status} · {item.state}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {item.determination && (
                      <span
                        className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold capitalize ${DETERMINATION_PILL[item.determination] ?? 'bg-gray-100 text-gray-800'}`}
                      >
                        {item.determination}
                      </span>
                    )}
                    <a
                      href={`${item.download_url}?format=html`}
                      className="btn btn-primary text-xs px-3 py-1.5"
                      download
                    >
                      Download package
                    </a>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </PageList>
  );
}
