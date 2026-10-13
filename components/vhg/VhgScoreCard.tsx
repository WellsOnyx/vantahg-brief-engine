import { LIKELY_IDR_CONTESTED_LABEL, VHG_BRAND, vhgBandLabel } from '@/lib/vhg/brand';
import type { VhgScore } from '@/lib/vhg/types';

function bandClass(band: string): string {
  if (band === 'high') return 'bg-rose-100 text-rose-800';
  if (band === 'medium') return 'bg-amber-100 text-amber-900';
  return 'bg-emerald-100 text-emerald-800';
}

/** Doctor-facing score. Every visible VHG token comes from VHG_BRAND. */
export function VhgScoreCard({ score }: { score: VhgScore }) {
  return (
    <section className="rounded-xl border border-[#c9a227]/50 bg-white p-5" aria-label={`${VHG_BRAND} ranking`}>
      <p className="text-[11px] uppercase tracking-[0.16em] text-[#c9a227] font-semibold">Demo, synthetic data</p>
      <h2 className="text-lg font-semibold text-[#0c2340] mt-1">{VHG_BRAND}</h2>
      <p className="text-[11px] uppercase tracking-wider text-[#0c2340]/50 mt-4">{VHG_BRAND} ranking</p>
      <span className={`inline-block mt-1 text-xs font-semibold tracking-wide px-2 py-1 rounded-full ${bandClass(score.band)}`}>
        {vhgBandLabel(score.band)}
      </span>
      <p className="text-[11px] uppercase tracking-wider text-[#0c2340]/50 mt-4">{LIKELY_IDR_CONTESTED_LABEL}</p>
      <p className="text-5xl text-[#0c2340] leading-none mt-1 font-semibold">{score.score}%</p>
      <p className="text-xs text-[#0c2340]/60 mt-2">0–100% likelihood this synthetic case is later contested in IDR.</p>
      <p className="text-sm text-[#0c2340] mt-4 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">{score.advisory}</p>
      <p className="text-[11px] uppercase tracking-wider text-[#0c2340]/50 mt-4">Top 3 drivers</p>
      <ol className="mt-2 space-y-2">
        {score.drivers.slice(0, 3).map((driver) => (
          <li key={driver.key} className="text-sm">
            <div className="flex justify-between gap-3">
              <span className="font-medium text-[#0c2340]">{driver.label}</span>
              <span className={driver.points > 0 ? 'text-rose-700' : 'text-emerald-700'}>
                {driver.points > 0 ? '+' : ''}
                {driver.points}
              </span>
            </div>
            <p className="text-xs text-[#0c2340]/60">{driver.detail}</p>
          </li>
        ))}
      </ol>
      <p className="text-[11px] text-[#0c2340]/50 mt-4">
        {score.model_id} · {score.model_status.replaceAll('_', ' ')} · not a validated predictor
      </p>
    </section>
  );
}
