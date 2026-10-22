"use client";

import { Outcome, formatUSD } from "@/lib/model";

/**
 * Current vs. Redesigned program cost.
 *  - Current bar: solid navy = today's program cost.
 *  - Redesigned bar: navy base (retained operating cost) + gold cap
 *    (rewards reinvested back into people). The space above it, up to the
 *    dashed "current" line, is the cost reduction that gets banked.
 */
export function OutcomesChart({ outcome }: { outcome: Outcome }) {
  const W = 520;
  const H = 300;
  const padX = 46;
  const padTop = 24;
  const padBottom = 46;
  const plotH = H - padTop - padBottom;

  const max = Math.max(outcome.currentCost, 1);
  const scale = (v: number) => (v / max) * plotH;
  const yOf = (v: number) => padTop + plotH - scale(v);

  const barW = 116;
  const gap = 96;
  const groupW = barW * 2 + gap;
  const x0 = (W - groupW) / 2;
  const x1 = x0 + barW + gap;

  const retained = outcome.currentCost - outcome.totalSavings;
  const reinvest = outcome.rewardsReinvestment;

  const retainedH = scale(retained);
  const reinvestH = scale(reinvest);
  const redesignedTop = yOf(retained + reinvest);
  const currentTop = yOf(outcome.currentCost);

  return (
    <div className="w-full">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full"
        role="img"
        aria-label="Current versus redesigned program cost"
      >
        {/* baseline */}
        <line
          x1={padX}
          x2={W - padX + 20}
          y1={padTop + plotH}
          y2={padTop + plotH}
          stroke="#dcd7cc"
          strokeWidth={1}
        />

        {/* dashed "current level" reference across to redesigned bar */}
        <line
          x1={x0}
          x2={x1 + barW}
          y1={currentTop}
          y2={currentTop}
          stroke="#b9862a"
          strokeWidth={1}
          strokeDasharray="3 4"
          opacity={0.6}
        />

        {/* Current bar */}
        <rect
          className="bar-grow"
          x={x0}
          y={currentTop}
          width={barW}
          height={scale(outcome.currentCost)}
          rx={5}
          fill="#183b6d"
        />
        <text
          x={x0 + barW / 2}
          y={padTop + plotH + 20}
          textAnchor="middle"
          className="fill-navy-900 font-sans text-[12px] font-600"
        >
          Current
        </text>
        <text
          x={x0 + barW / 2}
          y={currentTop - 9}
          textAnchor="middle"
          className="fill-navy-900 font-serif text-[13px] font-600"
        >
          {formatUSD(outcome.currentCost, { compact: true })}
        </text>

        {/* Redesigned bar — retained base */}
        <rect
          className="bar-grow"
          x={x1}
          y={yOf(retained)}
          width={barW}
          height={retainedH}
          rx={5}
          fill="#21497f"
        />
        {/* Redesigned bar — reinvestment cap */}
        <rect
          className="bar-grow"
          x={x1}
          y={redesignedTop}
          width={barW}
          height={reinvestH}
          rx={5}
          fill="#dba63f"
        />
        <text
          x={x1 + barW / 2}
          y={padTop + plotH + 20}
          textAnchor="middle"
          className="fill-navy-900 font-sans text-[12px] font-600"
        >
          Redesigned
        </text>
        <text
          x={x1 + barW / 2}
          y={redesignedTop - 9}
          textAnchor="middle"
          className="fill-navy-900 font-serif text-[13px] font-600"
        >
          {formatUSD(retained + reinvest, { compact: true })}
        </text>

        {/* Cost-reduction bracket between redesigned top and current line */}
        {outcome.costReduction > 0 && currentTop < redesignedTop - 6 && (
          <g>
            <line
              x1={x1 + barW + 10}
              x2={x1 + barW + 10}
              y1={currentTop}
              y2={redesignedTop}
              stroke="#4c8b7a"
              strokeWidth={1.25}
            />
            <line
              x1={x1 + barW + 6}
              x2={x1 + barW + 14}
              y1={currentTop}
              y2={currentTop}
              stroke="#4c8b7a"
              strokeWidth={1.25}
            />
            <line
              x1={x1 + barW + 6}
              x2={x1 + barW + 14}
              y1={redesignedTop}
              y2={redesignedTop}
              stroke="#4c8b7a"
              strokeWidth={1.25}
            />
          </g>
        )}
      </svg>

      <div className="mt-2 flex flex-wrap items-center justify-center gap-x-5 gap-y-1.5 text-[11.5px]">
        <Legend color="#21497f" label="Retained operating cost" />
        <Legend color="#dba63f" label="Rewards reinvestment" />
        <Legend color="#4c8b7a" label="Cost reduction (banked)" />
      </div>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5 text-ink/65">
      <span
        className="inline-block h-2.5 w-2.5 rounded-[3px]"
        style={{ background: color }}
      />
      {label}
    </span>
  );
}
