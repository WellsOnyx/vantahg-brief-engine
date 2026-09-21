'use client';

import { useEffect, useState } from 'react';
import { SectionCard } from '@/components/SectionCard';
import { EmptyState } from '@/components/EmptyState';

interface MuseTouchpointRow {
  touchpoint_id: string;
  account_id: string;
  contact_role: string;
  scheduling_intent: Record<string, boolean>;
}

interface MuseTouchpointsResponse {
  entitled: boolean;
  configured: boolean;
  touchpoints: MuseTouchpointRow[];
}

function intentLabels(flags: Record<string, boolean>): string {
  const on = Object.entries(flags)
    .filter(([, value]) => value)
    .map(([key]) => key.replace(/_/g, ' '));
  return on.length ? on.join(' · ') : 'no scheduling flags';
}

/**
 * CX aside hook. The list renders only when the server says Muse is
 * entitled. Otherwise the empty state. This component never sends
 * case content anywhere.
 */
export function MuseTouchpointsPanel() {
  const [data, setData] = useState<MuseTouchpointsResponse | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/muse/touchpoints', { cache: 'no-store' })
      .then(async (res) => {
        if (cancelled) return;
        if (!res.ok) {
          setData({ entitled: false, configured: false, touchpoints: [] });
          return;
        }
        const body = (await res.json()) as MuseTouchpointsResponse;
        if (cancelled) return;
        setData({
          entitled: Boolean(body.entitled),
          configured: Boolean(body.configured),
          touchpoints: Array.isArray(body.touchpoints) ? body.touchpoints : [],
        });
      })
      .catch(() => {
        if (!cancelled) setData({ entitled: false, configured: false, touchpoints: [] });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const showList = Boolean(data?.entitled && data.configured);

  return (
    <SectionCard eyebrow="CX only" title="Muse touchpoints">
      {!data ? (
        <p className="text-sm text-muted">Loading Muse…</p>
      ) : !showList ? (
        <EmptyState
          title="Muse is not configured."
          body="Relationship touchpoints stay empty until Muse is enabled. No clinical case content is sent to Muse."
        />
      ) : data.touchpoints.length === 0 ? (
        <EmptyState
          title="No Muse touchpoints yet."
          body="Account id, contact role, and scheduling flags land here. Clinical packets stay on Med review."
        />
      ) : (
        <ul className="space-y-2 text-sm">
          {data.touchpoints.map((row) => (
            <li key={row.touchpoint_id}>
              <p className="font-mono text-xs text-navy">{row.account_id}</p>
              <p className="text-[10px] uppercase tracking-wider text-muted">{row.contact_role}</p>
              <p className="text-xs text-muted">{intentLabels(row.scheduling_intent)}</p>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}
