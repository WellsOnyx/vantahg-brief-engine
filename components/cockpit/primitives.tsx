'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { GauntletStop } from '@/lib/cockpit/pod-day';
import type { LaborMetricResult } from '@/lib/labor-metric';

/* Command-deck surface + panels ------------------------------------------------ */

export function Stage({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`min-h-screen bg-navy-dark text-white ${className}`}
      style={{
        backgroundImage:
          'radial-gradient(1100px 480px at 50% -8%, rgba(201,162,39,0.14), transparent 70%), radial-gradient(800px 400px at 100% 0%, rgba(26,58,92,0.6), transparent 60%)',
      }}
    >
      {children}
    </div>
  );
}

export function Panel({
  children,
  eyebrow,
  title,
  right,
  className = '',
}: {
  children: ReactNode;
  eyebrow?: string;
  title?: string;
  right?: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`slide-up rounded-2xl border border-gold/15 bg-navy-light/40 p-6 shadow-xl shadow-black/30 backdrop-blur-sm ${className}`}
    >
      {(eyebrow || title || right) && (
        <header className="mb-5 flex items-start justify-between gap-4">
          <div>
            {eyebrow && (
              <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-gold/80">{eyebrow}</div>
            )}
            {title && <h2 className="font-display text-2xl leading-tight text-white md:text-3xl">{title}</h2>}
          </div>
          {right}
        </header>
      )}
      {children}
    </section>
  );
}

/* Gauntlet stepper ------------------------------------------------------------- */

export function GauntletNav({
  stops,
  active,
  onSelect,
}: {
  stops: { id: GauntletStop; label: string; sub: string }[];
  active: GauntletStop;
  onSelect: (id: GauntletStop) => void;
}) {
  const activeIdx = stops.findIndex((s) => s.id === active);
  return (
    <nav className="flex items-stretch gap-2 md:gap-3">
      {stops.map((s, i) => {
        const state = i === activeIdx ? 'active' : i < activeIdx ? 'done' : 'todo';
        return (
          <button
            key={s.id}
            onClick={() => onSelect(s.id)}
            className={`group relative flex-1 rounded-xl border px-4 py-3 text-left transition-all duration-300
              ${state === 'active' ? 'border-gold/70 bg-gold/10 shadow-lg shadow-gold/10' : ''}
              ${state === 'done' ? 'border-gold/25 bg-navy-light/40' : ''}
              ${state === 'todo' ? 'border-white/10 bg-navy-light/20 hover:border-white/20' : ''}`}
          >
            <div className="flex items-center gap-2.5">
              <span
                className={`flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold
                  ${state === 'todo' ? 'bg-white/10 text-white/60' : 'bg-gold text-navy'}`}
              >
                {state === 'done' ? '✓' : i + 1}
              </span>
              <div className="min-w-0">
                <div className={`truncate text-sm font-semibold ${state === 'active' ? 'text-white' : 'text-white/80'}`}>
                  {s.label}
                </div>
                <div className="truncate text-[11px] uppercase tracking-wider text-white/40">{s.sub}</div>
              </div>
            </div>
          </button>
        );
      })}
    </nav>
  );
}

/* Telemetry tiles -------------------------------------------------------------- */

type Tone = 'gold' | 'emerald' | 'sky' | 'white';
const toneText: Record<Tone, string> = {
  gold: 'text-gold',
  emerald: 'text-emerald-400',
  sky: 'text-sky-400',
  white: 'text-white',
};

export function StatTile({
  label,
  value,
  suffix,
  hint,
  tone = 'gold',
}: {
  label: string;
  value: string | number;
  suffix?: string;
  hint?: string;
  tone?: Tone;
}) {
  return (
    <div className="scale-in rounded-xl border border-white/10 bg-navy-light/30 p-4">
      <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/45">{label}</div>
      <div className="mt-1.5 flex items-baseline gap-1">
        <span className={`font-display text-4xl leading-none ${toneText[tone]}`}>{value}</span>
        {suffix && <span className={`text-lg ${toneText[tone]}`}>{suffix}</span>}
      </div>
      {hint && <div className="mt-1 text-xs text-white/50">{hint}</div>}
    </div>
  );
}

/* Engine-vs-human labor split bar (consumes the canonical metric) -------------- */

export function LaborBar({ labor, compact = false }: { labor: LaborMetricResult; compact?: boolean }) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between text-xs">
        <span className="font-semibold text-gold">{labor.labor_reduction_pct}% engine-labor</span>
        <span className="text-white/55">{labor.human_judgment_pct}% human-judgment</span>
      </div>
      <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-white/10">
        <div
          className="h-full rounded-l-full bg-gold transition-[width] duration-700 ease-out"
          style={{ width: `${labor.labor_reduction_pct}%` }}
        />
        <div className="h-full bg-sky-400/60" style={{ width: `${labor.human_judgment_pct}%` }} />
      </div>
      {!compact && (
        <div className="mt-1 text-[11px] text-white/40">
          {labor.engine_lu} engine / {labor.human_lu} human labor units · estimated, pending calibration
        </div>
      )}
    </div>
  );
}

/* Radial purity gauge ---------------------------------------------------------- */

export function PurityGauge({
  value,
  label,
  size = 132,
  tone = 'gold',
}: {
  value: number;
  label: string;
  size?: number;
  tone?: Tone;
}) {
  const stroke = 10;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, value));
  const dash = (pct / 100) * c;
  const strokeColor = tone === 'emerald' ? '#34d399' : tone === 'sky' ? '#38bdf8' : '#c9a227';
  return (
    <div className="flex flex-col items-center">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="scale-in -rotate-90">
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={stroke} />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={strokeColor}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${dash} ${c}`}
            style={{ transition: 'stroke-dasharray 900ms cubic-bezier(0.16,1,0.3,1)' }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <div className={`font-display text-3xl leading-none ${toneText[tone]}`}>{Math.round(pct)}</div>
          <div className="text-[10px] uppercase tracking-widest text-white/45">%</div>
        </div>
      </div>
      <div className="mt-2 text-center text-xs font-medium text-white/70">{label}</div>
    </div>
  );
}

/* Countdown ring + celebration ------------------------------------------------- */

export function CountdownRing({
  seconds,
  running,
  onComplete,
  size = 96,
}: {
  seconds: number;
  running: boolean;
  onComplete?: () => void;
  size?: number;
}) {
  const [remaining, setRemaining] = useState(seconds);
  const done = useRef(false);

  useEffect(() => {
    setRemaining(seconds);
    done.current = false;
  }, [seconds]);

  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => {
      setRemaining((x) => {
        if (x <= 1) {
          clearInterval(t);
          if (!done.current) {
            done.current = true;
            onComplete?.();
          }
          return 0;
        }
        return x - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [running, onComplete]);

  const stroke = 8;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const frac = seconds > 0 ? remaining / seconds : 0;
  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="#c9a227"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${frac * c} ${c}`}
          style={{ transition: 'stroke-dasharray 1s linear' }}
        />
      </svg>
      <span className="absolute font-display text-2xl text-white">{remaining}</span>
    </div>
  );
}

export function CelebrationBurst({ show, label }: { show: boolean; label: string }) {
  if (!show) return null;
  return (
    <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center">
      <div className="scale-in flex flex-col items-center">
        <div className="relative flex h-24 w-24 items-center justify-center rounded-full bg-gold/20 pulse-soft">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gold text-3xl text-navy">✓</div>
          {[...Array(10)].map((_, i) => (
            <span
              key={i}
              className="pulse-soft absolute h-1.5 w-1.5 rounded-full bg-gold-light"
              style={{
                transform: `rotate(${i * 36}deg) translateY(-56px)`,
                animationDelay: `${i * 40}ms`,
              }}
            />
          ))}
        </div>
        <div className="slide-up mt-5 rounded-full border border-gold/40 bg-navy px-5 py-2 font-display text-xl text-gold">
          {label}
        </div>
      </div>
    </div>
  );
}

/* Small building blocks used across stops -------------------------------------- */

export function ConfidencePill({ value, resolved }: { value: number; resolved: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold
        ${resolved ? 'bg-emerald-400/15 text-emerald-300' : 'bg-white/10 text-white/60'}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${resolved ? 'bg-emerald-400' : 'bg-white/40'}`} />
      {value}% confidence
    </span>
  );
}

export function Row({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`flex items-center justify-between rounded-lg border border-white/8 bg-navy-light/30 px-4 py-3 ${className}`}>
      {children}
    </div>
  );
}
