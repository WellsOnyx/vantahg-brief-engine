'use client';

import { Suspense, use } from 'react';
import { VhgReviewPanels } from '@/components/vhg/VhgReviewPanels';
import type { MedReviewPanel } from '@/lib/vhg/types';

const cache = new Map<string, Promise<MedReviewPanel | null>>();

function loadPanel(caseId: string): Promise<MedReviewPanel | null> {
  const existing = cache.get(caseId);
  if (existing) return existing;
  const pending = fetch(`/api/vhg/panel?caseId=${encodeURIComponent(caseId)}`)
    .then(async (response) => {
      if (!response.ok) return null;
      const body = (await response.json()) as { panel?: MedReviewPanel };
      return body.panel ?? null;
    })
    .catch(() => null);
  cache.set(caseId, pending);
  return pending;
}

function PanelBody({ caseId }: { caseId: string }) {
  const panel = use(loadPanel(caseId));
  if (!panel) return null;
  return <VhgReviewPanels panel={panel} />;
}

/** Renders nothing when the demo flag is off or the request is unauthorized. */
export function VhgMedReviewAddon({ caseId }: { caseId: string }) {
  return (
    <Suspense fallback={null}>
      <PanelBody caseId={caseId} />
    </Suspense>
  );
}
