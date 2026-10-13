import { LIKELY_IDR_CONTESTED_LABEL, VHG_SCORE_LABEL, vhgBandLabel } from '@/lib/vhg/brand';
import { DEMO_WALKTHROUGH_VHG_SCORE } from '@/lib/vhg/demo-brief-score';
import type { VhgScore } from '@/lib/vhg/types';

function bandTone(band: VhgScore['band']): { chip: string; dot: string; bar: string } {
  if (band === 'high') {
    return { chip: 'bg-rose-400/15 text-rose-200 border-rose-400/40', dot: 'bg-rose-400', bar: '#fb7185' };
  }
  if (band === 'low') {
    return { chip: 'bg-emerald-400/15 text-emerald-200 border-emerald-400/40', dot: 'bg-emerald-400', bar: '#34d399' };
  }
  return { chip: 'bg-amber-400/15 text-amber-100 border-amber-300/40', dot: 'bg-amber-300', bar: '#fbbf24' };
}

/** Dark full-width score for the guided-tour brief. Same numbers as the physician step. */
export function VhgDemoBriefScore({ score = DEMO_WALKTHROUGH_VHG_SCORE }: { score?: VhgScore }) {
  const tone = bandTone(score.band);
  return (
    <section className="rounded-2xl border border-[#c9a227]/40 bg-white/3 p-6" aria-label={VHG_SCORE_LABEL}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-white">{VHG_SCORE_LABEL}</h2>
        <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm font-semibold ${tone.chip}`}>
          <span className={`h-2.5 w-2.5 rounded-full ${tone.dot}`} aria-hidden />
          {vhgBandLabel(score.band)}
        </span>
      </div>
      <div className="mt-5">
        <div className="mb-3 flex items-end justify-between gap-4">
          <p className="text-xs uppercase tracking-widest text-white/40">{LIKELY_IDR_CONTESTED_LABEL}</p>
          <p className="text-5xl font-bold tabular-nums leading-none text-white">{score.score}%</p>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-white/8">
          <div className="h-full rounded-full" style={{ width: `${score.score}%`, background: tone.bar }} />
        </div>
      </div>
      <ol className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {score.drivers.slice(0, 3).map((driver) => (
          <li key={driver.key} className="rounded-xl border border-white/10 bg-white/5 px-3 py-3">
            <p className="text-sm font-medium text-white/85">{driver.label}</p>
            <p className="mt-1 text-xs text-white/40">{driver.detail}</p>
          </li>
        ))}
      </ol>
      <p className="mt-4 text-xs text-white/40">Advisory. The physician decides.</p>
    </section>
  );
}
