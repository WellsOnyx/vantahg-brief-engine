import Link from 'next/link';
import { VHG_BRAND } from '@/lib/vhg/brand';
import { notFound } from 'next/navigation';
import { DemoDisabled } from '@/components/vhg/DemoDisabled';
import { VhgReviewPanels } from '@/components/vhg/VhgReviewPanels';
import { isVhgScoreDemoEnabled } from '@/lib/vhg/flag';
import { getLedgerCase } from '@/lib/vhg/ledger';
import { getMedReviewDemoCase, panelFromCase } from '@/lib/vhg/portfolio';

export const dynamic = 'force-dynamic';

export default async function StoplossReviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  if (!isVhgScoreDemoEnabled()) return <DemoDisabled />;
  const { id } = await params;
  const row = getMedReviewDemoCase(id) ?? getLedgerCase(id);
  if (!row) notFound();
  const panel = panelFromCase(row, false);
  return (
    <div className="min-h-screen bg-background">
      <header className="bg-navy text-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
          <p className="text-[11px] uppercase tracking-[0.18em] text-gold font-semibold">Demo, synthetic data</p>
          <h1 className="font-[family-name:var(--font-display)] text-4xl mt-2">{panel.case_number}</h1>
          <p className="text-sm text-white/70 mt-3 max-w-2xl">
            Criteria result (demo) beside {VHG_BRAND}. The doctor decides.
          </p>
          <Link href="/stoploss" className="inline-block mt-4 text-sm text-gold">
            Back to stop-loss dashboard
          </Link>
        </div>
      </header>
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
        <VhgReviewPanels panel={panel} />
      </main>
    </div>
  );
}
