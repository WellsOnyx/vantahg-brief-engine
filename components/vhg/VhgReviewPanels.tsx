import type { MedReviewPanel } from '@/lib/vhg/types';

function bandClass(band: string): string {
  if (band === 'high') return 'bg-rose-100 text-rose-800';
  if (band === 'medium') return 'bg-amber-100 text-amber-900';
  return 'bg-emerald-100 text-emerald-800';
}

function money(value: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value);
}

export function VhgReviewPanels({ panel }: { panel: MedReviewPanel }) {
  return (
    <div className="space-y-4">
      {panel.illustrative && panel.illustrative_note && (
        <p className="text-sm text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          {panel.illustrative_note}
        </p>
      )}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <section className="rounded-xl border border-border bg-white p-5">
          <p className="text-[11px] uppercase tracking-[0.16em] text-muted font-semibold">Criteria</p>
          <h2 className="text-lg font-semibold text-navy mt-1">criteria result (demo)</h2>
          <p className="text-xs text-muted mt-2">{panel.criteria.source_note}</p>
          <p className="mt-4 text-sm font-medium text-navy">{panel.criteria.headline}</p>
          <p className="mt-2 text-xs uppercase tracking-wider text-muted">Result: {panel.criteria.result}</p>
          <ul className="mt-3 space-y-2">
            {panel.criteria.items.map((item) => (
              <li key={item.text} className="text-sm flex gap-2">
                <span className="text-xs uppercase tracking-wide text-muted w-24 shrink-0">{item.status.replaceAll('_', ' ')}</span>
                <span>{item.text}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="rounded-xl border border-gold/50 bg-white p-5" aria-label="VHG Score">
          <p className="text-[11px] uppercase tracking-[0.16em] text-gold-dark font-semibold">IDR likelihood · demo model</p>
          <h2 className="text-lg font-semibold text-navy mt-1">
            VHG Score<sup className="text-xs ml-0.5">TM</sup>
          </h2>
          <div className="mt-4 flex items-end gap-3">
            <p className="font-[family-name:var(--font-display)] text-6xl text-navy leading-none">{panel.score.score}</p>
            <span className={`mb-1 text-xs font-semibold uppercase tracking-wider px-2 py-1 rounded-full ${bandClass(panel.score.band)}`}>
              {panel.score.band}
            </span>
          </div>
          <p className="text-xs text-muted mt-2">0–100 likelihood this synthetic case later becomes an IDR dispute.</p>
          <p className="text-sm text-navy mt-4 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">{panel.score.advisory}</p>
          <p className="text-[11px] uppercase tracking-wider text-muted mt-4">Top drivers</p>
          <ol className="mt-2 space-y-2">
            {panel.score.drivers.slice(0, 5).map((driver) => (
              <li key={driver.key} className="text-sm">
                <div className="flex justify-between gap-3">
                  <span className="font-medium text-navy">{driver.label}</span>
                  <span className={driver.points > 0 ? 'text-rose-700' : 'text-emerald-700'}>
                    {driver.points > 0 ? '+' : ''}
                    {driver.points}
                  </span>
                </div>
                <p className="text-xs text-muted">{driver.detail}</p>
              </li>
            ))}
          </ol>
          <p className="text-[11px] text-muted mt-4">
            {panel.score.model_id} · {panel.score.model_status.replaceAll('_', ' ')} · not a validated predictor
          </p>
        </section>
      </div>

      <section className="rounded-xl border border-border bg-white p-5">
        <p className="text-[11px] uppercase tracking-[0.16em] text-muted font-semibold">Synthetic packet</p>
        <h2 className="text-lg font-semibold text-navy mt-1">{panel.case_number}</h2>
        <p className="text-sm text-muted mt-2">{panel.summary}</p>
        <dl className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          <div>
            <dt className="text-xs text-muted">Member token</dt>
            <dd>{panel.member_token}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Service month</dt>
            <dd>{panel.service_month}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Service line</dt>
            <dd>{panel.service_line}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">CPT</dt>
            <dd>{panel.cpt}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">State</dt>
            <dd>{panel.state}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Network</dt>
            <dd>{panel.network_status === 'out_of_network' ? 'Out of network' : 'In network'}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Facility</dt>
            <dd>{panel.facility_type.replaceAll('_', ' ')}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Billed / QPA</dt>
            <dd>
              {money(panel.billed_amount)} / {money(panel.qpa_amount)} ({panel.billed_to_qpa_ratio.toFixed(2)}×)
            </dd>
          </div>
        </dl>
      </section>
    </div>
  );
}
