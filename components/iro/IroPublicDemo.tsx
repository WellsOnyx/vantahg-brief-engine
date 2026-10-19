import Link from 'next/link';
import type { IroPublicDemo as IroPublicDemoModel } from '@/lib/iro/public-demo';

export function IroPublicDemo({ demo }: { demo: IroPublicDemoModel }) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="bg-navy text-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
          <p className="text-[11px] uppercase tracking-[0.18em] text-gold font-semibold">{demo.label}</p>
          <h1 className="font-[family-name:var(--font-display)] text-3xl sm:text-4xl mt-2">VantaHG IRO portal</h1>
          <p className="text-sm text-white/70 mt-3 max-w-2xl">{demo.disclaimer}</p>
          <p className="text-sm text-white/80 mt-4">
            Read-only. Case <span className="font-mono text-gold">{demo.case_id}</span>
            {' · '}
            {demo.state_name} {demo.pathway}
            {' · '}
            {demo.company} / {demo.line}
            {' · '}
            version {demo.version}
          </p>
          <div className="mt-4 flex flex-wrap gap-4 text-sm">
            <Link href="/portal/status" className="text-gold hover:text-gold-light">
              Authorization Status Portal
            </Link>
            <Link href="/stoploss" className="text-gold hover:text-gold-light">
              Stop-loss synthetic demo
            </Link>
          </div>
        </div>
      </header>

      <div className="bg-gold text-navy">
        <p className="max-w-6xl mx-auto px-4 sm:px-6 py-3 text-sm font-semibold">
          {demo.label}. Not a live IRO feed. No PHI. No sign-off on this page.
        </p>
      </div>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-8">
        <section className="bg-surface rounded-xl border border-border shadow-sm p-5 sm:p-6" aria-labelledby="iro-deadline">
          <h2 id="iro-deadline" className="font-[family-name:var(--font-display)] text-2xl text-navy">
            Ohio deadline
          </h2>
          <p className="text-sm text-muted mt-2">
            Clock starts at {demo.deadline.clock_label} ({demo.deadline.clock_at}). This case is {demo.pathway}. The shorter
            applicable clock wins. This result is preliminary.
          </p>
          <dl className="mt-4 grid sm:grid-cols-2 lg:grid-cols-3 gap-4 text-sm">
            <Fact term="Ohio standard" value={demo.deadline.ohio_standard} />
            <Fact term="Ohio expedited" value={demo.deadline.ohio_expedited} />
            <Fact term="URAC standard" value={demo.deadline.urac_standard} />
            <Fact term="Winner" value={demo.deadline.winner} />
            <Fact term="Due" value={demo.deadline.due_at} />
            <Fact term="Confirmed legal rule" value="No" />
          </dl>
          <p className="text-sm text-navy mt-4">{demo.deadline.missing_records}</p>
        </section>

        <section aria-labelledby="iro-stages">
          <h2 id="iro-stages" className="font-[family-name:var(--font-display)] text-2xl text-navy">
            Six stages
          </h2>
          <p className="text-sm text-muted mt-2 mb-4">{demo.outcome}</p>
          <ol className="space-y-4">
            {demo.stages.map((stage) => (
              <li key={stage.id} className="bg-surface rounded-xl border border-border shadow-sm overflow-hidden">
                <div className="px-5 py-4 sm:px-6 border-b border-border flex items-start gap-3">
                  <span className="mt-0.5 inline-flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-navy text-gold text-sm font-semibold">
                    {stage.number}
                  </span>
                  <div>
                    <h3 className="text-lg text-navy font-semibold">{stage.title}</h3>
                    <p className="text-sm text-muted mt-1">{stage.summary}</p>
                  </div>
                </div>
                <div className="px-5 py-4 sm:px-6 sm:pl-16 space-y-3">
                  <ul className="list-disc pl-4 text-sm text-foreground space-y-1">
                    {stage.points.map((point) => (
                      <li key={point}>{point}</li>
                    ))}
                  </ul>
                  {stage.stops.length > 0 ? (
                    <div>
                      <p className="text-[11px] uppercase tracking-[0.16em] text-gold-dark font-semibold">Hard STOP gates</p>
                      <ul className="mt-2 space-y-2">
                        {stage.stops.map((stop) => (
                          <li key={stop.code} className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm">
                            <span className="font-mono text-xs text-amber-800">{stop.code}</span>
                            <p className="text-amber-950 mt-1">{stop.detail}</p>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : (
                    <p className="text-sm text-muted">No hard STOP fired inside this stage on the synthetic case.</p>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section className="bg-surface rounded-xl border border-border shadow-sm overflow-hidden" aria-labelledby="iro-firewall">
          <div className="px-5 py-4 sm:px-6 border-b border-border">
            <h2 id="iro-firewall" className="font-[family-name:var(--font-display)] text-2xl text-navy">
              Line firewall
            </h2>
            <p className="text-sm text-muted mt-2">
              IDR and Medical Review stay off the IRO queue. A routed-out request is not this case’s record.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-navy/5 text-left text-navy">
                <tr>
                  <th className="px-5 py-3 font-semibold">Request</th>
                  <th className="px-5 py-3 font-semibold">IRO queue</th>
                  <th className="px-5 py-3 font-semibold">Routed to</th>
                  <th className="px-5 py-3 font-semibold">Result</th>
                </tr>
              </thead>
              <tbody>
                {demo.firewall.map((row) => (
                  <tr key={row.request} className="border-t border-border">
                    <td className="px-5 py-3 font-medium">{row.request}</td>
                    <td className="px-5 py-3">{row.on_iro_queue ? 'Stays' : 'Routed out'}</td>
                    <td className="px-5 py-3">{row.target}</td>
                    <td className="px-5 py-3 text-muted">{row.detail}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-xl border border-border bg-navy/5 px-5 py-4 sm:px-6">
          <h2 className="text-sm font-semibold text-navy">After close</h2>
          <p className="text-sm text-foreground mt-2">{demo.billing_note}</p>
          <p className="text-xs text-muted mt-3">
            {demo.closed ? 'Closed.' : 'Open.'} Billing posted: {demo.billing_posted ? 'yes' : 'no'}. Billing closes the
            case: no. {demo.label}.
          </p>
        </section>
      </main>
    </div>
  );
}

function Fact({ term, value }: { term: string; value: string }) {
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-[0.14em] text-muted font-semibold">{term}</dt>
      <dd className="mt-1 text-navy font-medium">{value}</dd>
    </div>
  );
}
