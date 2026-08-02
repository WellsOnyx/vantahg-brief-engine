"use client";

import {
  ADD_ONS,
  ASSUMPTIONS,
  CompanyProfile,
  Levers,
  Outcome,
  Projection,
  formatNumber,
  formatPct,
  formatUSD,
} from "@/lib/model";

const FOOTER =
  "Illustrative modeling on sample data. Actual results depend on plan design, carrier terms, and workforce composition. Not a quote.";

/**
 * A single-page, print-optimized summary of the current scenario — the
 * leave-behind. Hidden on screen (`print-sheet` is display:none until an
 * @media print block flips it on in globals.css), so it never disturbs the
 * interactive studio; it only exists when the page is printed / saved to PDF.
 *
 * The illustrative footer is repeated prominently here: a printed page travels
 * on its own, detached from the on-screen guardrails, so the honesty standard
 * has to travel with it.
 */
export function PrintSheet({
  company,
  levers,
  outcome,
  projection,
  horizon,
  generatedAt,
}: {
  company: CompanyProfile;
  levers: Levers;
  outcome: Outcome;
  projection: Projection;
  horizon: number;
  generatedAt: string;
}) {
  const enrichments = ADD_ONS.filter((a) => levers.addOns[a.key]);

  return (
    <div className="print-sheet">
      <div className="ps-page">
        {/* Header */}
        <header className="ps-header">
          <div className="ps-brand">
            <span className="ps-mark">V</span>
            <div>
              <div className="ps-title">VantaTR Scenario Studio</div>
              <div className="ps-eyebrow">Design · Deliver · Compound</div>
            </div>
          </div>
          <div className="ps-meta">
            <div className="ps-meta-label">Benefits Strategy One-Pager</div>
            {generatedAt && <div className="ps-meta-date">Prepared {generatedAt}</div>}
          </div>
        </header>

        {/* Headline */}
        <section className="ps-headline">
          <div className="ps-headline-label">
            {horizon === 1
              ? "Total Program Savings / Year"
              : `${horizon}-Year Cumulative Savings`}
          </div>
          <div className="ps-headline-value">
            {formatUSD(
              horizon === 1 ? outcome.totalSavings : projection.cumulativeSavings,
            )}
          </div>
          <div className="ps-headline-sub">
            {formatUSD(outcome.savingsPerEmployee)} per employee ·{" "}
            {formatNumber(Math.round(outcome.participants))} participants
            {horizon > 1 &&
              ` · ${formatUSD(outcome.totalSavings, { compact: true })} in year one, compounding at ${formatPct(ASSUMPTIONS.annualCostTrend)}/yr`}
          </div>
        </section>

        {/* Two-column body: profile + levers | outcome breakdown */}
        <div className="ps-grid">
          <section className="ps-card">
            <div className="ps-card-title">Company Profile — {company.name}</div>
            <dl className="ps-rows">
              <Row label="Employees" value={formatNumber(company.employees)} />
              <Row label="Avg salary" value={formatUSD(company.avgSalary)} />
              <Row
                label="Benefits spend / employee"
                value={formatUSD(company.spendPerEmployee)}
              />
              <Row
                label="Current participation"
                value={formatPct(company.participation)}
              />
            </dl>

            <div className="ps-card-title ps-mt">Design Levers</div>
            <dl className="ps-rows">
              <Row
                label="Pre-tax participation"
                value={formatPct(levers.participation)}
              />
              <Row
                label="Tax-advantaged architecture"
                value={formatPct(levers.architecture)}
              />
              <Row label="Plan mix (self-funded)" value={formatPct(levers.planMix)} />
              <Row label="Reinvestment rate" value={formatPct(levers.reinvestment)} />
              <Row
                label="Enrichments"
                value={
                  enrichments.length
                    ? enrichments.map((e) => e.label).join(", ")
                    : "None"
                }
              />
            </dl>
          </section>

          <section className="ps-card">
            <div className="ps-card-title">Outcome Breakdown (Year One)</div>
            <dl className="ps-rows">
              <Row
                label="Employer payroll-tax savings"
                value={formatUSD(outcome.ficaSavings)}
              />
              <Row
                label="Plan-mix savings"
                value={formatUSD(outcome.planMixSavings)}
              />
              <Row
                label="Total savings"
                value={formatUSD(outcome.totalSavings)}
                strong
              />
              <Row
                label="Rewards reinvestment"
                value={formatUSD(outcome.rewardsReinvestment)}
              />
              <Row
                label="Cost reduction (banked)"
                value={formatUSD(outcome.costReduction)}
              />
              <Row label="Enrichment cost" value={formatUSD(outcome.addOnCost)} />
              <Row
                label="Net rewards budget"
                value={formatUSD(outcome.netRewardsBudget)}
              />
              <Row
                label="Redesigned net program cost"
                value={formatUSD(outcome.redesignedNetCost)}
                strong
              />
            </dl>
          </section>
        </div>

        {/* Multi-year table */}
        {horizon > 1 && (
          <section className="ps-card ps-mt-sm">
            <div className="ps-card-title">
              {horizon}-Year Outlook — savings compounding at{" "}
              {formatPct(ASSUMPTIONS.annualCostTrend)}/yr
            </div>
            <table className="ps-table">
              <thead>
                <tr>
                  <th>Year</th>
                  <th>Annual savings</th>
                  <th>Reinvestment</th>
                  <th>Cumulative</th>
                </tr>
              </thead>
              <tbody>
                {projection.perYear.map((y) => (
                  <tr key={y.year}>
                    <td>Year {y.year}</td>
                    <td>{formatUSD(y.savings)}</td>
                    <td>{formatUSD(y.reinvestment)}</td>
                    <td className="ps-strong">{formatUSD(y.cumulativeSavings)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        {/* Assumptions */}
        <section className="ps-assumptions">
          <div className="ps-card-title">Model Assumptions</div>
          <div className="ps-assumption-grid">
            <span>
              Employer payroll-tax rate{" "}
              <strong>{(ASSUMPTIONS.employerFicaRate * 100).toFixed(2)}%</strong>
            </span>
            <span>
              Pre-tax redirection / participant{" "}
              <strong>
                {formatUSD(ASSUMPTIONS.redirectionPerParticipantAtFullAdoption)}/yr
              </strong>
            </span>
            <span>
              Self / level-funded efficiency{" "}
              <strong>{formatPct(ASSUMPTIONS.selfFundedEfficiency)}</strong>
            </span>
            <span>
              Annual cost trend{" "}
              <strong>{formatPct(ASSUMPTIONS.annualCostTrend)}/yr</strong>
            </span>
          </div>
        </section>

        {/* Prominent honesty footer */}
        <footer className="ps-footer">{FOOTER}</footer>
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  strong,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div className={`ps-row ${strong ? "ps-row-strong" : ""}`}>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
