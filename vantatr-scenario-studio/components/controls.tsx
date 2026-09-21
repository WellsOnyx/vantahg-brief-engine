"use client";

import { formatPct } from "@/lib/model";

export function LeverSlider({
  label,
  hint,
  value,
  onChange,
  leftLabel,
  rightLabel,
  display,
}: {
  label: string;
  hint?: string;
  value: number; // 0–1
  onChange: (v: number) => void;
  leftLabel?: string;
  rightLabel?: string;
  display?: string;
}) {
  const pct = Math.round(value * 100);
  return (
    <div className="mb-6">
      <div className="flex items-baseline justify-between gap-3">
        <label className="font-sans text-[13px] font-600 tracking-tight text-navy-900">
          {label}
        </label>
        <span className="font-serif text-[15px] font-600 tabular-nums text-gold-deep">
          {display ?? formatPct(value)}
        </span>
      </div>
      {hint ? (
        <p className="mt-0.5 mb-2 text-[11.5px] leading-snug text-ink/55">
          {hint}
        </p>
      ) : (
        <div className="mb-2" />
      )}
      <input
        type="range"
        min={0}
        max={100}
        value={pct}
        onChange={(e) => onChange(Number(e.target.value) / 100)}
        style={{ ["--_fill" as string]: `${pct}%` }}
        aria-label={label}
      />
      {(leftLabel || rightLabel) && (
        <div className="mt-1 flex justify-between text-[10.5px] uppercase tracking-wide text-ink/40">
          <span>{leftLabel}</span>
          <span>{rightLabel}</span>
        </div>
      )}
    </div>
  );
}

export function AddOnToggle({
  label,
  blurb,
  cost,
  checked,
  onChange,
}: {
  label: string;
  blurb: string;
  cost: number;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`group flex w-full items-center justify-between gap-3 rounded-xl border px-3.5 py-3 text-left transition-all duration-200 ${
        checked
          ? "border-gold/70 bg-gold/10 shadow-[0_1px_0_rgba(219,166,63,0.25)]"
          : "border-slate-line bg-white hover:border-navy-600/40"
      }`}
      aria-pressed={checked}
    >
      <span className="min-w-0">
        <span className="block text-[13px] font-600 text-navy-900">
          {label}
        </span>
        <span className="block truncate text-[11px] text-ink/55">{blurb}</span>
      </span>
      <span className="flex shrink-0 items-center gap-2.5">
        <span className="text-[11px] tabular-nums text-ink/50">
          +${cost}/pp
        </span>
        <span
          className={`relative h-[22px] w-[38px] rounded-full transition-colors duration-200 ${
            checked ? "bg-navy" : "bg-slate-line"
          }`}
        >
          <span
            className={`absolute top-[3px] h-4 w-4 rounded-full bg-white shadow-sm transition-all duration-200 ${
              checked ? "left-[19px]" : "left-[3px]"
            }`}
          />
        </span>
      </span>
    </button>
  );
}
