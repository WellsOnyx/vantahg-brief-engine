'use client';

/**
 * /demo-tour — VantaUM Guided Interactive Demo
 *
 * Purpose: Live prospect calls (Mohammed, future TPAs).
 * Design: No AppShell, no nav, no vendor names. Pure VantaUM.
 * Story: Authorization comes in → system handles it → physician decides → TPA sees it.
 *        Under the hood is invisible. What they see is: it just works.
 */

import { useState, useEffect, useRef } from 'react';
import type { Determination } from '@/lib/types';
import { demoCases, demoReviewers, DEMO_REVIEWER_IDS, DEMO_CASE_IDS, DEMO_CLIENT_IDS } from '@/lib/demo-data';

// ── The single case we walk through ──────────────────────────────────────────
const HERO_CASE = demoCases.find(c => c.id === DEMO_CASE_IDS.mriLumbar)!;
const REVIEWER = demoReviewers.find(r => r.id === DEMO_REVIEWER_IDS.patel)!;

// ── Tour steps ────────────────────────────────────────────────────────────────
const TOUR_STEPS = [
  {
    id: 'intake',
    title: 'Authorization request received',
    subtitle: 'Submitted via secure provider portal · 9:04 AM',
    tip: 'Every prior auth request — fax, portal, or API — lands here automatically. No manual data entry.',
  },
  {
    id: 'analysis',
    title: 'VantaUM analyzes the case',
    subtitle: 'Clinical brief being prepared…',
    tip: 'VantaUM reads the clinical documentation, matches it against the applicable evidence-based criteria, and builds a structured brief — before a human ever looks at it.',
  },
  {
    id: 'brief',
    title: 'Clinical brief ready',
    subtitle: 'Criteria assessment complete · 9:06 AM',
    tip: 'The brief surfaces exactly what the physician needs: criteria met, criteria gaps, documentation quality. No reading through 40 pages of records.',
  },
  {
    id: 'decision',
    title: 'Physician reviews and decides',
    subtitle: 'Dr. Priya Patel · Orthopedic Surgery',
    tip: 'The physician reads the brief, confirms the reasoning, and submits their determination. Average time: under 8 minutes. VantaUM handles everything else.',
  },
  {
    id: 'delivered',
    title: 'Determination delivered',
    subtitle: 'Southwest Administrators notified · 9:08 AM',
    tip: 'The TPA sees the decision instantly. Full audit trail. HIPAA-compliant. SLA: 48 hours. Actual turnaround: 4 minutes.',
  },
];

// ── Formatters ────────────────────────────────────────────────────────────────
function AnimatedNumber({ value, duration = 1200 }: { value: number; duration?: number }) {
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    let start = 0;
    const step = value / (duration / 16);
    const t = setInterval(() => {
      start += step;
      if (start >= value) { setDisplay(value); clearInterval(t); }
      else setDisplay(Math.floor(start));
    }, 16);
    return () => clearInterval(t);
  }, [value, duration]);
  return <>{display.toLocaleString()}</>;
}

function StreamingText({ text, active, speed = 6 }: { text: string; active: boolean; speed?: number }) {
  const [displayed, setDisplayed] = useState('');
  const [done, setDone] = useState(false);
  useEffect(() => {
    if (!active) { setDisplayed(''); setDone(false); return; }
    setDisplayed(''); setDone(false);
    let i = 0;
    const interval = setInterval(() => {
      i += speed;
      if (i >= text.length) { setDisplayed(text); setDone(true); clearInterval(interval); }
      else setDisplayed(text.slice(0, i));
    }, 16);
    return () => clearInterval(interval);
  }, [text, active, speed]);
  return (
    <span>
      {displayed}
      {active && !done && <span className="inline-block w-1 h-3 bg-gold/80 animate-pulse ml-0.5 align-middle" />}
    </span>
  );
}

function ProgressRing({ pct, size = 48, stroke = 4, color = '#c9a227' }: { pct: number; size?: number; stroke?: number; color?: string }) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} className="-rotate-90">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={stroke} />
      <circle
        cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke}
        strokeDasharray={circ} strokeDashoffset={circ * (1 - pct / 100)}
        strokeLinecap="round" style={{ transition: 'stroke-dashoffset 0.8s ease' }}
      />
    </svg>
  );
}

// ── Stat card ─────────────────────────────────────────────────────────────────
function Stat({ label, value, sub, highlight = false }: { label: string; value: string; sub?: string; highlight?: boolean }) {
  return (
    <div className={`rounded-2xl border p-5 flex flex-col gap-1 ${highlight ? 'border-gold/30 bg-gold/5' : 'border-white/8 bg-white/3'}`}>
      <p className="text-xs text-white/35 uppercase tracking-widest">{label}</p>
      <p className={`text-3xl font-bold tabular-nums ${highlight ? 'text-gold' : 'text-white'}`}>{value}</p>
      {sub && <p className="text-xs text-white/30">{sub}</p>}
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function DemoTourPage() {
  const [step, setStep] = useState(0);
  const [decision, setDecision] = useState<Determination | null>(null);
  const [rationale, setRationale] = useState('');
  const [deciding, setDeciding] = useState(false);
  const [decided, setDecided] = useState(false);
  const [showTip, setShowTip] = useState(true);
  const [analysisProgress, setAnalysisProgress] = useState(0);
  const briefRef = useRef<HTMLDivElement>(null);

  const currentStep = TOUR_STEPS[step];
  const brief = HERO_CASE.ai_brief;
  const aiRec = brief?.ai_recommendation;
  const criteria = brief?.criteria_match;

  // Analysis animation
  useEffect(() => {
    if (step !== 1) { setAnalysisProgress(0); return; }
    setAnalysisProgress(0);
    let p = 0;
    const t = setInterval(() => {
      p += 1.4;
      setAnalysisProgress(Math.min(100, p));
      if (p >= 100) { clearInterval(t); setTimeout(() => setStep(2), 600); }
    }, 30);
    return () => clearInterval(t);
  }, [step]);

  function handleDecide() {
    if (!decision || !rationale.trim()) return;
    setDeciding(true);
    setTimeout(() => { setDeciding(false); setDecided(true); setStep(4); }, 1400);
  }

  function restart() {
    setStep(0); setDecision(null); setRationale(''); setDeciding(false);
    setDecided(false); setAnalysisProgress(0);
  }

  const stepColors = ['blue', 'yellow', 'purple', 'gold', 'green'];

  return (
    <div className="min-h-screen bg-[#060d18] text-white font-[family-name:var(--font-dm-sans)] overflow-x-hidden">

      {/* ── Header ── */}
      <header className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-8 py-4 bg-[#060d18]/90 backdrop-blur-sm border-b border-white/5">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-navy border border-gold/30 flex items-center justify-center font-bold text-gold text-sm">V</div>
          <span className="text-sm font-semibold text-white tracking-tight">VantaUM</span>
          <span className="text-xs text-white/25 ml-1">Concierge Utilization Management</span>
        </div>

        {/* Step indicator */}
        <div className="flex items-center gap-2">
          {TOUR_STEPS.map((s, i) => (
            <button
              key={s.id}
              onClick={() => { if (i < step || step === 4) setStep(i); }}
              className={`transition-all ${
                i === step
                  ? 'w-6 h-2 rounded-full bg-gold'
                  : i < step
                    ? 'w-2 h-2 rounded-full bg-gold/40 hover:bg-gold/60'
                    : 'w-2 h-2 rounded-full bg-white/10'
              }`}
            />
          ))}
          <span className="text-xs text-white/25 ml-2">{step + 1} of {TOUR_STEPS.length}</span>
        </div>

        <button
          onClick={restart}
          className="text-xs text-white/25 hover:text-white/50 transition-colors px-3 py-1.5 rounded-lg hover:bg-white/5"
        >
          Restart demo
        </button>
      </header>

      <main className="pt-20 pb-16 max-w-5xl mx-auto px-6">

        {/* ── Step label ── */}
        <div className="text-center mb-10 animate-fade-in" key={step}>
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 border border-white/10 mb-4">
            <div className="w-1.5 h-1.5 rounded-full bg-gold animate-pulse" />
            <span className="text-xs text-white/50 uppercase tracking-widest">Step {step + 1} of {TOUR_STEPS.length}</span>
          </div>
          <h1 className="text-3xl font-bold text-white mb-2">{currentStep.title}</h1>
          <p className="text-white/40 text-sm">{currentStep.subtitle}</p>
        </div>

        {/* ── STEP 0: Intake ── */}
        {step === 0 && (
          <div className="animate-fade-in space-y-6">
            <div className="rounded-2xl border border-white/10 bg-white/3 p-8">
              <div className="flex items-start justify-between mb-6">
                <div>
                  <p className="text-xs text-white/30 uppercase tracking-widest mb-1">Prior Authorization Request</p>
                  <h2 className="text-xl font-bold text-white">{HERO_CASE.patient_name}</h2>
                  <p className="text-white/50 text-sm mt-0.5">{HERO_CASE.procedure_description}</p>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <span className="px-3 py-1 rounded-full bg-blue-500/15 border border-blue-500/20 text-blue-300 text-xs font-medium">Received</span>
                  <span className="text-xs text-white/25">9:04:12 AM</span>
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                  { label: 'CPT Code', value: HERO_CASE.procedure_codes?.[0] ?? '72148', mono: true },
                  { label: 'ICD-10', value: HERO_CASE.diagnosis_codes?.[0] ?? 'M51.16', mono: true },
                  { label: 'Provider', value: HERO_CASE.requesting_provider ?? 'Dr. Chen' },
                  { label: 'Priority', value: HERO_CASE.priority?.toUpperCase() ?? 'STANDARD' },
                  { label: 'Payer', value: HERO_CASE.payer_name ?? 'Southwest Administrators' },
                  { label: 'Review Type', value: 'Prior Authorization' },
                  { label: 'Submitted via', value: 'Provider Portal' },
                  { label: 'SLA', value: '48 hours' },
                ].map(row => (
                  <div key={row.label}>
                    <p className="text-xs text-white/25">{row.label}</p>
                    <p className={`text-sm font-medium text-white mt-0.5 ${row.mono ? 'font-mono' : ''}`}>{row.value}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Clinical question */}
            <div className="rounded-2xl border border-white/10 bg-white/3 p-6">
              <p className="text-xs text-white/30 uppercase tracking-widest mb-3">Clinical Question</p>
              <p className="text-white/70 leading-relaxed">{brief?.clinical_question ?? 'Is lumbar spine MRI without contrast medically necessary for this patient with persistent low back pain and left leg radiculopathy unresponsive to 6 weeks of conservative therapy?'}</p>
            </div>

            <button
              onClick={() => setStep(1)}
              className="w-full py-4 rounded-2xl bg-gold text-navy font-bold text-base hover:bg-gold-light transition-all"
            >
              VantaUM analyzes this case →
            </button>
          </div>
        )}

        {/* ── STEP 1: Analysis ── */}
        {step === 1 && (
          <div className="animate-fade-in">
            <div className="rounded-2xl border border-white/10 bg-white/3 p-10 flex flex-col items-center gap-8">
              <div className="relative">
                <ProgressRing pct={analysisProgress} size={120} stroke={6} />
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-2xl font-bold tabular-nums text-white">{Math.round(analysisProgress)}%</span>
                </div>
              </div>

              <div className="w-full max-w-md space-y-3">
                {[
                  { label: 'Reading clinical documentation', done: analysisProgress > 15 },
                  { label: 'Extracting diagnosis & procedure codes', done: analysisProgress > 30 },
                  { label: 'Matching against evidence-based criteria', done: analysisProgress > 55 },
                  { label: 'Evaluating documentation completeness', done: analysisProgress > 72 },
                  { label: 'Generating structured clinical brief', done: analysisProgress > 88 },
                  { label: 'Running independent verification pass', done: analysisProgress > 96 },
                ].map((item, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center transition-all duration-300 ${
                      item.done ? 'border-gold bg-gold/20' : 'border-white/15 bg-transparent'
                    }`}>
                      {item.done && <div className="w-1.5 h-1.5 rounded-full bg-gold" />}
                    </div>
                    <span className={`text-sm transition-colors duration-300 ${item.done ? 'text-white/70' : 'text-white/20'}`}>
                      {item.label}
                    </span>
                  </div>
                ))}
              </div>

              <p className="text-xs text-white/20 text-center">Preparing clinical brief — no action required</p>
            </div>
          </div>
        )}

        {/* ── STEP 2: Brief ready ── */}
        {step === 2 && (
          <div className="animate-fade-in space-y-5" ref={briefRef}>
            {/* AI recommendation */}
            <div className="rounded-2xl border border-green-500/20 bg-green-500/5 p-6">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs text-white/30 uppercase tracking-widest">Assessment</p>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-white/25">Confidence</span>
                  <span className="px-2 py-0.5 rounded-full bg-green-500/20 text-green-400 text-xs font-medium">
                    {aiRec?.confidence ?? 'High'}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-3 mb-3">
                <span className="text-2xl font-bold text-green-400 uppercase">
                  {(aiRec?.recommendation ?? 'approve').replace(/_/g, ' ')}
                </span>
              </div>
              <p className="text-sm text-white/60 leading-relaxed">
                <StreamingText text={aiRec?.rationale ?? 'Medical necessity criteria are met. Patient presents with persistent lumbar radiculopathy unresponsive to 6 weeks of conservative management. MRI is appropriate to evaluate for disc herniation, stenosis, or other structural pathology prior to considering interventional therapy.'} active={step === 2} speed={5} />
              </p>
            </div>

            {/* Criteria match */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="rounded-2xl border border-green-500/15 bg-white/3 p-5">
                <p className="text-xs text-green-400 uppercase tracking-widest mb-3">
                  Criteria Met ({criteria?.criteria_met?.length ?? 6})
                </p>
                <ul className="space-y-1.5">
                  {(criteria?.criteria_met ?? [
                    'Persistent radicular symptoms ≥6 weeks',
                    'Failed conservative management documented',
                    'Neurological deficit present',
                    'No recent imaging on file',
                    'Appropriate clinical setting (outpatient)',
                    'Ordering physician appropriate specialty',
                  ]).map((c: string, i: number) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-white/60">
                      <span className="text-green-400 shrink-0 mt-0.5">✓</span>{c}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="space-y-4">
                {/* Verification score */}
                <div className="rounded-2xl border border-white/8 bg-white/3 p-5">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-xs text-white/30 uppercase tracking-widest">Verification Score</p>
                    <span className="text-xl font-bold text-white tabular-nums">
                      {HERO_CASE.fact_check?.overall_score ?? 96}/100
                    </span>
                  </div>
                  <div className="h-2 bg-white/8 rounded-full overflow-hidden">
                    <div className="h-full bg-green-400 rounded-full" style={{ width: `${HERO_CASE.fact_check?.overall_score ?? 96}%`, transition: 'width 1s ease' }} />
                  </div>
                  <p className="text-xs text-white/25 mt-2">All claims independently verified</p>
                </div>

                {/* Guideline */}
                <div className="rounded-2xl border border-white/8 bg-white/3 p-5">
                  <p className="text-xs text-white/30 uppercase tracking-widest mb-2">Criteria Source</p>
                  <p className="text-white font-medium text-sm">{criteria?.guideline_source ?? 'InterQual'}</p>
                  <p className="text-white/40 text-xs mt-0.5">{criteria?.applicable_guideline ?? 'Musculoskeletal — Spine Imaging Criteria v2024'}</p>
                </div>

                {/* Timing */}
                <div className="rounded-2xl border border-white/8 bg-white/3 p-5">
                  <p className="text-xs text-white/30 uppercase tracking-widest mb-2">Time to Brief</p>
                  <p className="text-2xl font-bold text-gold tabular-nums">1m 47s</p>
                  <p className="text-white/25 text-xs mt-0.5">vs 4–6 hours manual review</p>
                </div>
              </div>
            </div>

            <button
              onClick={() => setStep(3)}
              className="w-full py-4 rounded-2xl bg-gold text-navy font-bold text-base hover:bg-gold-light transition-all"
            >
              Send to physician for review →
            </button>
          </div>
        )}

        {/* ── STEP 3: Physician decision ── */}
        {step === 3 && (
          <div className="animate-fade-in space-y-5">
            {/* Reviewer card */}
            <div className="rounded-2xl border border-white/10 bg-white/3 p-5 flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-navy border border-white/10 flex items-center justify-center font-bold text-gold text-base shrink-0">
                {REVIEWER.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
              </div>
              <div className="flex-1">
                <p className="font-semibold text-white">{REVIEWER.name}, {REVIEWER.credentials}</p>
                <p className="text-xs text-white/40">{REVIEWER.specialty} · {REVIEWER.board_certifications?.[0]}</p>
                <p className="text-xs text-white/25 mt-0.5">Licensed: {REVIEWER.license_state?.join(', ')}</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-white/30">Cases reviewed</p>
                <p className="text-xl font-bold text-white tabular-nums">{REVIEWER.cases_completed.toLocaleString()}</p>
                <p className="text-xs text-white/25">Avg {REVIEWER.avg_turnaround_hours}h turnaround</p>
              </div>
            </div>

            {/* Brief summary for physician */}
            <div className="rounded-2xl border border-white/10 bg-white/3 p-5">
              <p className="text-xs text-white/30 uppercase tracking-widest mb-4">Case Brief Summary</p>
              <div className="grid grid-cols-3 gap-4 text-sm">
                <div>
                  <p className="text-white/30 text-xs mb-1">Recommendation</p>
                  <p className="font-bold text-green-400 uppercase">{(aiRec?.recommendation ?? 'approve').replace(/_/g, ' ')}</p>
                </div>
                <div>
                  <p className="text-white/30 text-xs mb-1">Criteria</p>
                  <p className="font-medium text-white">{criteria?.criteria_met?.length ?? 6}/6 met</p>
                </div>
                <div>
                  <p className="text-white/30 text-xs mb-1">Verification</p>
                  <p className="font-medium text-white">{HERO_CASE.fact_check?.overall_score ?? 96}/100</p>
                </div>
              </div>
            </div>

            {!decided && (
              <>
                {/* Decision buttons */}
                <div>
                  <p className="text-xs text-white/30 uppercase tracking-widest mb-3">Physician Determination</p>
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { det: 'approve' as Determination, label: 'Approve', color: decision === 'approve' ? 'bg-green-500/20 border-green-500/40 text-green-300' : 'border-white/10 text-white/40 hover:border-white/25 hover:text-white' },
                      { det: 'deny' as Determination, label: 'Deny', color: decision === 'deny' ? 'bg-red-500/20 border-red-500/40 text-red-300' : 'border-white/10 text-white/40 hover:border-white/25 hover:text-white' },
                      { det: 'pend' as Determination, label: 'Request More Info', color: decision === 'pend' ? 'bg-orange-500/20 border-orange-500/40 text-orange-300' : 'border-white/10 text-white/40 hover:border-white/25 hover:text-white' },
                      { det: 'partial_approve' as Determination, label: 'Partial Approval', color: decision === 'partial_approve' ? 'bg-yellow-500/20 border-yellow-500/40 text-yellow-300' : 'border-white/10 text-white/40 hover:border-white/25 hover:text-white' },
                      { det: 'modify' as Determination, label: 'Approve w/ Mods', color: decision === 'modify' ? 'bg-teal-500/20 border-teal-500/40 text-teal-300' : 'border-white/10 text-white/40 hover:border-white/25 hover:text-white' },
                      { det: 'peer_to_peer_requested' as Determination, label: 'Request P2P', color: decision === 'peer_to_peer_requested' ? 'bg-purple-500/20 border-purple-500/40 text-purple-300' : 'border-white/10 text-white/40 hover:border-white/25 hover:text-white' },
                    ].map(d => (
                      <button key={d.det} onClick={() => setDecision(d.det)} className={`rounded-xl border py-3 text-sm font-medium transition-all ${d.color}`}>
                        {d.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <p className="text-xs text-white/30 uppercase tracking-widest mb-2">Clinical Rationale</p>
                  <textarea
                    value={rationale}
                    onChange={e => setRationale(e.target.value)}
                    placeholder="Confirm or document your clinical reasoning…"
                    rows={3}
                    className="w-full bg-white/4 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-white/20 focus:outline-none focus:border-gold/40 resize-none"
                  />
                </div>

                {decision && rationale.length > 8 && (
                  <button
                    onClick={handleDecide}
                    disabled={deciding}
                    className="w-full py-4 rounded-2xl bg-gold text-navy font-bold text-base hover:bg-gold-light transition-all disabled:opacity-60"
                  >
                    {deciding ? 'Submitting determination…' : `Submit: ${decision === 'approve' ? 'Approve this request' : decision.replace(/_/g, ' ')}`}
                  </button>
                )}
              </>
            )}
          </div>
        )}

        {/* ── STEP 4: Delivered ── */}
        {step === 4 && (
          <div className="animate-fade-in space-y-6">
            {/* Hero result */}
            <div className="rounded-2xl border border-green-500/25 bg-green-500/5 p-8 text-center">
              <div className="w-16 h-16 rounded-full bg-green-500/15 border border-green-500/25 flex items-center justify-center mx-auto mb-4">
                <span className="text-3xl">✓</span>
              </div>
              <p className="text-xs text-white/30 uppercase tracking-widest mb-2">Authorization Determination</p>
              <p className="text-4xl font-bold text-green-400 mb-2">{(decision ?? 'approve').replace(/_/g, ' ').toUpperCase()}</p>
              <p className="text-white/50 text-sm">Southwest Administrators notified · HIPAA-compliant delivery</p>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Stat label="Total Time" value="4m 12s" sub="Portal to determination" highlight />
              <Stat label="SLA Consumed" value="0.1%" sub="of 48h contracted SLA" />
              <Stat label="Time Saved" value="96%" sub="vs traditional review" />
              <Stat label="Audit Ready" value="100%" sub="Full trail logged" />
            </div>

            {/* Audit trail */}
            <div className="rounded-2xl border border-white/8 bg-white/3 p-5">
              <p className="text-xs text-white/30 uppercase tracking-widest mb-4">Audit Trail</p>
              <div className="space-y-2">
                {[
                  { time: '9:04:12', event: 'Authorization request received via provider portal', actor: 'System' },
                  { time: '9:04:15', event: 'Case created and assigned to review pod', actor: 'System' },
                  { time: '9:05:42', event: 'Clinical brief generated and verified', actor: 'VantaUM' },
                  { time: '9:06:01', event: `Brief assigned to ${REVIEWER.name}`, actor: 'System' },
                  { time: '9:08:24', event: `Determination: ${(decision ?? 'APPROVE').toUpperCase()} — ${rationale || 'Medical necessity criteria met per applicable guidelines.'}`, actor: REVIEWER.name },
                  { time: '9:08:25', event: 'Determination delivered to Southwest Administrators', actor: 'System' },
                ].map((row, i) => (
                  <div key={i} className="flex items-start gap-3 text-sm">
                    <span className="text-white/25 font-mono text-xs w-14 shrink-0 mt-0.5">{row.time}</span>
                    <span className="text-white/60 flex-1">{row.event}</span>
                    <span className="text-white/25 text-xs shrink-0">{row.actor}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={restart}
                className="flex-1 py-3 rounded-2xl border border-white/10 text-white/50 font-medium hover:bg-white/5 hover:text-white transition-all"
              >
                ↺ Run demo again
              </button>
              <button
                onClick={() => setStep(0)}
                className="flex-1 py-3 rounded-2xl bg-gold text-navy font-bold hover:bg-gold-light transition-all"
              >
                Try a different scenario →
              </button>
            </div>
          </div>
        )}

        {/* ── Tooltip ── */}
        {showTip && step < 4 && (
          <div className="fixed bottom-8 left-1/2 -translate-x-1/2 max-w-lg w-full px-4">
            <div className="bg-navy-light border border-white/10 rounded-2xl p-4 shadow-2xl flex items-start gap-3">
              <div className="w-2 h-2 rounded-full bg-gold mt-1.5 shrink-0 animate-pulse" />
              <p className="text-sm text-white/60 leading-relaxed">{currentStep.tip}</p>
              <button onClick={() => setShowTip(false)} className="text-white/20 hover:text-white/40 shrink-0 text-lg leading-none">×</button>
            </div>
          </div>
        )}
        {!showTip && step < 4 && (
          <button
            onClick={() => setShowTip(true)}
            className="fixed bottom-8 right-8 w-10 h-10 rounded-full bg-navy-light border border-white/10 text-white/30 hover:text-white/60 text-sm transition-all"
          >
            ?
          </button>
        )}
      </main>
    </div>
  );
}
