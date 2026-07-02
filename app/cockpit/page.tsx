'use client';

import { useMemo, useState } from 'react';
import {
  getPodDay,
  GAUNTLET,
  casesForStop,
  type GauntletStop,
  type PodDay,
} from '@/lib/cockpit/pod-day';
import {
  Stage,
  Panel,
  GauntletNav,
  StatTile,
  LaborBar,
  PurityGauge,
  CountdownRing,
  CelebrationBurst,
  ConfidencePill,
  Row,
} from '@/components/cockpit/primitives';

const NARRATION: Record<GauntletStop, string> = {
  cx: 'A concierge takes an incomplete fax and makes the file whole — the engine drafts, the human closes the gaps.',
  arbiter: 'A certifying arbiter verifies reviewer independence and certifies the brief is defensible.',
  physician: 'A physician clears a certified batch in one motion — SLA countdown, then determinations land.',
  dl_md: 'The Delivery Lead sees the whole pod day as purity telemetry: labor, confidence, independence, SLA.',
};

export default function CockpitPage() {
  const day = useMemo(() => getPodDay(), []);
  const [active, setActive] = useState<GauntletStop>('cx');

  return (
    <Stage>
      <div className="mx-auto max-w-6xl px-5 py-8 md:px-8">
        {/* Command header */}
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-gold/80">VantaUM · Command Cockpit</div>
            <h1 className="font-display text-3xl leading-tight text-white md:text-4xl">The Pod Day Gauntlet</h1>
            <div className="mt-1 text-sm text-white/55">
              {day.date_label} · {day.pod}
            </div>
          </div>
          <div className="flex gap-3">
            <StatTile label="Cases today" value={day.telemetry.cases} tone="white" />
            <StatTile label="Avg engine-labor" value={day.telemetry.avg_labor_reduction_pct} suffix="%" tone="gold" />
          </div>
        </div>

        {/* Gauntlet stepper */}
        <div className="mb-4">
          <GauntletNav stops={GAUNTLET} active={active} onSelect={setActive} />
        </div>

        {/* Narration caption for the screen-share */}
        <p className="mb-6 max-w-3xl text-sm text-white/60">{NARRATION[active]}</p>

        {/* Active stop */}
        {active === 'cx' && <CxMakeWhole day={day} />}
        {active === 'arbiter' && <ArbiterCertify day={day} />}
        {active === 'physician' && <PhysicianBatchClear day={day} />}
        {active === 'dl_md' && <DlMdPurity day={day} />}
      </div>
    </Stage>
  );
}

/* ── Stop 1: CX makes the file whole ─────────────────────────────────────────── */
function CxMakeWhole({ day }: { day: PodDay }) {
  const cases = casesForStop(day, 'cx');
  const [remaining, setRemaining] = useState<Record<string, string[]>>(
    () => Object.fromEntries(cases.map((c) => [c.id, [...c.missing]])),
  );
  const resolve = (id: string, item: string) =>
    setRemaining((r) => ({ ...r, [id]: r[id].filter((x) => x !== item) }));

  return (
    <div className="grid gap-5 md:grid-cols-2">
      {cases.map((c) => {
        const left = remaining[c.id] ?? [];
        const whole = left.length === 0;
        return (
          <Panel key={c.id} eyebrow={c.case_number} title={c.procedure} right={<ConfidencePill value={whole ? 92 : c.directional_confidence} resolved={whole} />}>
            <div className="mb-4 text-sm text-white/60">
              Patient {c.patient} · handled by <span className="text-white/85">{day.cx.name}</span>
            </div>

            {whole ? (
              <div className="scale-in rounded-xl border border-emerald-400/30 bg-emerald-400/10 p-4">
                <div className="flex items-center gap-2 font-display text-lg text-emerald-300">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-400 text-navy">✓</span>
                  File is whole — complete evidentiary brief
                </div>
                <div className="mt-4">
                  <LaborBar labor={c.labor} />
                </div>
              </div>
            ) : (
              <div className="space-y-2.5">
                <div className="text-xs font-semibold uppercase tracking-wider text-white/45">Gaps to close ({left.length})</div>
                {left.map((item) => (
                  <Row key={item}>
                    <span className="text-sm text-white/80">{item}</span>
                    <button
                      onClick={() => resolve(c.id, item)}
                      className="rounded-lg bg-gold px-3 py-1.5 text-xs font-semibold text-navy transition hover:bg-gold-light"
                    >
                      Resolve
                    </button>
                  </Row>
                ))}
                <div className="pt-1 text-[11px] text-white/40">Engine drafted the brief; the concierge closes the human gaps.</div>
              </div>
            )}
          </Panel>
        );
      })}
    </div>
  );
}

/* ── Stop 2: Arbiter certifies ───────────────────────────────────────────────── */
function ArbiterCertify({ day }: { day: PodDay }) {
  const cases = casesForStop(day, 'arbiter');
  const [certified, setCertified] = useState<Set<string>>(new Set());
  const toggle = (id: string) => setCertified((s) => new Set(s).add(id));

  return (
    <div className="grid gap-5 md:grid-cols-2">
      {cases.map((c) => {
        const isCert = certified.has(c.id);
        return (
          <Panel key={c.id} eyebrow={`${c.case_number} · ${c.stream.toUpperCase()}`} title={c.procedure} right={<ConfidencePill value={c.directional_confidence} resolved={c.confidence_resolved} />}>
            <div className="mb-4 space-y-2">
              <Row>
                <span className="text-sm text-white/70">Reviewer independence</span>
                <span className="text-sm font-semibold text-emerald-300">✓ independent (central wall)</span>
              </Row>
              <Row>
                <span className="text-sm text-white/70">Evidentiary brief</span>
                <span className="text-sm font-semibold text-emerald-300">complete</span>
              </Row>
              <Row>
                <span className="text-sm text-white/70">Engine recommendation</span>
                <span className="text-sm font-semibold text-white/90 capitalize">{c.recommendation}</span>
              </Row>
            </div>

            {isCert ? (
              <div className="scale-in flex items-center justify-between rounded-xl border border-gold/40 bg-gold/10 p-4">
                <div className="font-display text-lg text-gold">Certified by {day.arbiter.name}</div>
                <div className="flex h-10 w-10 rotate-6 items-center justify-center rounded-full border-2 border-gold text-gold">✓</div>
              </div>
            ) : (
              <button
                onClick={() => toggle(c.id)}
                className="w-full rounded-xl bg-gold py-3 font-semibold text-navy transition hover:bg-gold-light"
              >
                Certify file
              </button>
            )}
          </Panel>
        );
      })}
    </div>
  );
}

/* ── Stop 3: Physician clears the batch (countdown + celebration) ────────────── */
function PhysicianBatchClear({ day }: { day: PodDay }) {
  const cases = casesForStop(day, 'physician');
  const [running, setRunning] = useState(false);
  const [cleared, setCleared] = useState(false);
  const [celebrate, setCelebrate] = useState(false);

  const onComplete = () => {
    setCleared(true);
    setCelebrate(true);
    setRunning(false);
    setTimeout(() => setCelebrate(false), 2600);
  };

  return (
    <Panel
      eyebrow={`${day.physician.name} · ${cases.length}-case batch`}
      title="Clear the batch"
      right={
        <button
          disabled={running || cleared}
          onClick={() => setRunning(true)}
          className="rounded-xl bg-gold px-5 py-2.5 font-semibold text-navy transition hover:bg-gold-light disabled:opacity-40"
        >
          {cleared ? 'Batch cleared' : running ? 'Clearing…' : 'Clear batch'}
        </button>
      }
      className="relative"
    >
      <CelebrationBurst show={celebrate} label={`${cases.length} determinations cleared`} />

      <div className="mb-5 flex items-center gap-6">
        <CountdownRing seconds={5} running={running} onComplete={onComplete} />
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-white/45">Tightest SLA in batch</div>
          <div className="font-display text-2xl text-white">{Math.min(...cases.map((c) => c.sla_minutes_remaining))} min</div>
          <div className="text-xs text-white/50">One motion clears all {cases.length}. Every determination is the physician's — never the engine's.</div>
        </div>
      </div>

      <div className="grid gap-2.5 sm:grid-cols-2">
        {cases.map((c) => (
          <div
            key={c.id}
            className={`flex items-center justify-between rounded-lg border px-4 py-3 transition-all duration-500
              ${cleared ? 'border-emerald-400/30 bg-emerald-400/10' : 'border-white/10 bg-navy-light/30'}`}
          >
            <div className="min-w-0">
              <div className="truncate text-sm font-medium text-white/90">{c.procedure}</div>
              <div className="text-[11px] text-white/45">{c.case_number} · {c.patient}</div>
            </div>
            <div className="flex items-center gap-2">
              <ConfidencePill value={c.directional_confidence} resolved={c.confidence_resolved} />
              {cleared && <span className="text-emerald-300">✓</span>}
            </div>
          </div>
        ))}
      </div>
    </Panel>
  );
}

/* ── Stop 4: DL-MD purity telemetry ──────────────────────────────────────────── */
function DlMdPurity({ day }: { day: PodDay }) {
  const t = day.telemetry;
  return (
    <div className="space-y-5">
      <Panel eyebrow={`${day.delivery_lead.name} · Delivery Lead / MD`} title="Purity telemetry — full pod day">
        <div className="grid grid-cols-2 gap-6 sm:grid-cols-4">
          <div className="flex justify-center"><PurityGauge value={t.avg_labor_reduction_pct} label="Engine-labor" tone="gold" /></div>
          <div className="flex justify-center"><PurityGauge value={t.confidence_resolution_rate} label="Confidence-resolved" tone="emerald" /></div>
          <div className="flex justify-center"><PurityGauge value={t.independence_purity_pct} label="Independence purity" tone="emerald" /></div>
          <div className="flex justify-center"><PurityGauge value={t.sla_purity_pct} label="SLA purity" tone="sky" /></div>
        </div>
      </Panel>

      <div className="grid gap-5 md:grid-cols-[1.2fr_1fr]">
        <Panel eyebrow="Book of the day" title="Every case, every stream">
          <div className="space-y-2">
            {day.cases.map((c) => (
              <div key={c.id} className="flex items-center justify-between rounded-lg border border-white/8 bg-navy-light/30 px-4 py-2.5">
                <div className="min-w-0">
                  <div className="truncate text-sm text-white/85">{c.procedure}</div>
                  <div className="text-[11px] text-white/40">{c.case_number} · {c.stream.toUpperCase()}</div>
                </div>
                <div className="w-40 flex-shrink-0">
                  <LaborBar labor={c.labor} compact />
                </div>
              </div>
            ))}
          </div>
        </Panel>

        <div className="space-y-4">
          <StatTile label="Engine labor units" value={t.engine_lu} tone="gold" hint={`vs ${t.human_lu} human LU across the pod`} />
          <StatTile label="Confidence-resolution" value={t.confidence_resolution_rate} suffix="%" tone="emerald" hint="≥85% directional + complete brief" />
          <div className="rounded-xl border border-gold/20 bg-gold/5 p-4 text-sm text-white/70">
            <span className="font-display text-lg text-gold">Humans made superhuman.</span> Every determination stayed with a
            credentialed human; the engine carried {t.avg_labor_reduction_pct}% of the labor.
            <div className="mt-2 text-[11px] text-white/40">Estimated weights, pending onsite calibration.</div>
          </div>
        </div>
      </div>
    </div>
  );
}
