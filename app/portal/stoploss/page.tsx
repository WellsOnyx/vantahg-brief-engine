'use client';

import { Suspense, use } from 'react';
import { useSearchParams } from 'next/navigation';
import { StoplossDashboard } from '@/components/vhg/StoplossDashboard';
import type { StoplossDashboardResult } from '@/lib/vhg/dashboard';
import { VHG_BRAND } from '@/lib/vhg/brand';
import { ENTITLED_CLIENT_ID } from '@/lib/vhg/catalog';

interface Loaded {
  status: number;
  body: StoplossDashboardResult | { error?: string };
}

const cache = new Map<string, Promise<Loaded>>();

function loadDashboard(clientId: string): Promise<Loaded> {
  const existing = cache.get(clientId);
  if (existing) return existing;
  const pending = fetch(`/api/vhg/stoploss?client=${encodeURIComponent(clientId)}`)
    .then(async (response) => ({
      status: response.status,
      body: (await response.json()) as Loaded['body'],
    }))
    .catch(() => ({ status: 500, body: { error: 'network' } }));
  cache.set(clientId, pending);
  return pending;
}

function PortalBody() {
  const params = useSearchParams();
  const clientId = params.get('client') || ENTITLED_CLIENT_ID;
  const loaded = use(loadDashboard(clientId));
  if (loaded.status === 404) {
    return (
      <div className="max-w-xl mx-auto py-16 px-6">
        <h1 className="text-2xl font-semibold text-navy">{VHG_BRAND} Score demo is off</h1>
        <p className="text-sm text-muted mt-2">ENABLE_VHG_SCORE_DEMO is not true on this server.</p>
      </div>
    );
  }
  if (loaded.status === 403 || loaded.status === 401) {
    return (
      <div className="max-w-xl mx-auto py-16 px-6">
        <h1 className="text-2xl font-semibold text-navy">Stop-loss partner only</h1>
        <p className="text-sm text-muted mt-2">This dashboard requires the stoploss_partner role.</p>
      </div>
    );
  }
  if (!('ok' in loaded.body)) {
    return (
      <div className="max-w-xl mx-auto py-16 px-6">
        <h1 className="text-2xl font-semibold text-navy">Dashboard unavailable</h1>
      </div>
    );
  }
  return (
    <StoplossDashboard
      result={loaded.body}
      basePath="/portal/stoploss"
      reviewBasePath="/stoploss/review"
    />
  );
}

export default function PortalStoplossPage() {
  return (
    <Suspense fallback={<p className="p-8 text-sm text-muted">Loading stop-loss demo…</p>}>
      <PortalBody />
    </Suspense>
  );
}
