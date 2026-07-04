"use client";

import { useMemo, useRef, useState } from "react";
import {
  ADD_ONS,
  ASSUMPTIONS,
  CompanyProfile,
  DEFAULT_LEVERS,
  Levers,
  Outcome,
  PRESETS,
  PresetKey,
  SAMPLE_COMPANY,
  computeOutcome,
  formatNumber,
  formatPct,
  formatUSD,
} from "@/lib/model";
import { AddOnToggle, LeverSlider } from "./controls";
import { OutcomesChart } from "./OutcomesChart";
import { AnimatedUSD } from "./AnimatedNumber";

type SavedScenario = {
  id: number;
  name: string;
  company: CompanyProfile;
  levers: Levers;
  outcome: Outcome;
};

const FOOTER =
  "Illustrative modeling on sample data. Actual results depend on plan design, carrier terms, and workforce composition. Not a quote.";

export default function ScenarioStudio() {
  const [company, setCompany] = useState<CompanyProfile>(SAMPLE_COMPANY);
  const [levers, setLevers] = useState<Levers>(DEFAULT_LEVERS);
  const [saved, setSaved] = useState<SavedScenario[]>([]);
  const [activePreset, setActivePreset] = useState<PresetKey | null>(null);
  const [assumptionsOpen, setAssumptionsOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(true);
  const idRef = useRef(1);

  const outcome = useMemo(
    () => computeOutcome(company, levers),
    [company, levers],
  );

  function setLever<K extends keyof Levers>(key: K, value: Levers[K]) {
    setLevers((prev) => ({ ...prev, [key]: value }));
    setActivePreset(null);
  }

  function applyPreset(key: PresetKey) {
    setLevers(PRESETS[key].levers);
    setActivePreset(key);
  }

  function saveScenario() {
    setSaved((prev) => {
      const next = [
        ...prev,
        {
          id: idRef.current++,
          name: activePreset
            ? PRESETS[activePreset].label
            : `Scenario ${prev.length + 1}`,
          company,
          levers,
          outcome,
        },
      ];
      return next.slice(-3);
    });
  }

  function resetAll() {
    setCompany(SAMPLE_COMPANY);
    setLevers(DEFAULT_LEVERS);
    setActivePreset(null);
  }

  return (
    <div className="min-h-screen bg-parchment">
      {/* ---------------------------------------------------------------- Header */}
      <header className="border-b border-slate-line bg-navy text-white">
        <div className="mx-auto flex max-w-[1360px] items-center justify-between gap-4 px-6 py-4 lg:px-9">
          <div className="flex items-center gap-3.5">
            <Mark />
            <div>
              <div className="font-serif text-[19px] leading-none font-600 tracking-tight">
                VantaTR Scenario Studio
              </div>
              <div className="mt-1 text-[11.5px] uppercase tracking-[0.16em] text-white/55">
                Benefits Strategy Modeling
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2.5">
            <button
              onClick={() => setAssumptionsOpen(true)}
              className="rounded-full border border-white/20 px-3.5 py-1.5 text-[12px] font-500 text-white/85 transition-colors hover:border-gold hover:text-white"
            >
              Assumptions
            </button>
            <button
              onClick={resetAll}
              className="rounded-full px-3 py-1.5 text-[12px] font-500 text-white/60 transition-colors hover:text-white"
            >
              Reset
            </button>
          </div>
        </div>
      </header>

      {/* ------------------------------------------------------- Company profile */}
      <section className="border-b border-slate-line bg-white">
        <div className="mx-auto max-w-[1360px] px-6 py-3.5 lg:px-9">
          <button
            onClick={() => setProfileOpen((o) => !o)}
            className="flex items-center gap-2 text-[11px] font-600 uppercase tracking-[0.15em] text-navy-900/70 transition-colors hover:text-navy-900"
          >
            <span
              className={`transition-transform duration-200 ${profileOpen ? "rotate-90" : ""}`}
            >
              ›
            </span>
            Company Profile — {company.name}
          </button>
          {profileOpen && (
            <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
              <ProfileField
                label="Employees"
                value={company.employees}
                step={1000}
                min={1000}
                max={2_000_000}
                onChange={(v) => setCompany({ ...company, employees: v })}
                format={formatNumber}
              />
              <ProfileField
                label="Avg salary"
                value={company.avgSalary}
                step={1000}
                min={20_000}
                max={250_000}
                onChange={(v) => setCompany({ ...company, avgSalary: v })}
                format={(v) => formatUSD(v)}
              />
              <ProfileField
                label="Benefits spend / employee"
                value={company.spendPerEmployee}
                step={100}
                min={1000}
                max={40_000}
                onChange={(v) => setCompany({ ...company, spendPerEmployee: v })}
                format={(v) => formatUSD(v)}
              />
              <ProfileField
                label="Current participation"
                value={Math.round(company.participation * 100)}
                step={1}
                min={0}
                max={100}
                onChange={(v) =>
                  setCompany({ ...company, participation: v / 100 })
                }
                format={(v) => `${v}%`}
              />
            </div>
          )}
        </div>
      </section>

      {/* -------------------------------------------------------------- Main grid */}
      <main className="mx-auto grid max-w-[1360px] grid-cols-1 gap-5 px-6 py-6 lg:grid-cols-[300px_minmax(0,1fr)_290px] lg:px-9">
        {/* ---------------------------------------------------- LEFT — Levers */}
        <section className="lux-scroll rounded-2xl border border-slate-line bg-white p-5 lg:max-h-[calc(100vh-180px)] lg:overflow-y-auto lg:sticky lg:top-5">
          <ZoneLabel>Design Levers</ZoneLabel>
          <LeverSlider
            label="Pre-tax benefit participation"
            hint="Share of employees enrolled in pre-tax benefits."
            value={levers.participation}
            onChange={(v) => setLever("participation", v)}
            leftLabel="0%"
            rightLabel="100%"
          />
          <LeverSlider
            label="Tax-advantaged architecture"
            hint="Adoption of tax-advantaged plan architecture."
            value={levers.architecture}
            onChange={(v) => setLever("architecture", v)}
            leftLabel="None"
            rightLabel="Full"
          />
          <LeverSlider
            label="Plan mix"
            hint="Traditional fully-insured ↔ curated self-funded / level-funded."
            value={levers.planMix}
            onChange={(v) => setLever("planMix", v)}
            leftLabel="Traditional"
            rightLabel="Self-funded"
          />
          <LeverSlider
            label="Reinvestment rate"
            hint="Share of savings routed back into richer rewards vs. cost reduction."
            value={levers.reinvestment}
            onChange={(v) => setLever("reinvestment", v)}
            leftLabel="Cost cut"
            rightLabel="Reinvest"
          />

          <div className="mt-7 mb-3 h-px bg-slate-line" />
          <ZoneLabel>Optional Enrichments</ZoneLabel>
          <div className="flex flex-col gap-2.5">
            {ADD_ONS.map((a) => (
              <AddOnToggle
                key={a.key}
                label={a.label}
                blurb={a.blurb}
                cost={a.cost}
                checked={levers.addOns[a.key]}
                onChange={(v) =>
                  setLever("addOns", { ...levers.addOns, [a.key]: v })
                }
              />
            ))}
          </div>
        </section>

        {/* --------------------------------------------------- CENTER — Outcomes */}
        <section className="flex flex-col gap-5">
          {/* Headline */}
          <div className="relative overflow-hidden rounded-2xl border border-navy-700 bg-navy px-7 py-7 text-white shadow-[0_10px_40px_-18px_rgba(24,59,109,0.7)]">
            <div className="pointer-events-none absolute -right-16 -top-16 h-52 w-52 rounded-full bg-gold/10 blur-2xl" />
            <div className="text-[12px] font-600 uppercase tracking-[0.18em] text-gold-soft">
              Total Program Savings / Year
            </div>
            <AnimatedUSD
              value={outcome.totalSavings}
              className="mt-2 block font-serif text-[52px] leading-[1.02] font-700 tracking-tight tabular-nums sm:text-[62px]"
            />
            <div className="mt-2 text-[13px] text-white/65">
              {formatUSD(outcome.savingsPerEmployee)} per employee ·{" "}
              {formatNumber(Math.round(outcome.participants))} participants
            </div>
          </div>

          {/* Stat tiles */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <StatTile
              label="Employer payroll-tax savings"
              sub="7.65% FICA · illustrative"
              value={outcome.ficaSavings}
              accent="navy"
            />
            <StatTile
              label="Rewards reinvestment"
              sub="Routed back to people"
              value={outcome.rewardsReinvestment}
              accent="gold"
            />
            <StatTile
              label="Plan-mix savings"
              sub="Self / level-funded efficiency"
              value={outcome.planMixSavings}
              accent="sage"
            />
          </div>

          {/* Chart */}
          <div className="rounded-2xl border border-slate-line bg-white p-6">
            <div className="mb-1 flex items-baseline justify-between">
              <ZoneLabel>Live Outcomes</ZoneLabel>
              <span className="text-[11.5px] text-ink/50">
                Current vs. redesigned program
              </span>
            </div>
            <OutcomesChart outcome={outcome} />
            <div className="mt-4 grid grid-cols-2 gap-3 border-t border-slate-line pt-4 text-[12.5px] sm:grid-cols-4">
              <MiniStat
                label="Reinvestment"
                value={formatUSD(outcome.rewardsReinvestment, { compact: true })}
              />
              <MiniStat
                label="Cost reduction"
                value={formatUSD(outcome.costReduction, { compact: true })}
              />
              <MiniStat
                label="Enrichment cost"
                value={formatUSD(outcome.addOnCost, { compact: true })}
              />
              <MiniStat
                label="Net rewards budget"
                value={formatUSD(outcome.netRewardsBudget, { compact: true })}
                warn={outcome.netRewardsBudget < 0}
              />
            </div>
          </div>
        </section>

        {/* ---------------------------------------------------- RIGHT — Scenarios */}
        <section className="flex flex-col gap-4 lg:sticky lg:top-5 lg:self-start">
          <div className="rounded-2xl border border-slate-line bg-white p-5">
            <ZoneLabel>Scenarios</ZoneLabel>
            <div className="flex flex-col gap-2.5">
              {(Object.keys(PRESETS) as PresetKey[]).map((key) => (
                <button
                  key={key}
                  onClick={() => applyPreset(key)}
                  className={`rounded-xl border px-4 py-3 text-left transition-all duration-200 ${
                    activePreset === key
                      ? "border-navy bg-navy text-white shadow-[0_6px_20px_-10px_rgba(24,59,109,0.8)]"
                      : "border-slate-line bg-white hover:border-navy-600/50"
                  }`}
                >
                  <div
                    className={`font-serif text-[16px] font-600 ${activePreset === key ? "text-white" : "text-navy-900"}`}
                  >
                    {PRESETS[key].label}
                  </div>
                  <div
                    className={`mt-0.5 text-[11.5px] leading-snug ${activePreset === key ? "text-white/70" : "text-ink/55"}`}
                  >
                    {PRESETS[key].blurb}
                  </div>
                </button>
              ))}
            </div>
            <button
              onClick={saveScenario}
              disabled={saved.length >= 3}
              className="mt-4 w-full rounded-xl bg-gold py-2.5 text-[13px] font-600 text-navy-900 transition-all duration-200 hover:bg-gold-soft disabled:cursor-not-allowed disabled:bg-slate-line disabled:text-ink/40"
            >
              {saved.length >= 3
                ? "Comparison full (3 max)"
                : "＋ Save scenario"}
            </button>
          </div>

          {/* Saved comparison cards */}
          {saved.length > 0 && (
            <div className="flex flex-col gap-3">
              {saved.map((s) => (
                <div
                  key={s.id}
                  className="rise-in rounded-xl border border-slate-line bg-white p-4"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-serif text-[14px] font-600 text-navy-900">
                      {s.name}
                    </span>
                    <button
                      onClick={() =>
                        setSaved((prev) => prev.filter((x) => x.id !== s.id))
                      }
                      className="text-[15px] leading-none text-ink/35 transition-colors hover:text-navy-900"
                      aria-label="Remove scenario"
                    >
                      ×
                    </button>
                  </div>
                  <div className="mt-1.5 font-serif text-[22px] font-700 tabular-nums text-navy-900">
                    {formatUSD(s.outcome.totalSavings, { compact: true })}
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] text-ink/60">
                    <span>Reinvest {formatPct(s.levers.reinvestment)}</span>
                    <span>Arch {formatPct(s.levers.architecture)}</span>
                    <span>
                      Reinv{" "}
                      {formatUSD(s.outcome.rewardsReinvestment, {
                        compact: true,
                      })}
                    </span>
                    <span>
                      /emp {formatUSD(s.outcome.savingsPerEmployee)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>

      {/* --------------------------------------------------------------- Footer */}
      <footer className="border-t border-slate-line bg-white">
        <div className="mx-auto flex max-w-[1360px] flex-col gap-1.5 px-6 py-5 lg:flex-row lg:items-center lg:justify-between lg:px-9">
          <p className="max-w-3xl text-[11.5px] leading-relaxed text-ink/55">
            {FOOTER}
          </p>
          <button
            onClick={() => setAssumptionsOpen(true)}
            className="shrink-0 text-left text-[11.5px] font-600 text-navy-900/70 underline decoration-gold/60 underline-offset-2 transition-colors hover:text-navy-900"
          >
            View assumptions
          </button>
        </div>
      </footer>

      {assumptionsOpen && (
        <AssumptionsDrawer
          company={company}
          onClose={() => setAssumptionsOpen(false)}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------- sub-components

function ZoneLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-4 text-[11px] font-700 uppercase tracking-[0.16em] text-navy-900/70">
      {children}
    </div>
  );
}

function Mark() {
  return (
    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gold/15 ring-1 ring-gold/40">
      <span className="font-serif text-[17px] font-700 text-gold-soft">V</span>
    </div>
  );
}

function ProfileField({
  label,
  value,
  onChange,
  step,
  min,
  max,
  format,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  step: number;
  min: number;
  max: number;
  format: (v: number) => string;
}) {
  const [editing, setEditing] = useState(false);
  const clamp = (v: number) => Math.min(max, Math.max(min, v));
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-ink/50">
        {label}
      </div>
      {editing ? (
        <input
          type="number"
          autoFocus
          defaultValue={value}
          step={step}
          min={min}
          max={max}
          onBlur={(e) => {
            const v = Number(e.target.value);
            if (!Number.isNaN(v)) onChange(clamp(v));
            setEditing(false);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          }}
          className="mt-1 w-full rounded-md border border-navy-600/40 bg-white px-2 py-1 font-serif text-[18px] font-600 text-navy-900 outline-none focus:border-gold"
        />
      ) : (
        <button
          onClick={() => setEditing(true)}
          className="mt-0.5 flex items-center gap-1.5 font-serif text-[19px] font-600 text-navy-900 transition-colors hover:text-gold-deep"
        >
          {format(value)}
          <span className="text-[11px] text-ink/30">✎</span>
        </button>
      )}
    </div>
  );
}

function StatTile({
  label,
  sub,
  value,
  accent,
}: {
  label: string;
  sub: string;
  value: number;
  accent: "navy" | "gold" | "sage";
}) {
  const bar =
    accent === "gold"
      ? "bg-gold"
      : accent === "sage"
        ? "bg-sage"
        : "bg-navy-700";
  return (
    <div className="relative overflow-hidden rounded-2xl border border-slate-line bg-white p-5">
      <span className={`absolute left-0 top-0 h-full w-1 ${bar}`} />
      <div className="text-[12px] font-600 text-navy-900/80">{label}</div>
      <div className="mt-0.5 text-[11px] text-ink/50">{sub}</div>
      <AnimatedUSD
        value={value}
        compact
        className="mt-2.5 block font-serif text-[27px] font-700 tabular-nums text-navy-900"
      />
    </div>
  );
}

function MiniStat({
  label,
  value,
  warn,
}: {
  label: string;
  value: string;
  warn?: boolean;
}) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-ink/45">
        {label}
      </div>
      <div
        className={`mt-0.5 font-serif text-[17px] font-600 tabular-nums ${warn ? "text-gold-deep" : "text-navy-900"}`}
      >
        {value}
      </div>
    </div>
  );
}

function AssumptionsDrawer({
  company,
  onClose,
}: {
  company: CompanyProfile;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-navy-900/40 backdrop-blur-[2px]"
      onClick={onClose}
    >
      <div
        className="drawer-in flex h-full w-full max-w-md flex-col overflow-y-auto bg-parchment shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-line bg-white px-6 py-4">
          <h2 className="font-serif text-[20px] font-700 text-navy-900">
            Model Assumptions
          </h2>
          <button
            onClick={onClose}
            className="text-[22px] leading-none text-ink/40 transition-colors hover:text-navy-900"
            aria-label="Close"
          >
            ×
          </button>
        </div>
        <div className="flex flex-col gap-5 px-6 py-6 text-[13px] leading-relaxed text-ink/80">
          <p className="text-ink/60">
            Every figure in the studio is illustrative and computed live from
            the levers below. Nothing here is a quote or a projection of your
            actual program.
          </p>

          <AssumptionRow
            title="Employer payroll-tax rate"
            value={`${(ASSUMPTIONS.employerFicaRate * 100).toFixed(2)}%`}
            note="Standard employer FICA share (6.2% Social Security + 1.45% Medicare) applied to redirected pre-tax dollars."
          />
          <AssumptionRow
            title="Pre-tax redirection per participant"
            value={`${formatUSD(ASSUMPTIONS.redirectionPerParticipantAtFullAdoption)} / yr`}
            note="Average pre-tax dollars redirected per participant at full tax-advantaged architecture adoption. Scales linearly with the architecture lever."
          />
          <AssumptionRow
            title="Self / level-funded efficiency"
            value={formatPct(ASSUMPTIONS.selfFundedEfficiency)}
            note="Net efficiency of curated self-funded / level-funded plans vs. fully-insured, applied to the self-funded share of benefits spend."
          />
          <AssumptionRow
            title="Enrichment costs (per participant / yr)"
            value=""
            note={`Mental health ${formatUSD(ASSUMPTIONS.addOnCostPerParticipant.mentalHealth)} · Family building ${formatUSD(ASSUMPTIONS.addOnCostPerParticipant.familyBuilding)} · Student loan ${formatUSD(ASSUMPTIONS.addOnCostPerParticipant.studentLoan)}.`}
          />

          <div className="rounded-xl border border-slate-line bg-white p-4">
            <div className="mb-2 text-[11px] font-700 uppercase tracking-[0.14em] text-navy-900/70">
              How the math flows
            </div>
            <ol className="ml-4 list-decimal space-y-1.5 text-[12.5px] text-ink/70">
              <li>Participants = employees × participation rate.</li>
              <li>Current cost = participants × spend per employee.</li>
              <li>
                Redirected pre-tax = participants × redirection × architecture.
              </li>
              <li>FICA savings = redirected × 7.65%.</li>
              <li>
                Plan-mix savings = current cost × plan mix × self-funded
                efficiency.
              </li>
              <li>Total savings = FICA + plan-mix savings.</li>
              <li>
                Reinvestment rate splits total savings between richer rewards
                and cost reduction.
              </li>
            </ol>
          </div>

          <div className="rounded-xl border border-slate-line bg-white p-4">
            <div className="mb-2 text-[11px] font-700 uppercase tracking-[0.14em] text-navy-900/70">
              Sample company — {company.name}
            </div>
            <div className="grid grid-cols-2 gap-y-1.5 text-[12.5px] text-ink/70">
              <span>Employees</span>
              <span className="text-right tabular-nums">
                {formatNumber(company.employees)}
              </span>
              <span>Avg salary</span>
              <span className="text-right tabular-nums">
                {formatUSD(company.avgSalary)}
              </span>
              <span>Benefits spend / employee</span>
              <span className="text-right tabular-nums">
                {formatUSD(company.spendPerEmployee)}
              </span>
              <span>Current participation</span>
              <span className="text-right tabular-nums">
                {formatPct(company.participation)}
              </span>
            </div>
          </div>

          <p className="text-[11.5px] leading-relaxed text-ink/50">
            {FOOTER}
          </p>
        </div>
      </div>
    </div>
  );
}

function AssumptionRow({
  title,
  value,
  note,
}: {
  title: string;
  value: string;
  note: string;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[13px] font-600 text-navy-900">{title}</span>
        {value && (
          <span className="font-serif text-[15px] font-600 tabular-nums text-gold-deep">
            {value}
          </span>
        )}
      </div>
      <p className="mt-0.5 text-[12px] text-ink/60">{note}</p>
    </div>
  );
}
