'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { volumeSnapshot, eventStream, type VolumeSnapshot, type LiveEvent } from '@/lib/demo-live';

/**
 * /system — the 10,000-foot view of how VantaUM works.
 *
 * A full-bleed, chromeless systems map for executives and prospects: the
 * whole pipeline from five intake channels to defended determinations,
 * with live-ticking telemetry, the engineering that's hard to replicate,
 * and the platform's real numbers.
 *
 * Telemetry here is a deterministic simulation from lib/demo-live at the
 * platform's design scale (333k lives ≈ 1,400 auths/day) — labeled as
 * such on-page. The architecture, formulas, and platform counts are real.
 */

const STAGES = [
  {
    key: 'ingest',
    n: '01',
    title: 'Ingest',
    line: 'eFax · Portal · Voice · Email · API',
    points: ['HMAC-signed webhooks, ±300s replay windows', 'Idempotency ledger — no double-created cases', 'Sub-100ms webhook ACK, async workers'],
    flowStages: ['intake'],
  },
  {
    key: 'understand',
    n: '02',
    title: 'Understand',
    line: 'OCR + AI extraction',
    points: ['Vision OCR over multi-page clinical packets', 'LLM tool-use extraction, regex fallback', 'Confidence gating → human triage below threshold'],
    flowStages: ['intake'],
  },
  {
    key: 'dedupe',
    n: '03',
    title: 'Dedupe & Route',
    line: 'Fingerprints + SLA-aware assignment',
    points: ['SHA-256 content fingerprint, 24h sliding window', 'Cross-channel — fax vs portal vs phone collide', 'Slack-scored routing against the deadline'],
    flowStages: ['dedup'],
  },
  {
    key: 'brief',
    n: '04',
    title: 'Brief Engine',
    line: 'Multi-pass drafting + deterministic verification',
    points: ['Draft → self-critique → revise, scored each pass', 'Deterministic fact-check gate before release', 'Two-Midnight + Fidelity Guard rulepacks'],
    flowStages: ['brief'],
  },
  {
    key: 'humans',
    n: '05',
    title: 'Human Gates',
    line: 'Concierge → LPN → RN → MD',
    points: ['Concierge validates every brief (required rationale)', 'Licensed clinicians decide — the AI never does', 'Per-case attestation; no bulk paths exist'],
    flowStages: ['concierge', 'lpn', 'rn', 'md'],
  },
  {
    key: 'defend',
    n: '06',
    title: 'Deliver & Defend',
    line: 'Determinations that hold up',
    points: ['Letters rendered, delivered, acknowledged', 'Immutable audit trail on every decision + PHI access', 'Quality loop: RN audits scored back into ops'],
    flowStages: ['delivery'],
  },
];

const HARD_PARTS: Array<{ title: string; body: string; mono: string }> = [
  {
    title: 'Signed intake, rotatable secrets',
    body: 'Every inbound channel authenticates with HMAC over a timestamp-bound body. Two secrets validate simultaneously, so keys rotate with zero downtime.',
    mono: 'sig = HMAC_SHA256(secret, ts + "." + body)\nreject if |now − ts| > 300s',
  },
  {
    title: 'Concurrency-safe pipeline workers',
    body: 'Workers claim batches with row-level locks, so parallel schedulers can never double-process a fax. Eager status writes between steps make every crash recoverable.',
    mono: 'SELECT … FOR UPDATE SKIP LOCKED',
  },
  {
    title: 'Cross-channel dedup',
    body: 'A normalized content fingerprint catches the same authorization arriving twice — by fax and portal, hours apart — before a duplicate case can exist.',
    mono: 'fp = SHA256(patient‖dob‖member‖codes‖src)\nwindow: 24h sliding',
  },
  {
    title: 'SLA-aware clinical routing',
    body: 'Assignment maximizes slack against each case\'s deadline given the clinician\'s live load and historical turnaround — not round-robin, not chance.',
    mono: 'slack = deadline − (load+1)·turnaround\nscore = slack − 0.1·load',
  },
  {
    title: 'Brief integrity gate',
    body: 'Briefs are drafted, self-critiqued, and revised in passes — then a deterministic fact-checker verifies every claim against source data before a human ever sees it.',
    mono: 'draft → critique → revise → verify\nrelease iff fact_check ≥ gate',
  },
  {
    title: 'The wall',
    body: 'The AI reads, extracts, drafts, verifies, and recommends. A licensed clinician decides — with required rationale and a per-case attestation. There is no bulk-decision path in the codebase.',
    mono: 'AI: evidence\nclinician: verdict + attestation',
  },
  {
    title: 'Tenant isolation without leaks',
    body: 'Row-level security plus path-guarded, 5-minute signed URLs. Bad requests get identical 404s whether the file exists or not — the API never confirms what it protects.',
    mono: 'RLS + signed URLs (300s)\n404 == 404, always',
  },
  {
    title: 'Swap-layer architecture',
    body: 'Database, storage, auth, and email each sit behind an adapter seam — Supabase⇄RDS, Supabase⇄S3+KMS, Supabase⇄Cognito — swappable per environment with one flag.',
    mono: 'ENABLE_AWS_DB / _STORAGE / …\nsame call sites, different iron',
  },
  {
    title: 'Audit-first, PHI-safe',
    body: 'Hundreds of instrumented call sites log every human decision and PHI access. Patient names are hashed in operational logs; PHI never rides in URLs or error responses.',
    mono: 'audit(actor, action, case, ctx)\nname → SHA-256 before any log',
  },
];

interface LiveTelemetry {
  v: VolumeSnapshot;
  wire: LiveEvent[];
}

export default function SystemPage() {
  const [live, setLive] = useState<LiveTelemetry | null>(null);

  useEffect(() => {
    const update = () => setLive({ v: volumeSnapshot(), wire: eventStream(5) });
    // First paint happens on the next tick (external clock is the source),
    // then the simulation advances every 4s.
    const first = setTimeout(update, 0);
    const t = setInterval(update, 4_000);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, []);

  const mounted = live !== null;
  const v: VolumeSnapshot | null = live?.v ?? null;
  const wire: LiveEvent[] = live?.wire ?? [];
  const flowByStage = new Map((v?.in_flight ?? []).map((s) => [s.stage, s.count]));
  const stageCount = (keys: string[]) => keys.reduce((s, k) => s + (flowByStage.get(k) ?? 0), 0);

  return (
    <div className="min-h-screen bg-[#081a30] text-white font-[family-name:var(--font-dm-sans)] overflow-x-hidden">
      {/* ── Hero ─────────────────────────────────────────────── */}
      <header className="relative px-6 md:px-12 pt-14 pb-10 max-w-6xl mx-auto">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <p className="text-[11px] uppercase tracking-[0.24em] text-gold font-semibold">VantaUM · System Overview</p>
          <span className="text-[10px] uppercase tracking-wide text-white/40 border border-white/15 rounded-full px-2.5 py-1">
            live simulation · demo environment
          </span>
        </div>
        <h1 className="font-[family-name:var(--font-display)] text-4xl md:text-6xl leading-tight mt-4 max-w-3xl">
          One clinical engine.<br />Every authorization, defended.
        </h1>
        <p className="text-white/60 mt-4 max-w-2xl text-sm md:text-base leading-relaxed">
          Five intake channels collapse into a single case object. AI does the reading, extraction,
          drafting, and verification — licensed humans make every decision — and each determination
          leaves with the evidence to survive an audit. Built for {((v?.lives_supported ?? 333000) / 1000).toFixed(0)}k
          supported lives, ~{(v?.daily_target ?? 1400).toLocaleString()} authorizations a day.
        </p>

        {/* Live counters */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mt-8">
          {[
            { label: 'Auths today', val: v?.auths_today?.toLocaleString() ?? '—', pulse: true },
            { label: 'Pages OCR’d', val: v?.pages_ocr_today?.toLocaleString() ?? '—' },
            { label: 'Briefs generated', val: v?.briefs_generated_today?.toLocaleString() ?? '—' },
            { label: 'Avg brief time', val: v ? `${v.avg_brief_seconds}s` : '—' },
            { label: 'On-time rate', val: v ? `${v.on_time_rate_pct}%` : '—' },
          ].map((c) => (
            <div key={c.label} className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3">
              <p className="font-mono text-2xl md:text-3xl text-white tabular-nums">
                {c.val}
                {c.pulse && (
                  <span className="relative inline-flex ml-2 h-2 w-2 align-middle">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400" />
                  </span>
                )}
              </p>
              <p className="text-[11px] uppercase tracking-wide text-white/40 mt-1">{c.label}</p>
            </div>
          ))}
        </div>
      </header>

      {/* ── Pipeline ─────────────────────────────────────────── */}
      <section className="px-6 md:px-12 py-10 max-w-6xl mx-auto">
        <p className="text-[11px] uppercase tracking-[0.24em] text-gold font-semibold mb-6">The pipeline</p>
        <div className="grid md:grid-cols-3 gap-4">
          {STAGES.map((s, i) => (
            <div key={s.key} className="relative rounded-2xl border border-white/10 bg-white/[0.03] p-5 hover:border-gold/40 transition-colors">
              <div className="flex items-baseline justify-between">
                <span className="font-mono text-[11px] text-gold">{s.n}</span>
                <span className="font-mono text-[11px] text-white/40">
                  {mounted ? `${stageCount(s.flowStages)} in flight` : ''}
                </span>
              </div>
              <h3 className="font-[family-name:var(--font-display)] text-2xl mt-1">{s.title}</h3>
              <p className="text-xs text-gold/80 mt-0.5">{s.line}</p>
              <ul className="mt-3 space-y-1.5">
                {s.points.map((p) => (
                  <li key={p} className="text-[13px] text-white/60 leading-snug flex gap-2">
                    <span className="text-gold/70 mt-[3px]" aria-hidden>▸</span>
                    <span>{p}</span>
                  </li>
                ))}
              </ul>
              {i < STAGES.length - 1 && (
                <div className="hidden md:block absolute -right-3 top-1/2 -translate-y-1/2 text-gold/50 text-lg" aria-hidden>→</div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* ── Live wire ────────────────────────────────────────── */}
      <section className="px-6 md:px-12 py-6 max-w-6xl mx-auto">
        <div className="rounded-2xl border border-white/10 bg-black/20 p-5">
          <div className="flex items-center gap-2 mb-3">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400" />
            </span>
            <p className="text-[11px] uppercase tracking-[0.24em] text-white/50 font-semibold">On the wire right now</p>
          </div>
          <ul className="divide-y divide-white/5">
            {wire.map((ev) => (
              <li key={ev.id} className="py-2 flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
                <span className="font-mono text-[11px] text-white/30 w-14 shrink-0">
                  {new Date(ev.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                </span>
                <span className="text-[13px] text-white/90 font-medium">{ev.headline}</span>
                <span className="text-[12px] text-white/40 truncate max-w-full">{ev.detail}</span>
              </li>
            ))}
            {!mounted && <li className="py-2 text-[13px] text-white/40">Connecting…</li>}
          </ul>
        </div>
      </section>

      {/* ── The hard parts ───────────────────────────────────── */}
      <section className="px-6 md:px-12 py-10 max-w-6xl mx-auto">
        <p className="text-[11px] uppercase tracking-[0.24em] text-gold font-semibold">The hard parts</p>
        <h2 className="font-[family-name:var(--font-display)] text-3xl md:text-4xl mt-2 max-w-2xl">
          The parts you don&rsquo;t see are the parts you can&rsquo;t copy.
        </h2>
        <div className="grid md:grid-cols-3 gap-4 mt-8">
          {HARD_PARTS.map((h) => (
            <div key={h.title} className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 flex flex-col">
              <h3 className="text-sm font-semibold text-white">{h.title}</h3>
              <p className="text-[13px] text-white/55 leading-relaxed mt-2 flex-1">{h.body}</p>
              <pre className="mt-4 rounded-lg bg-black/40 border border-white/10 px-3 py-2.5 font-mono text-[11px] text-emerald-300/90 whitespace-pre-wrap leading-relaxed">{h.mono}</pre>
            </div>
          ))}
        </div>
      </section>

      {/* ── Numbers wall ─────────────────────────────────────── */}
      <section className="px-6 md:px-12 py-10 max-w-6xl mx-auto">
        <div className="rounded-2xl border border-gold/25 bg-gold/[0.05] p-6 md:p-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            {[
              { val: '333k', label: 'lives at design scale' },
              { val: '~1,400', label: 'authorizations / day' },
              { val: '94', label: 'API surfaces' },
              { val: '30', label: 'schema migrations' },
              { val: '360+', label: 'automated tests' },
              { val: '7', label: 'infrastructure stacks' },
              { val: '266', label: 'audit-logged call sites' },
              { val: '100%', label: 'decisions attested by a human' },
            ].map((n) => (
              <div key={n.label}>
                <p className="font-[family-name:var(--font-display)] text-3xl md:text-4xl text-gold">{n.val}</p>
                <p className="text-[11px] uppercase tracking-wide text-white/45 mt-1">{n.label}</p>
              </div>
            ))}
          </div>
          <p className="text-[13px] text-white/60 mt-6 leading-relaxed max-w-3xl">
            Every determination leaves the building with its AI brief, its deterministic fact-check,
            the clinician&rsquo;s written rationale, a per-case attestation, and the full audit trail —
            assembled automatically, defensible by construction.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 mt-8 pb-14">
          <Link
            href="/concierge"
            className="inline-flex items-center gap-2 bg-gold text-navy px-5 py-2.5 rounded-lg text-sm font-semibold hover:bg-gold-light transition-colors"
          >
            Enter the platform →
          </Link>
          <Link
            href="/cockpit"
            className="inline-flex items-center gap-2 border border-white/20 text-white/80 px-5 py-2.5 rounded-lg text-sm font-semibold hover:border-gold/60 hover:text-white transition-colors"
          >
            Run the Pod Day tour
          </Link>
        </div>
      </section>
    </div>
  );
}
