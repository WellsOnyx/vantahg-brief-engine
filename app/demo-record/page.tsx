'use client';

/**
 * /demo-record — VantaUM Cinematic Demo (Loom-ready)
 *
 * Purpose: Screen recordings for marketing, investor decks, sales calls.
 * Design: Dark, fixed-viewport (1280×800), no scrolling during playback.
 *         Designed to look incredible on a Loom recording.
 * Constraint: Zero vendor names. Zero tech-stack references. Pure "it just works."
 * Story: Case comes in → analyzed in seconds → brief surfaces → physician decides → TPA notified.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import type { Determination } from '@/lib/types';

// ── Scene definitions ─────────────────────────────────────────────────────────

type SceneId = 'splash' | 'intake' | 'analysis' | 'brief' | 'physician' | 'delivered';

interface Scene {
  id: SceneId;
  duration: number; // auto-advance after this many ms (0 = wait for user)
}

const SCENES: Scene[] = [
  { id: 'splash',    duration: 2400 },
  { id: 'intake',    duration: 0 },
  { id: 'analysis',  duration: 0 },   // self-advances when ring hits 100%
  { id: 'brief',     duration: 0 },
  { id: 'physician', duration: 0 },
  { id: 'delivered', duration: 0 },
];

// ── Demo data (hardcoded for recording — stable, no runtime deps) ─────────────

const CASE = {
  number: 'UM-2026-00847',
  patient: 'Sarah Mitchell',
  dob: '1981-08-14',
  memberId: 'SWA-2847391',
  procedure: 'Lumbar Spine MRI Without Contrast',
  cptCode: '72148',
  icd10: 'M54.42',
  provider: 'Dr. Kevin Chen, MD',
  payer: 'Southwest Administrators',
  priority: 'Standard',
  sla: '48 hours',
  submittedAt: '9:04 AM',
};

const BRIEF = {
  recommendation: 'APPROVE',
  confidence: 'High',
  score: 97,
  criteriaCount: 6,
  rationale:
    'Medical necessity criteria are met. Patient presents with a 7-week history of persistent lumbar radiculopathy with left leg radiation, documented failure of conservative therapy including physical therapy and NSAIDs, and confirmed neurological findings on examination. Lumbar spine MRI is appropriate and necessary to evaluate for disc herniation or spinal stenosis prior to consideration of interventional or surgical options.',
  criteriaItems: [
    'Radicular symptoms ≥ 6 weeks duration',
    'Failure of conservative therapy documented (PT + NSAIDs)',
    'Neurological deficit present on physical exam',
    'No recent advanced imaging on file (> 12 months)',
    'Ordering physician specialty appropriate',
    'Clinical setting appropriate (outpatient)',
  ],
  guideline: 'InterQual 2026',
  guidelineDetail: 'Musculoskeletal — Spine Imaging Criteria',
  timeToAnalysis: '1m 53s',
};

const REVIEWER = {
  name: 'Dr. Priya Patel',
  credentials: 'MD',
  specialty: 'Orthopedic Surgery',
  initials: 'PP',
  casesReviewed: 847,
  avgTurnaround: '1.8h',
};

const TIMELINE = [
  { time: '9:04:12 AM', event: 'Authorization request received via provider portal', actor: 'System' },
  { time: '9:04:15 AM', event: 'Case created and assigned to review pod', actor: 'System' },
  { time: '9:05:47 AM', event: 'Clinical brief generated and independently verified', actor: 'VantaUM' },
  { time: '9:06:01 AM', event: `Brief routed to ${REVIEWER.name}`, actor: 'System' },
  { time: '9:08:31 AM', event: 'Determination: APPROVE — Medical necessity criteria met per InterQual 2026 guidelines.', actor: REVIEWER.name },
  { time: '9:08:32 AM', event: 'Determination delivered to Southwest Administrators', actor: 'System' },
];

// ── Sub-components ────────────────────────────────────────────────────────────

function ProgressRing({ pct, size = 96, stroke = 5, color = '#c9a227' }: {
  pct: number; size?: number; stroke?: number; color?: string;
}) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} className="-rotate-90" aria-hidden="true">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={stroke} />
      <circle
        cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke}
        strokeDasharray={circ} strokeDashoffset={circ * (1 - pct / 100)}
        strokeLinecap="round" style={{ transition: 'stroke-dashoffset 0.6s ease' }}
      />
    </svg>
  );
}

function TypewriterText({ text, active, speed = 4 }: { text: string; active: boolean; speed?: number }) {
  const [displayed, setDisplayed] = useState('');
  const [done, setDone] = useState(false);
  useEffect(() => {
    if (!active) { setDisplayed(''); setDone(false); return; }
    setDisplayed(''); setDone(false);
    let i = 0;
    const iv = setInterval(() => {
      i += speed;
      if (i >= text.length) { setDisplayed(text); setDone(true); clearInterval(iv); }
      else setDisplayed(text.slice(0, i));
    }, 16);
    return () => clearInterval(iv);
  }, [text, active, speed]);
  return (
    <span>
      {displayed}
      {active && !done && (
        <span className="inline-block w-0.5 h-3.5 bg-gold/70 animate-pulse ml-0.5 align-middle" />
      )}
    </span>
  );
}

function CriteriaItem({ text, index, active }: { text: string; index: number; active: boolean }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!active) { setVisible(false); return; }
    const t = setTimeout(() => setVisible(true), 200 + index * 180);
    return () => clearTimeout(t);
  }, [active, index]);
  return (
    <li className={`flex items-start gap-2 text-sm transition-all duration-500 ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'}`}>
      <span className="text-green-400 shrink-0 mt-0.5 font-bold">✓</span>
      <span className="text-white/65">{text}</span>
    </li>
  );
}

function StatCard({ label, value, sub, gold = false }: { label: string; value: string; sub?: string; gold?: boolean }) {
  return (
    <div className={`rounded-2xl border p-4 flex flex-col gap-0.5 ${gold ? 'border-gold/30 bg-gold/6' : 'border-white/8 bg-white/3'}`}>
      <p className="text-[10px] uppercase tracking-widest text-white/30">{label}</p>
      <p className={`text-2xl font-bold tabular-nums ${gold ? 'text-gold' : 'text-white'}`}>{value}</p>
      {sub && <p className="text-[11px] text-white/25">{sub}</p>}
    </div>
  );
}

// ── Scene: Splash ─────────────────────────────────────────────────────────────

function SplashScene({ onNext }: { onNext: () => void }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 100);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="flex flex-col items-center justify-center h-full text-center px-8">
      <div className={`transition-all duration-700 ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
        {/* Wordmark */}
        <div className="flex items-center justify-center gap-3 mb-10">
          <div className="w-12 h-12 rounded-2xl bg-navy-light border border-gold/30 flex items-center justify-center font-bold text-gold text-xl">
            V
          </div>
          <div className="text-left">
            <p className="text-2xl font-bold text-white tracking-tight">VantaUM</p>
            <p className="text-xs text-white/30 tracking-widest uppercase">Concierge Utilization Management</p>
          </div>
        </div>

        <h1 className="text-5xl font-bold text-white leading-tight mb-4">
          Authorization management,<br />
          <span className="text-gold">the way it should work.</span>
        </h1>
        <p className="text-white/40 text-lg max-w-xl mx-auto leading-relaxed mb-12">
          From submission to determination in minutes, not days.
          Every case covered. Every deadline met. It just works.
        </p>

        {/* Live stats */}
        <div className="flex items-center justify-center gap-8 mb-12">
          {[
            { label: 'Avg turnaround', value: '4.2 min' },
            { label: 'SLA compliance', value: '99.8%' },
            { label: 'Cases closed today', value: '142' },
          ].map(s => (
            <div key={s.label} className="text-center">
              <p className="text-3xl font-bold text-white tabular-nums">{s.value}</p>
              <p className="text-xs text-white/30 uppercase tracking-widest mt-1">{s.label}</p>
            </div>
          ))}
        </div>

        <button
          onClick={onNext}
          className="px-8 py-4 bg-gold text-navy font-bold text-base rounded-2xl hover:bg-amber-400 transition-all"
        >
          See a case get handled →
        </button>
      </div>
    </div>
  );
}

// ── Scene: Intake ─────────────────────────────────────────────────────────────

function IntakeScene({ onNext }: { onNext: () => void }) {
  return (
    <div className="flex flex-col h-full px-8 py-6">
      {/* Section header */}
      <div className="mb-5">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 mb-3">
          <div className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
          <span className="text-xs text-blue-300 font-medium">Authorization Request Received</span>
        </div>
        <h2 className="text-2xl font-bold text-white">A new case just came in</h2>
        <p className="text-white/40 text-sm mt-1">Submitted via secure provider portal · {CASE.submittedAt} · {CASE.number}</p>
      </div>

      {/* Case card */}
      <div className="flex-1 grid grid-cols-5 gap-5">
        {/* Left — patient + procedure */}
        <div className="col-span-3 rounded-2xl border border-white/10 bg-white/3 p-6 flex flex-col gap-5">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs text-white/25 uppercase tracking-widest mb-1">Member</p>
              <h3 className="text-xl font-bold text-white">{CASE.patient}</h3>
              <p className="text-white/40 text-sm mt-0.5">DOB {CASE.dob} · Member ID {CASE.memberId}</p>
            </div>
            <div className="flex flex-col items-end gap-1.5">
              <span className="px-3 py-1 rounded-full bg-blue-500/12 border border-blue-500/20 text-blue-300 text-xs font-medium">Received</span>
              <span className="px-3 py-1 rounded-full bg-amber-500/12 border border-amber-500/20 text-amber-300 text-xs font-medium">Standard Priority</span>
            </div>
          </div>

          <div>
            <p className="text-xs text-white/25 uppercase tracking-widest mb-1">Requested Service</p>
            <p className="text-base font-semibold text-white">{CASE.procedure}</p>
            <p className="text-white/40 text-sm font-mono mt-0.5">CPT {CASE.cptCode} · ICD-10 {CASE.icd10}</p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {[
              { label: 'Requesting Provider', value: CASE.provider },
              { label: 'Payer', value: CASE.payer },
              { label: 'Review Type', value: 'Prior Authorization' },
              { label: 'SLA', value: CASE.sla },
            ].map(f => (
              <div key={f.label}>
                <p className="text-xs text-white/25 mb-0.5">{f.label}</p>
                <p className="text-sm text-white/80 font-medium">{f.value}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Right — documents + clinical Q */}
        <div className="col-span-2 flex flex-col gap-4">
          <div className="rounded-2xl border border-white/10 bg-white/3 p-5 flex-1">
            <p className="text-xs text-white/25 uppercase tracking-widest mb-3">Submitted Documents</p>
            <ul className="space-y-2">
              {['Physician order & referral notes (4 pp)', 'Clinical questionnaire', 'Conservative therapy records (PT notes 6 wk)', 'Physical exam findings'].map((d, i) => (
                <li key={i} className="flex items-center gap-2 text-sm text-white/60">
                  <span className="text-white/20 shrink-0">📄</span>
                  {d}
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/3 p-5">
            <p className="text-xs text-white/25 uppercase tracking-widest mb-2">Clinical Question</p>
            <p className="text-sm text-white/60 leading-relaxed">
              Is lumbar spine MRI medically necessary for a patient with persistent radiculopathy unresponsive to 6 weeks of conservative therapy?
            </p>
          </div>
        </div>
      </div>

      <div className="mt-5">
        <button
          onClick={onNext}
          className="w-full py-3.5 rounded-2xl bg-gold text-navy font-bold text-sm hover:bg-amber-400 transition-all"
        >
          VantaUM analyzes this case →
        </button>
      </div>
    </div>
  );
}

// ── Scene: Analysis ───────────────────────────────────────────────────────────

function AnalysisScene({ onComplete }: { onComplete: () => void }) {
  const [pct, setPct] = useState(0);
  const [phaseIdx, setPhaseIdx] = useState(0);
  const doneRef = useRef(false);

  const PHASES = [
    { threshold: 0,  label: 'Reading clinical documentation…' },
    { threshold: 20, label: 'Extracting diagnosis and procedure codes…' },
    { threshold: 40, label: 'Matching evidence-based criteria (InterQual)…' },
    { threshold: 62, label: 'Evaluating documentation completeness…' },
    { threshold: 78, label: 'Generating structured clinical brief…' },
    { threshold: 92, label: 'Running independent verification pass…' },
  ];

  const CHECKS = [
    { label: 'Clinical documentation read', done: (p: number) => p > 16 },
    { label: 'Diagnosis & procedure codes extracted', done: (p: number) => p > 32 },
    { label: 'Criteria matched', done: (p: number) => p > 55 },
    { label: 'Documentation quality assessed', done: (p: number) => p > 68 },
    { label: 'Brief generated', done: (p: number) => p > 85 },
    { label: 'Verification complete', done: (p: number) => p > 96 },
  ];

  useEffect(() => {
    let p = 0;
    const iv = setInterval(() => {
      p += 0.8;
      const clamped = Math.min(100, p);
      setPct(clamped);

      // Update phase
      let newPhase = 0;
      for (let i = 0; i < PHASES.length; i++) {
        if (clamped >= PHASES[i].threshold) newPhase = i;
      }
      setPhaseIdx(newPhase);

      if (clamped >= 100 && !doneRef.current) {
        doneRef.current = true;
        clearInterval(iv);
        setTimeout(onComplete, 800);
      }
    }, 25);
    return () => clearInterval(iv);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex flex-col items-center justify-center h-full px-8">
      <div className="w-full max-w-2xl">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-gold/10 border border-gold/20 mb-3">
            <div className="w-1.5 h-1.5 rounded-full bg-gold animate-pulse" />
            <span className="text-xs text-gold font-medium uppercase tracking-widest">Analyzing</span>
          </div>
          <h2 className="text-2xl font-bold text-white mb-1">VantaUM is reviewing the case</h2>
          <p className="text-white/35 text-sm">No one is reading through 40 pages of records. It just happens.</p>
        </div>

        {/* Ring + phase */}
        <div className="flex items-center gap-10 mb-8 justify-center">
          <div className="relative">
            <ProgressRing pct={pct} size={120} stroke={6} />
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-2xl font-bold tabular-nums text-white">{Math.round(pct)}%</span>
            </div>
          </div>
          <div className="flex-1">
            <p className="text-base font-medium text-white mb-1 transition-all duration-300">{PHASES[phaseIdx].label}</p>
            <div className="h-1.5 bg-white/8 rounded-full overflow-hidden">
              <div
                className="h-full bg-gold rounded-full transition-all duration-300"
                style={{ width: `${pct}%` }}
              />
            </div>
            <p className="text-xs text-white/25 mt-1.5">
              {pct < 100 ? 'Processing…' : 'Complete ✓'}
            </p>
          </div>
        </div>

        {/* Checklist */}
        <div className="rounded-2xl border border-white/8 bg-white/3 p-6">
          <ul className="space-y-3">
            {CHECKS.map((item, i) => {
              const isDone = item.done(pct);
              return (
                <li key={i} className="flex items-center gap-3 text-sm">
                  <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-all duration-400 ${
                    isDone ? 'border-gold bg-gold/15' : 'border-white/15 bg-transparent'
                  }`}>
                    {isDone && <div className="w-2 h-2 rounded-full bg-gold" />}
                  </div>
                  <span className={`transition-colors duration-300 ${isDone ? 'text-white/70' : 'text-white/20'}`}>
                    {item.label}
                  </span>
                  {isDone && <span className="ml-auto text-green-400 text-xs">Done</span>}
                </li>
              );
            })}
          </ul>
        </div>

        <p className="text-center text-xs text-white/18 mt-4">Clinical brief preparing — no action required</p>
      </div>
    </div>
  );
}

// ── Scene: Brief ready ─────────────────────────────────────────────────────────

function BriefScene({ onNext }: { onNext: () => void }) {
  return (
    <div className="flex flex-col h-full px-8 py-6">
      <div className="mb-4">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-green-500/10 border border-green-500/20 mb-2">
          <div className="w-1.5 h-1.5 rounded-full bg-green-400" />
          <span className="text-xs text-green-300 font-medium">Clinical Brief Ready · 1m 53s</span>
        </div>
        <h2 className="text-2xl font-bold text-white">Here's what the physician will see</h2>
        <p className="text-white/35 text-sm mt-0.5">Structured assessment. No document hunting. Just the answer.</p>
      </div>

      <div className="flex-1 grid grid-cols-5 gap-4 overflow-hidden">
        {/* Left: assessment + rationale */}
        <div className="col-span-3 flex flex-col gap-4">
          {/* Recommendation banner */}
          <div className="rounded-2xl border border-green-500/25 bg-green-500/6 p-5">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs text-white/30 uppercase tracking-widest">Assessment</p>
              <div className="flex items-center gap-2">
                <span className="text-xs text-white/25">Confidence</span>
                <span className="px-2 py-0.5 rounded-full bg-green-500/20 border border-green-500/30 text-green-300 text-xs font-semibold">{BRIEF.confidence}</span>
              </div>
            </div>
            <p className="text-3xl font-bold text-green-400 mb-3">{BRIEF.recommendation}</p>
            <p className="text-sm text-white/55 leading-relaxed">
              <TypewriterText text={BRIEF.rationale} active speed={6} />
            </p>
          </div>

          {/* Criteria */}
          <div className="rounded-2xl border border-white/8 bg-white/3 p-5 flex-1">
            <p className="text-xs text-green-400/80 uppercase tracking-widest mb-3">
              Criteria Met ({BRIEF.criteriaCount}/{BRIEF.criteriaCount})
            </p>
            <ul className="space-y-2">
              {BRIEF.criteriaItems.map((c, i) => (
                <CriteriaItem key={i} text={c} index={i} active />
              ))}
            </ul>
          </div>
        </div>

        {/* Right: scores + meta */}
        <div className="col-span-2 flex flex-col gap-4">
          {/* Verification score */}
          <div className="rounded-2xl border border-white/8 bg-white/3 p-5">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs text-white/30 uppercase tracking-widest">Verification Score</p>
              <span className="text-2xl font-bold text-white tabular-nums">{BRIEF.score}/100</span>
            </div>
            <div className="h-2 bg-white/8 rounded-full overflow-hidden">
              <div className="h-full bg-green-400 rounded-full" style={{ width: `${BRIEF.score}%`, transition: 'width 1.2s ease' }} />
            </div>
            <p className="text-xs text-white/20 mt-2">All claims independently verified</p>
          </div>

          {/* Guideline */}
          <div className="rounded-2xl border border-white/8 bg-white/3 p-5">
            <p className="text-xs text-white/30 uppercase tracking-widest mb-2">Criteria Source</p>
            <p className="text-base font-semibold text-white">{BRIEF.guideline}</p>
            <p className="text-white/35 text-xs mt-0.5">{BRIEF.guidelineDetail}</p>
          </div>

          {/* Time */}
          <div className="rounded-2xl border border-gold/20 bg-gold/4 p-5">
            <p className="text-xs text-white/30 uppercase tracking-widest mb-1">Time to Brief</p>
            <p className="text-3xl font-bold text-gold tabular-nums">{BRIEF.timeToAnalysis}</p>
            <p className="text-white/20 text-xs mt-1">vs 4–6 hours manual review</p>
          </div>

          {/* Case ref */}
          <div className="rounded-2xl border border-white/8 bg-white/3 p-5">
            <p className="text-xs text-white/30 uppercase tracking-widest mb-2">Case</p>
            <p className="text-sm font-mono text-white/60">{CASE.number}</p>
            <p className="text-xs text-white/30 mt-1">{CASE.patient} · {CASE.procedure}</p>
          </div>
        </div>
      </div>

      <div className="mt-4">
        <button
          onClick={onNext}
          className="w-full py-3.5 rounded-2xl bg-gold text-navy font-bold text-sm hover:bg-amber-400 transition-all"
        >
          Route to physician for review →
        </button>
      </div>
    </div>
  );
}

// ── Scene: Physician decision ─────────────────────────────────────────────────

function PhysicianScene({ onNext }: { onNext: () => void }) {
  const [selected, setSelected] = useState<Determination | null>(null);
  const [rationale, setRationale] = useState('');
  const [submitting, setSubmitting] = useState(false);

  function handleSubmit() {
    if (!selected || rationale.length < 6) return;
    setSubmitting(true);
    setTimeout(onNext, 1200);
  }

  const determinations: { det: Determination; label: string; color: string; selected: string }[] = [
    {
      det: 'approve',
      label: 'Approve',
      color: 'border-white/10 text-white/40 hover:border-green-500/40 hover:text-green-300',
      selected: 'bg-green-500/12 border-green-500/40 text-green-300',
    },
    {
      det: 'deny',
      label: 'Deny',
      color: 'border-white/10 text-white/40 hover:border-red-500/40 hover:text-red-300',
      selected: 'bg-red-500/12 border-red-500/40 text-red-300',
    },
    {
      det: 'partial_approve',
      label: 'Partial Approval',
      color: 'border-white/10 text-white/40 hover:border-yellow-500/40 hover:text-yellow-300',
      selected: 'bg-yellow-500/12 border-yellow-500/40 text-yellow-300',
    },
    {
      det: 'modify',
      label: 'Approve w/ Mods',
      color: 'border-white/10 text-white/40 hover:border-teal-500/40 hover:text-teal-300',
      selected: 'bg-teal-500/12 border-teal-500/40 text-teal-300',
    },
    {
      det: 'pend',
      label: 'Request More Info',
      color: 'border-white/10 text-white/40 hover:border-orange-500/40 hover:text-orange-300',
      selected: 'bg-orange-500/12 border-orange-500/40 text-orange-300',
    },
    {
      det: 'peer_to_peer_requested',
      label: 'Request P2P',
      color: 'border-white/10 text-white/40 hover:border-purple-500/40 hover:text-purple-300',
      selected: 'bg-purple-500/12 border-purple-500/40 text-purple-300',
    },
  ];

  return (
    <div className="flex flex-col h-full px-8 py-6">
      <div className="mb-4">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-purple-500/10 border border-purple-500/20 mb-2">
          <div className="w-1.5 h-1.5 rounded-full bg-purple-400" />
          <span className="text-xs text-purple-300 font-medium">Physician Review</span>
        </div>
        <h2 className="text-2xl font-bold text-white">Physician makes the call</h2>
        <p className="text-white/35 text-sm mt-0.5">Brief in hand. Average time: under 8 minutes. This one took less.</p>
      </div>

      <div className="flex-1 grid grid-cols-5 gap-5">
        {/* Left col: reviewer + brief summary */}
        <div className="col-span-2 flex flex-col gap-4">
          {/* Reviewer card */}
          <div className="rounded-2xl border border-white/10 bg-white/3 p-5 flex items-center gap-3">
            <div className="w-11 h-11 rounded-full bg-navy-light border border-white/10 flex items-center justify-center font-bold text-gold text-sm shrink-0">
              {REVIEWER.initials}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-white text-sm truncate">{REVIEWER.name}, {REVIEWER.credentials}</p>
              <p className="text-xs text-white/35 truncate">{REVIEWER.specialty}</p>
            </div>
          </div>

          {/* Brief summary */}
          <div className="rounded-2xl border border-white/10 bg-white/3 p-5 flex-1">
            <p className="text-xs text-white/25 uppercase tracking-widest mb-4">Brief Summary</p>
            <div className="space-y-4">
              <div>
                <p className="text-xs text-white/25 mb-1">Recommendation</p>
                <p className="text-lg font-bold text-green-400">{BRIEF.recommendation}</p>
              </div>
              <div>
                <p className="text-xs text-white/25 mb-1">Criteria</p>
                <p className="text-sm font-medium text-white">{BRIEF.criteriaCount}/{BRIEF.criteriaCount} met</p>
              </div>
              <div>
                <p className="text-xs text-white/25 mb-1">Verification</p>
                <p className="text-sm font-medium text-white">{BRIEF.score}/100</p>
              </div>
              <div>
                <p className="text-xs text-white/25 mb-1">Guidelines</p>
                <p className="text-xs text-white/55">{BRIEF.guideline} · {BRIEF.guidelineDetail}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Right col: determination form */}
        <div className="col-span-3 flex flex-col gap-4">
          {/* Determination buttons */}
          <div>
            <p className="text-xs text-white/30 uppercase tracking-widest mb-2">Determination</p>
            <div className="grid grid-cols-3 gap-2.5">
              {determinations.map(d => (
                <button
                  key={d.det}
                  onClick={() => setSelected(d.det)}
                  className={`rounded-xl border py-3 text-xs font-semibold transition-all ${
                    selected === d.det ? d.selected : d.color
                  }`}
                >
                  {d.label}
                </button>
              ))}
            </div>
          </div>

          {/* Rationale */}
          <div className="flex-1 flex flex-col">
            <p className="text-xs text-white/30 uppercase tracking-widest mb-2">Clinical Rationale</p>
            <textarea
              value={rationale}
              onChange={e => setRationale(e.target.value)}
              placeholder="Confirm or supplement the clinical reasoning from the brief…"
              className="flex-1 min-h-[120px] bg-white/3 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-white/18 focus:outline-none focus:border-gold/40 resize-none"
            />
          </div>

          {/* Submit */}
          {selected && rationale.length > 5 && (
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="w-full py-3.5 rounded-2xl bg-gold text-navy font-bold text-sm hover:bg-amber-400 transition-all disabled:opacity-60"
            >
              {submitting ? 'Submitting determination…' : `Submit: ${selected.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Scene: Delivered ──────────────────────────────────────────────────────────

function DeliveredScene({ onRestart }: { onRestart: () => void }) {
  return (
    <div className="flex flex-col h-full px-8 py-6">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-green-500/10 border border-green-500/20 mb-2">
            <div className="w-1.5 h-1.5 rounded-full bg-green-400" />
            <span className="text-xs text-green-300 font-medium">Determination Delivered · 9:08 AM</span>
          </div>
          <h2 className="text-2xl font-bold text-white">Done. In 4 minutes.</h2>
          <p className="text-white/35 text-sm mt-0.5">TPA notified. Audit trail complete. SLA consumed: 0.1%.</p>
        </div>
        <div className="text-right">
          <p className="text-4xl font-bold text-green-400">APPROVED</p>
          <p className="text-xs text-white/30 mt-1">{CASE.patient} · {CASE.procedure}</p>
        </div>
      </div>

      <div className="flex-1 grid grid-cols-5 gap-4">
        {/* Left: stats */}
        <div className="col-span-2 flex flex-col gap-3">
          <StatCard label="Total Time" value="4m 19s" sub="Portal to determination" gold />
          <StatCard label="SLA Consumed" value="0.1%" sub="of 48h contracted SLA" />
          <StatCard label="Time Saved" value="96%" sub="vs traditional UM process" />
          <StatCard label="Audit Ready" value="100%" sub="Full trail preserved" />
        </div>

        {/* Right: audit trail + actions */}
        <div className="col-span-3 flex flex-col gap-4">
          <div className="rounded-2xl border border-white/8 bg-white/3 p-5 flex-1">
            <p className="text-xs text-white/25 uppercase tracking-widest mb-4">Audit Trail</p>
            <div className="space-y-2.5">
              {TIMELINE.map((row, i) => (
                <div key={i} className="flex items-start gap-3 text-sm">
                  <span className="text-white/25 font-mono text-xs w-[88px] shrink-0 mt-0.5">{row.time}</span>
                  <span className="text-white/55 flex-1 leading-relaxed">{row.event}</span>
                  <span className="text-white/20 text-xs shrink-0 ml-2">{row.actor}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="flex gap-3">
            <button
              onClick={onRestart}
              className="flex-1 py-3 rounded-2xl border border-white/10 text-white/45 text-sm font-medium hover:bg-white/5 hover:text-white/70 transition-all"
            >
              ↺ Watch again
            </button>
            <button
              onClick={onRestart}
              className="flex-1 py-3 rounded-2xl bg-gold text-navy font-bold text-sm hover:bg-amber-400 transition-all"
            >
              See it with a different case →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Scene progress bar ────────────────────────────────────────────────────────

const SCENE_LABELS: Record<SceneId, string> = {
  splash: 'Intro',
  intake: 'Case In',
  analysis: 'Analysis',
  brief: 'Brief',
  physician: 'Decision',
  delivered: 'Delivered',
};

// ── Main page ─────────────────────────────────────────────────────────────────

export default function DemoRecordPage() {
  const [sceneIdx, setSceneIdx] = useState(0);
  const currentScene = SCENES[sceneIdx];

  const next = useCallback(() => {
    setSceneIdx(i => Math.min(i + 1, SCENES.length - 1));
  }, []);

  const restart = useCallback(() => {
    setSceneIdx(0);
  }, []);

  // Auto-advance for scenes with a duration
  useEffect(() => {
    if (currentScene.duration > 0) {
      const t = setTimeout(next, currentScene.duration);
      return () => clearTimeout(t);
    }
  }, [currentScene, next]);

  const scenes: Record<SceneId, React.ReactNode> = {
    splash: <SplashScene onNext={next} />,
    intake: <IntakeScene onNext={next} />,
    analysis: <AnalysisScene onComplete={next} />,
    brief: <BriefScene onNext={next} />,
    physician: <PhysicianScene onNext={next} />,
    delivered: <DeliveredScene onRestart={restart} />,
  };

  return (
    <div
      className="bg-[#060d18] text-white font-[family-name:var(--font-dm-sans)] overflow-hidden"
      style={{ width: '100vw', height: '100vh', maxHeight: '100vh' }}
    >
      {/* ── Chrome: Header ── */}
      <header className="flex items-center justify-between px-8 py-3 border-b border-white/6 bg-[#060d18]">
        {/* Wordmark */}
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-navy border border-gold/30 flex items-center justify-center font-bold text-gold text-xs">V</div>
          <span className="text-sm font-semibold text-white tracking-tight">VantaUM</span>
          <span className="text-[11px] text-white/20 ml-1 hidden sm:inline">Concierge Utilization Management</span>
        </div>

        {/* Scene progress */}
        <div className="flex items-center gap-1.5">
          {SCENES.map((s, i) => (
            <div key={s.id} className="flex items-center gap-1.5">
              <div className={`h-1.5 rounded-full transition-all duration-500 ${
                i === sceneIdx ? 'w-8 bg-gold' : i < sceneIdx ? 'w-4 bg-gold/40' : 'w-4 bg-white/10'
              }`} />
              {i === sceneIdx && (
                <span className="text-[10px] text-white/35 uppercase tracking-widest hidden lg:inline">
                  {SCENE_LABELS[s.id]}
                </span>
              )}
            </div>
          ))}
          <span className="text-[10px] text-white/20 ml-2">{sceneIdx + 1}/{SCENES.length}</span>
        </div>

        {/* Live badge */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/5 border border-white/8">
            <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
            <span className="text-[11px] text-white/40">Live</span>
          </div>
          <button
            onClick={restart}
            className="text-[11px] text-white/20 hover:text-white/45 transition-colors px-2 py-1 rounded-lg hover:bg-white/5"
          >
            Restart
          </button>
        </div>
      </header>

      {/* ── Scene content ── */}
      <div
        key={currentScene.id}
        className="animate-fade-in"
        style={{ height: 'calc(100vh - 53px)', overflow: 'hidden' }}
      >
        {scenes[currentScene.id]}
      </div>
    </div>
  );
}
