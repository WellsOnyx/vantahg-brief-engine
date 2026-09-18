'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { PageHero, PageList, PageSectionHeading } from '@/components/layouts/PageLayouts';
import { EmptyState } from '@/components/EmptyState';

interface CmItem {
  case_id: string;
  case_number: string;
  external_id: string | null;
  flags: string[];
  determination: string;
  determined_at: string;
  secure_summary_url: string;
}

export default function TpaCmQueuePage() {
  const [items, setItems] = useState<CmItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch('/api/cm/queue?seed=synthetic', { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setItems(data.items ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load CM queue');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <PageList
      hero={
        <PageHero
          eyebrow="TPA Portal"
          title="Care management"
          subtitle="Flagged determinations only. Unflagged cases never appear. Webhook HMAC uses the same retry budget as determination.signed."
          actions={
            <Link href="/api/cm/csv?seed=synthetic" className="btn btn-primary text-sm">
              Daily CSV stub
            </Link>
          }
        />
      }
    >
      <div className="card p-5 md:p-6">
        <PageSectionHeading hint={<Link href="/portal/tpa/reports" className="text-xs text-navy underline">Reports →</Link>}>
          CM queue
        </PageSectionHeading>
        {error && <p className="text-sm text-red-700">{error}</p>}
        {items === null && !error && <p className="text-sm text-muted">Loading…</p>}
        {items && items.length === 0 && (
          <EmptyState
            tone="gold"
            title="No flagged handoffs."
            body="CM flags are set at MD sign. Approves without flags stay off this feed."
          />
        )}
        {items && items.length > 0 && (
          <ul className="divide-y divide-border">
            {items.map((item) => (
              <li key={item.case_id} className="py-3 flex flex-wrap justify-between gap-2">
                <div>
                  <p className="font-mono text-xs font-semibold text-navy">{item.case_number}</p>
                  <p className="text-xs text-muted">
                    {item.determination} · {item.flags.join(', ')}
                  </p>
                </div>
                <a href={item.secure_summary_url} className="text-xs text-navy underline">
                  Summary
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>
    </PageList>
  );
}
