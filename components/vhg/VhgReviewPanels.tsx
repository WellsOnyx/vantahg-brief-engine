import { VhgScoreCard } from '@/components/vhg/VhgScoreCard';
import type { MedReviewPanel } from '@/lib/vhg/types';

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

        <VhgScoreCard score={panel.score} />
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
