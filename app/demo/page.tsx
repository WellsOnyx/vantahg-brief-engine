'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

// ============================================================================
// Demo data — embedded directly so this page is fully self-contained
// ============================================================================

const DEMO_CASE = {
  case_number: 'VUM-2026-004821',
  patient_name: 'Maria Santos',
  patient_dob: '03/15/1968',
  patient_member_id: 'SWA-2026-88421',
  requesting_provider: 'Dr. Sarah Chen, MD',
  requesting_provider_specialty: 'Family Medicine',
  payer_name: 'Southwest Administrators',
  procedure_codes: ['72148'],
  procedure_description: 'MRI Lumbar Spine without Contrast',
  diagnosis_codes: ['M54.5', 'M54.16'],
  clinical_question:
    'Is MRI of the lumbar spine without contrast (CPT 72148) medically necessary for this patient presenting with progressive low back pain and left lower extremity radiculopathy refractory to conservative management?',
  service_category: 'Imaging',
  review_type: 'Prior Authorization',
  priority: 'Standard',
};

const BRIEF_SECTIONS = [
  {
    id: 'patient_summary',
    title: 'Patient Summary',
    icon: '🏥',
    content:
      'Maria Santos is a 52-year-old female presenting with 8 weeks of progressive low back pain radiating to the left lower extremity in an L5 dermatomal distribution. She has completed 6 weeks of physical therapy, a trial of NSAIDs (naproxen 500mg BID), and activity modification without meaningful improvement. Physical examination demonstrates a positive straight leg raise test on the left at 40 degrees with diminished sensation in the L5 dermatome.',
  },
  {
    id: 'diagnosis',
    title: 'Diagnosis Analysis',
    icon: '🔬',
    content:
      'M54.5 — Low back pain  |  M54.16 — Radiculopathy, lumbar region\n\nDiagnosis codes are consistent with the requested imaging study. Low back pain with radiculopathy in a specific dermatomal distribution supports the clinical need for advanced imaging to evaluate for structural pathology.',
  },
  {
    id: 'procedure',
    title: 'Procedure Analysis',
    icon: '📋',
    content:
      '72148 — MRI lumbar spine without contrast\n\nComplexity: Routine  |  Setting: Outpatient imaging center\n\nThe requesting provider has documented an 8-week course of progressive lumbar radiculopathy with failure of conservative management. The clinical examination findings support a radicular etiology that warrants advanced imaging.',
  },
  {
    id: 'criteria',
    title: 'Criteria Match',
    icon: '✅',
    badges: [
      { label: 'InterQual / ACR', type: 'source' },
      { label: '6 of 6 Met', type: 'met' },
      { label: '0 Not Met', type: 'clear' },
    ],
    criteria_met: [
      'Duration of symptoms exceeds 6 weeks with progressive radiculopathy',
      'Failure of conservative management documented: PT x 6 weeks, NSAIDs, activity modification',
      'Objective neurological findings present: positive straight leg raise, L5 dermatomal sensory deficit',
      'No prior advanced imaging of the lumbar spine for this episode of care',
      'Clinical presentation consistent with radiculopathy in a specific dermatomal pattern (L5)',
      'Red flag symptoms have been appropriately screened and are absent',
    ],
    content: '',
  },
  {
    id: 'documentation',
    title: 'Documentation Review',
    icon: '📄',
    content:
      'Documents provided: Clinical notes, lumbar spine X-ray report, physical therapy summary, medication history, letter of medical necessity\n\nKey finding: Physical therapy summary documents 12 sessions over 6 weeks with minimal improvement in pain scores (VAS 7/10 → 6/10) and persistent radicular symptoms.',
    missing: ['Detailed physical therapy notes (only summary provided)'],
  },
  {
    id: 'recommendation',
    title: 'AI Recommendation',
    icon: '🤖',
    recommendation: 'APPROVE',
    confidence: 'High',
    rationale:
      'All InterQual criteria for lumbar spine MRI are met. The patient has progressive radiculopathy with objective neurological findings that has persisted beyond 6 weeks despite documented conservative management. Advanced imaging is appropriate to guide further treatment decisions.',
    content: '',
  },
];

const REVIEWER = {
  name: 'Dr. James Richardson',
  credentials: 'MD, FACP',
  specialty: 'Internal Medicine / Pulmonology',
};

// ============================================================================
// Step components
// ============================================================================

function StepIndicator({ step, total }: { step: number; total: number }) {
  const labels = ['Case Intake', 'AI Brief Generation', 'Physician Review', 'Determination'];
  return (
    <div className="flex items-center justify-center gap-1 sm:gap-2 mb-8">
      {labels.map((label, i) => (
        <div key={label} className="flex items-center">
          <div className="flex flex-col items-center">
            <div
              className={`w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center text-sm font-bold transition-all duration-500 ${
                i < step
                  ? 'bg-[#c9a227] text-[#0c2340]'
                  : i === step
                    ? 'bg-[#0c2340] text-white ring-4 ring-[#c9a227]/30'
                    : 'bg-gray-200 text-gray-400'
              }`}
            >
              {i < step ? '✓' : i + 1}
            </div>
            <span
              className={`text-[10px] sm:text-xs mt-1 font-medium whitespace-nowrap ${
                i <= step ? 'text-[#0c2340]' : 'text-gray-400'
              }`}
            >
              {label}
            </span>
          </div>
          {i < total - 1 && (
            <div
              className={`w-6 sm:w-12 h-0.5 mx-1 sm:mx-2 mb-4 transition-all duration-500 ${
                i < step ? 'bg-[#c9a227]' : 'bg-gray-200'
              }`}
            />
          )}
        </div>
      ))}
    </div>
  );
}

function CaseIntakeStep({ onNext }: { onNext: () => void }) {
  const [filled, setFilled] = useState(0);
  const fields = [
    { label: 'Patient Name', value: DEMO_CASE.patient_name },
    { label: 'Date of Birth', value: DEMO_CASE.patient_dob },
    { label: 'Member ID', value: DEMO_CASE.patient_member_id },
    { label: 'Requesting Provider', value: DEMO_CASE.requesting_provider },
    { label: 'Procedure Code', value: `CPT ${DEMO_CASE.procedure_codes[0]} — ${DEMO_CASE.procedure_description}` },
    { label: 'Diagnosis', value: `${DEMO_CASE.diagnosis_codes.join(', ')} — Low back pain, Radiculopathy` },
    { label: 'Payer', value: DEMO_CASE.payer_name },
    { label: 'Review Type', value: DEMO_CASE.review_type },
  ];

  useEffect(() => {
    if (filled < fields.length) {
      const timer = setTimeout(() => setFilled((f) => f + 1), 400);
      return () => clearTimeout(timer);
    }
  }, [filled, fields.length]);

  return (
    <div className="space-y-6">
      <div className="text-center mb-6">
        <p className="text-[#0c2340]/60 text-sm">
          Case <span className="font-mono font-bold text-[#0c2340]">{DEMO_CASE.case_number}</span> received via portal
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {fields.map((field, i) => (
          <div
            key={field.label}
            className={`bg-white rounded-xl border p-4 transition-all duration-500 ${
              i < filled
                ? 'border-[#c9a227]/40 shadow-sm opacity-100 translate-y-0'
                : 'border-transparent opacity-0 translate-y-2'
            }`}
          >
            <div className="text-[10px] uppercase tracking-wider text-[#0c2340]/40 font-semibold mb-1">
              {field.label}
            </div>
            <div className="text-sm font-medium text-[#0c2340]">{field.value}</div>
          </div>
        ))}
      </div>

      {filled >= fields.length && (
        <div className="flex justify-center pt-4 animate-fadeIn">
          <button
            onClick={onNext}
            className="px-8 py-3 bg-[#0c2340] text-white font-semibold rounded-xl hover:bg-[#1a3a5c] transition-colors shadow-lg"
          >
            Generate AI Clinical Brief →
          </button>
        </div>
      )}
    </div>
  );
}

function BriefGenerationStep({ onNext }: { onNext: () => void }) {
  const [visibleSections, setVisibleSections] = useState(0);
  const [typing, setTyping] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (visibleSections < BRIEF_SECTIONS.length) {
      const timer = setTimeout(
        () => {
          setVisibleSections((v) => v + 1);
          // Scroll to bottom of container
          if (containerRef.current) {
            containerRef.current.scrollTop = containerRef.current.scrollHeight;
          }
        },
        visibleSections === 0 ? 1200 : 1800,
      );
      return () => clearTimeout(timer);
    } else {
      setTyping(false);
    }
  }, [visibleSections]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 bg-[#c9a227] rounded-lg flex items-center justify-center text-[10px] font-bold text-[#0c2340]">
            V
          </div>
          <span className="text-sm font-semibold text-[#0c2340]">VantaUM Clinical Intelligence</span>
        </div>
        {typing && (
          <div className="flex items-center gap-1 text-xs text-[#c9a227] font-medium">
            <span className="animate-pulse">●</span> Analyzing...
          </div>
        )}
        {!typing && (
          <div className="flex items-center gap-2">
            <span className="text-xs bg-emerald-50 text-emerald-700 px-2.5 py-1 rounded-full font-semibold">
              Verification Score: 94/100
            </span>
          </div>
        )}
      </div>

      <div ref={containerRef} className="space-y-3 max-h-[500px] overflow-y-auto pr-1">
        {BRIEF_SECTIONS.slice(0, visibleSections).map((section, i) => (
          <div
            key={section.id}
            className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm animate-slideUp"
            style={{ animationDelay: `${i * 100}ms` }}
          >
            <div className="flex items-center gap-2 mb-2">
              <span className="text-lg">{section.icon}</span>
              <h3 className="font-semibold text-[#0c2340] text-sm">{section.title}</h3>
              {section.badges && (
                <div className="flex gap-1.5 ml-auto">
                  {section.badges.map((b) => (
                    <span
                      key={b.label}
                      className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${
                        b.type === 'source'
                          ? 'bg-blue-50 text-blue-700'
                          : b.type === 'met'
                            ? 'bg-emerald-50 text-emerald-700'
                            : 'bg-gray-100 text-gray-500'
                      }`}
                    >
                      {b.label}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {section.content && (
              <p className="text-sm text-[#0c2340]/70 leading-relaxed whitespace-pre-line">{section.content}</p>
            )}

            {section.criteria_met && (
              <ul className="space-y-1.5 mt-2">
                {section.criteria_met.map((c) => (
                  <li key={c} className="flex items-start gap-2 text-sm text-[#0c2340]/70">
                    <span className="text-emerald-500 mt-0.5 flex-shrink-0">✓</span>
                    {c}
                  </li>
                ))}
              </ul>
            )}

            {section.missing && section.missing.length > 0 && (
              <div className="mt-3 p-2.5 bg-amber-50 rounded-lg border border-amber-200">
                <div className="text-[10px] uppercase tracking-wider text-amber-700 font-semibold mb-1">
                  Missing Documentation
                </div>
                {section.missing.map((m) => (
                  <p key={m} className="text-xs text-amber-800">
                    {m}
                  </p>
                ))}
              </div>
            )}

            {section.recommendation && (
              <div className="mt-2 p-3 bg-emerald-50 rounded-lg border border-emerald-200">
                <div className="flex items-center gap-3 mb-2">
                  <span className="px-3 py-1 bg-emerald-600 text-white text-xs font-bold rounded-full uppercase tracking-wider">
                    {section.recommendation}
                  </span>
                  <span className="text-xs text-emerald-700 font-semibold">
                    Confidence: {section.confidence}
                  </span>
                </div>
                <p className="text-sm text-emerald-900/80 leading-relaxed">{section.rationale}</p>
              </div>
            )}
          </div>
        ))}

        {typing && visibleSections < BRIEF_SECTIONS.length && (
          <div className="flex items-center gap-2 p-4 text-[#0c2340]/40">
            <div className="flex gap-1">
              <span className="w-2 h-2 bg-[#c9a227] rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
              <span
                className="w-2 h-2 bg-[#c9a227] rounded-full animate-bounce"
                style={{ animationDelay: '150ms' }}
              />
              <span
                className="w-2 h-2 bg-[#c9a227] rounded-full animate-bounce"
                style={{ animationDelay: '300ms' }}
              />
            </div>
            <span className="text-xs">Generating clinical brief...</span>
          </div>
        )}
      </div>

      {!typing && (
        <div className="flex justify-center pt-4 animate-fadeIn">
          <button
            onClick={onNext}
            className="px-8 py-3 bg-[#0c2340] text-white font-semibold rounded-xl hover:bg-[#1a3a5c] transition-colors shadow-lg"
          >
            Assign to Physician Reviewer →
          </button>
        </div>
      )}
    </div>
  );
}

function PhysicianReviewStep({ onNext }: { onNext: () => void }) {
  const [phase, setPhase] = useState<'assigning' | 'reviewing' | 'deciding'>('assigning');

  useEffect(() => {
    const t1 = setTimeout(() => setPhase('reviewing'), 1500);
    const t2 = setTimeout(() => setPhase('deciding'), 3000);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, []);

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
        <div className="flex items-center gap-4 mb-4">
          <div className="w-14 h-14 bg-[#0c2340] rounded-full flex items-center justify-center text-white text-xl font-bold">
            JR
          </div>
          <div>
            <h3 className="font-semibold text-[#0c2340]">{REVIEWER.name}</h3>
            <p className="text-sm text-[#0c2340]/60">{REVIEWER.credentials} — {REVIEWER.specialty}</p>
          </div>
          <div className="ml-auto">
            {phase === 'assigning' && (
              <span className="text-xs bg-blue-50 text-blue-700 px-3 py-1.5 rounded-full font-semibold animate-pulse">
                Assigning...
              </span>
            )}
            {phase === 'reviewing' && (
              <span className="text-xs bg-amber-50 text-amber-700 px-3 py-1.5 rounded-full font-semibold animate-pulse">
                Reviewing Brief...
              </span>
            )}
            {phase === 'deciding' && (
              <span className="text-xs bg-emerald-50 text-emerald-700 px-3 py-1.5 rounded-full font-semibold">
                Ready for Determination
              </span>
            )}
          </div>
        </div>

        {phase !== 'assigning' && (
          <div className="space-y-3 animate-fadeIn">
            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="bg-[#f8f9fb] rounded-lg p-3">
                <div className="text-2xl font-bold text-[#0c2340]">1,203</div>
                <div className="text-[10px] uppercase tracking-wider text-[#0c2340]/40 font-semibold">Cases Completed</div>
              </div>
              <div className="bg-[#f8f9fb] rounded-lg p-3">
                <div className="text-2xl font-bold text-[#0c2340]">2.1h</div>
                <div className="text-[10px] uppercase tracking-wider text-[#0c2340]/40 font-semibold">Avg Turnaround</div>
              </div>
              <div className="bg-[#f8f9fb] rounded-lg p-3">
                <div className="text-2xl font-bold text-[#c9a227]">94%</div>
                <div className="text-[10px] uppercase tracking-wider text-[#0c2340]/40 font-semibold">AI Agreement</div>
              </div>
            </div>

            <div className="p-3 bg-[#f8f9fb] rounded-lg border text-sm text-[#0c2340]/70">
              <span className="font-semibold text-[#0c2340]">AI recommends: APPROVE</span> — All 6 InterQual criteria
              met. Physician reviews the AI brief and clinical documentation to make the final determination.
              <span className="block mt-1 text-[10px] uppercase tracking-wider text-[#0c2340]/40 font-semibold">
                AI advises. Physicians decide.
              </span>
            </div>
          </div>
        )}
      </div>

      {phase === 'deciding' && (
        <div className="flex justify-center pt-2 animate-fadeIn">
          <button
            onClick={onNext}
            className="px-8 py-3 bg-emerald-600 text-white font-semibold rounded-xl hover:bg-emerald-700 transition-colors shadow-lg"
          >
            Approve — Issue Authorization ✓
          </button>
        </div>
      )}
    </div>
  );
}

function DeterminationStep({ onRestart }: { onRestart: () => void }) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setShow(true), 500);
    return () => clearTimeout(t);
  }, []);

  if (!show) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="flex gap-1">
          <span className="w-3 h-3 bg-emerald-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
          <span className="w-3 h-3 bg-emerald-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
          <span className="w-3 h-3 bg-emerald-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fadeIn">
      <div className="bg-white rounded-xl border-2 border-emerald-200 p-6 shadow-lg">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-emerald-500 rounded-full flex items-center justify-center text-white text-xl">
            ✓
          </div>
          <div>
            <h3 className="font-bold text-[#0c2340] text-lg">Authorization Approved</h3>
            <p className="text-sm text-[#0c2340]/60">
              Case {DEMO_CASE.case_number} — {DEMO_CASE.procedure_description}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-[#0c2340]/40 font-semibold">Authorization #</div>
            <div className="font-mono font-bold text-[#0c2340]">AUTH-2026-004821</div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-[#0c2340]/40 font-semibold">Determined By</div>
            <div className="font-medium text-[#0c2340]">{REVIEWER.name}, {REVIEWER.credentials}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-[#0c2340]/40 font-semibold">Turnaround</div>
            <div className="font-medium text-emerald-600">1h 47m (SLA: 48h)</div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-[#0c2340]/40 font-semibold">AI Agreement</div>
            <div className="font-medium text-emerald-600">Physician agrees with AI recommendation</div>
          </div>
        </div>

        <div className="p-3 bg-emerald-50 rounded-lg text-sm text-emerald-800">
          <strong>Rationale:</strong> All InterQual criteria for lumbar spine MRI met. Progressive radiculopathy with
          objective neurological findings persisting beyond 6 weeks despite documented conservative management.
          Authorization approved for outpatient MRI lumbar spine without contrast.
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white rounded-xl border p-4 text-center">
          <div className="text-3xl font-bold text-[#0c2340]">96%</div>
          <div className="text-[10px] uppercase tracking-wider text-[#0c2340]/40 font-semibold mt-1">
            Time Saved vs Manual
          </div>
        </div>
        <div className="bg-white rounded-xl border p-4 text-center">
          <div className="text-3xl font-bold text-[#c9a227]">1:47</div>
          <div className="text-[10px] uppercase tracking-wider text-[#0c2340]/40 font-semibold mt-1">
            Total Minutes
          </div>
        </div>
        <div className="bg-white rounded-xl border p-4 text-center">
          <div className="text-3xl font-bold text-emerald-600">100%</div>
          <div className="text-[10px] uppercase tracking-wider text-[#0c2340]/40 font-semibold mt-1">
            Audit-Ready
          </div>
        </div>
      </div>

      <div className="flex flex-col items-center gap-3 pt-2">
        <button
          onClick={onRestart}
          className="px-8 py-3 bg-[#0c2340] text-white font-semibold rounded-xl hover:bg-[#1a3a5c] transition-colors shadow-lg"
        >
          Watch Again
        </button>
        <a
          href="https://wellsonyx.com"
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-[#0c2340]/50 hover:text-[#c9a227] transition-colors"
        >
          Learn more at wellsonyx.com →
        </a>
      </div>
    </div>
  );
}

// ============================================================================
// Main Demo Page
// ============================================================================

export default function DemoPage() {
  const [step, setStep] = useState(0);
  const [key, setKey] = useState(0);

  const restart = useCallback(() => {
    setStep(0);
    setKey((k) => k + 1);
  }, []);

  return (
    <div className="min-h-screen bg-[#f8f9fb]">
      {/* Header */}
      <header className="bg-[#0c2340] text-white py-4 px-4 sm:px-6">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-gradient-to-br from-[#c9a227] to-[#d4b54a] rounded-lg flex items-center justify-center font-bold text-[#0c2340] text-sm shadow-lg shadow-[#c9a227]/20">
              V
            </div>
            <span
              className="text-xl tracking-tight"
              style={{ fontFamily: 'var(--font-dm-serif), "DM Serif Display", Georgia, serif' }}
            >
              Vanta<span className="text-[#c9a227]">UM</span>
            </span>
          </div>
          <span className="text-xs text-white/40 font-medium uppercase tracking-wider">Interactive Demo</span>
        </div>
      </header>

      {/* Hero Tagline */}
      <div className="bg-[#0c2340] text-white pb-8 pt-2 px-4 sm:px-6">
        <div className="max-w-3xl mx-auto text-center">
          <h1
            className="text-2xl sm:text-3xl mb-2"
            style={{ fontFamily: 'var(--font-dm-serif), "DM Serif Display", Georgia, serif' }}
          >
            Clinical Intelligence. <span className="text-[#c9a227]">Delivered in Minutes.</span>
          </h1>
          <p className="text-white/60 text-sm sm:text-base max-w-xl mx-auto">
            Watch a real utilization review case flow through VantaUM — from intake to AI-generated clinical brief to
            physician determination.
          </p>
        </div>
      </div>

      {/* Content */}
      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-8" key={key}>
        <StepIndicator step={step} total={4} />

        {step === 0 && <CaseIntakeStep onNext={() => setStep(1)} />}
        {step === 1 && <BriefGenerationStep onNext={() => setStep(2)} />}
        {step === 2 && <PhysicianReviewStep onNext={() => setStep(3)} />}
        {step === 3 && <DeterminationStep onRestart={restart} />}
      </main>

      {/* Footer */}
      <footer className="text-center py-6 text-xs text-[#0c2340]/30">
        <p>
          VantaUM — A{' '}
          <a href="https://wellsonyx.com" target="_blank" rel="noopener noreferrer" className="hover:text-[#c9a227]">
            Wells Onyx
          </a>{' '}
          Service
        </p>
        <p className="mt-1">AI advises. Physicians decide. Every case, every time.</p>
      </footer>
    </div>
  );
}
