'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import type { Case, Determination } from '@/lib/types';
import {
  demoReviewers, demoCases, demoClients, demoStaff,
  DEMO_REVIEWER_IDS, DEMO_CASE_IDS, DEMO_CLIENT_IDS, DEMO_STAFF_IDS,
} from '@/lib/demo-data';

// ── Formatters ────────────────────────────────────────────────────────────────

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function timeLeft(iso: string | null): { label: string; level: 'ok' | 'warning' | 'critical' | 'overdue' } {
  if (!iso) return { label: '—', level: 'ok' };
  const diff = new Date(iso).getTime() - Date.now();
  if (diff <= 0) return { label: 'OVERDUE', level: 'overdue' };
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  const label = h > 0 ? `${h}h ${m}m` : `${m}m`;
  if (diff < 2 * 3600000) return { label, level: 'critical' };
  if (diff < 6 * 3600000) return { label, level: 'warning' };
  return { label, level: 'ok' };
}

const SLA_COLORS = {
  ok: 'text-green-400',
  warning: 'text-yellow-400',
  critical: 'text-red-400 animate-pulse',
  overdue: 'text-red-500 font-bold',
};

const DET_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  approve: { label: 'Approved', color: 'text-green-400', bg: 'bg-green-500/10 border-green-500/30' },
  deny: { label: 'Denied', color: 'text-red-400', bg: 'bg-red-500/10 border-red-500/30' },
  partial_approve: { label: 'Partial Approval', color: 'text-yellow-400', bg: 'bg-yellow-500/10 border-yellow-500/30' },
  modify: { label: 'Modified', color: 'text-teal-400', bg: 'bg-teal-500/10 border-teal-500/30' },
  pend: { label: 'Pended', color: 'text-orange-400', bg: 'bg-orange-500/10 border-orange-500/30' },
  peer_to_peer_requested: { label: 'P2P Requested', color: 'text-purple-400', bg: 'bg-purple-500/10 border-purple-500/30' },
};

const STATUS_LABELS: Record<string, string> = {
  intake: 'Intake', processing: 'Processing', brief_ready: 'Brief Ready',
  lpn_review: 'LPN Review', rn_review: 'RN Review', md_review: 'MD Review',
  pend_missing_info: 'Pending Info', determination_made: 'Determined', delivered: 'Delivered',
};

const CAT_LABELS: Record<string, string> = {
  imaging: 'Imaging', surgery: 'Surgery', infusion: 'Infusion',
  dme: 'DME', behavioral_health: 'Behavioral Health', pain_management: 'Pain Management',
};

type Role = 'md' | 'lpn' | 'tpa';

// ── Demo state type ────────────────────────────────────────────────────────────

interface DemoState {
  decisions: Record<string, { determination: Determination; rationale: string; at: string }>;
  lpnDecisions: Record<string, { determination: string; notes: string; at: string }>;
  stats: { casesProcessed: number; aiAgreements: number; avgTurnaround: number };
}

const INITIAL_STATE: DemoState = {
  decisions: {},
  lpnDecisions: {},
  stats: { casesProcessed: 0, aiAgreements: 0, avgTurnaround: 0 },
};

// ── Sub-components ─────────────────────────────────────────────────────────────

function Badge({ label, color = 'bg-white/10 text-white/50' }: { label: string; color?: string }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${color}`}>
      {label}
    </span>
  );
}

function SlaChip({ deadline }: { deadline: string | null }) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick(x => x + 1), 30000);
    return () => clearInterval(t);
  }, []);
  const { label, level } = timeLeft(deadline);
  return <span className={`text-xs tabular-nums font-mono ${SLA_COLORS[level]}`}>{label}</span>;
}

function StreamingText({ text, speed = 12 }: { text: string; speed?: number }) {
  const [displayed, setDisplayed] = useState('');
  const [done, setDone] = useState(false);
  useEffect(() => {
    setDisplayed('');
    setDone(false);
    let i = 0;
    const interval = setInterval(() => {
      i += speed;
      if (i >= text.length) { setDisplayed(text); setDone(true); clearInterval(interval); }
      else setDisplayed(text.slice(0, i));
    }, 16);
    return () => clearInterval(interval);
  }, [text, speed]);
  return (
    <span>
      {displayed}
      {!done && <span className="inline-block w-1.5 h-3.5 bg-gold/80 animate-pulse ml-0.5 align-middle" />}
    </span>
  );
}

// ── Stat Bar ──────────────────────────────────────────────────────────────────

function StatBar({ state }: { state: DemoState }) {
  const decided = Object.keys(state.decisions).length;
  const aiRec = demoCases.filter(c => c.ai_brief?.ai_recommendation?.recommendation).length;
  const agreements = Object.entries(state.decisions).filter(([id, d]) => {
    const c = demoCases.find(x => x.id === id);
    const aiDet = c?.ai_brief?.ai_recommendation?.recommendation === 'approve' ? 'approve' : 'deny';
    return d.determination === aiDet;
  }).length;
  const agreePct = decided > 0 ? Math.round((agreements / decided) * 100) : 94;

  return (
    <div className="flex items-center gap-6 px-6 py-2 bg-navy-dark border-b border-white/5 text-xs">
      <div className="flex items-center gap-2">
        <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
        <span className="text-white/40">Live Demo</span>
      </div>
      {[
        { label: 'Cases in Queue', value: demoCases.length },
        { label: 'Decided This Session', value: decided },
        { label: 'AI Agreement Rate', value: `${agreePct}%` },
        { label: 'Avg Turnaround', value: '1h 47m' },
        { label: 'SLA Compliance', value: '100%' },
      ].map(s => (
        <div key={s.label} className="flex items-center gap-1.5">
          <span className="text-white/30">{s.label}</span>
          <span className="text-white font-semibold tabular-nums">{s.value}</span>
        </div>
      ))}
      <div className="ml-auto text-white/20 italic">All data simulated · No PHI</div>
    </div>
  );
}

// ── MD View ───────────────────────────────────────────────────────────────────

function MdView({ state, onDecide }: { state: DemoState; onDecide: (caseId: string, det: Determination, rationale: string) => void }) {
  const [selectedCase, setSelectedCase] = useState<Case | null>(null);
  const [activeSection, setActiveSection] = useState<string>('summary');
  const [decision, setDecision] = useState<Determination | ''>('');
  const [rationale, setRationale] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [briefAnimated, setBriefAnimated] = useState(false);
  const reviewer = demoReviewers.find(r => r.id === DEMO_REVIEWER_IDS.richardson)!;

  const mdCases = demoCases.filter(c =>
    ['md_review', 'brief_ready'].includes(c.status) &&
    c.assigned_reviewer_id === DEMO_REVIEWER_IDS.richardson
  );

  function selectCase(c: Case) {
    setSelectedCase(c);
    setActiveSection('summary');
    setDecision('');
    setRationale('');
    setSubmitted(!!state.decisions[c.id]);
    setBriefAnimated(false);
    setTimeout(() => setBriefAnimated(true), 100);
  }

  function handleSubmit() {
    if (!selectedCase || !decision || !rationale.trim()) return;
    setSubmitting(true);
    setTimeout(() => {
      onDecide(selectedCase.id, decision as Determination, rationale);
      setSubmitting(false);
      setSubmitted(true);
    }, 1200);
  }

  const aiRec = selectedCase?.ai_brief?.ai_recommendation;
  const factCheck = selectedCase?.fact_check;
  const criteria = selectedCase?.ai_brief?.criteria_match;
  const existingDecision = selectedCase ? state.decisions[selectedCase.id] : null;

  const SECTIONS = ['summary', 'diagnosis', 'criteria', 'documentation', 'decision'];

  return (
    <div className="flex h-full min-h-0">
      {/* Case queue */}
      <div className="w-72 shrink-0 border-r border-white/10 overflow-y-auto">
        <div className="px-4 py-3 border-b border-white/10">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-8 h-8 rounded-full bg-navy-light flex items-center justify-center text-sm font-bold text-gold">JR</div>
            <div>
              <p className="text-sm font-medium text-white">Dr. James Richardson</p>
              <p className="text-xs text-white/40">MD, FACP · Internal Medicine</p>
            </div>
          </div>
          <div className="flex gap-3 mt-2 text-xs text-white/40">
            <span>1,203 cases</span>
            <span>94% AI agree</span>
            <span>2.1h avg</span>
          </div>
        </div>
        <div className="p-2 space-y-1">
          {mdCases.map(c => {
            const sla = timeLeft(c.turnaround_deadline);
            const decided = !!state.decisions[c.id];
            const isSelected = selectedCase?.id === c.id;
            return (
              <button
                key={c.id}
                onClick={() => selectCase(c)}
                className={`w-full text-left rounded-lg p-3 transition-all ${
                  isSelected ? 'bg-gold/15 border border-gold/30' : 'hover:bg-white/5 border border-transparent'
                } ${decided ? 'opacity-50' : ''}`}
              >
                <div className="flex items-start justify-between gap-2 mb-1">
                  <span className="text-xs font-mono text-white/50">{c.case_number}</span>
                  <SlaChip deadline={c.turnaround_deadline} />
                </div>
                <p className="text-sm font-medium text-white leading-tight">{c.patient_name}</p>
                <p className="text-xs text-white/40 mt-0.5">{c.procedure_description?.slice(0, 45)}…</p>
                <div className="flex items-center gap-2 mt-1.5">
                  <Badge
                    label={CAT_LABELS[c.service_category ?? ''] ?? c.service_category ?? ''}
                    color="bg-white/10 text-white/50"
                  />
                  {c.priority === 'urgent' && <Badge label="Urgent" color="bg-red-500/20 text-red-400" />}
                  {decided && <Badge label="✓ Done" color="bg-green-500/20 text-green-400" />}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Case detail */}
      {!selectedCase ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="text-4xl mb-3">🩺</div>
            <p className="text-white/50 text-sm">Select a case from your queue</p>
            <p className="text-white/25 text-xs mt-1">{mdCases.length} cases awaiting your review</p>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
          {/* Case header */}
          <div className="px-6 py-4 border-b border-white/10 flex items-start justify-between shrink-0">
            <div>
              <div className="flex items-center gap-3 mb-1">
                <span className="text-xs font-mono text-white/40">{selectedCase.case_number}</span>
                <Badge label={STATUS_LABELS[selectedCase.status]} color="bg-blue-500/20 text-blue-300" />
                {selectedCase.priority === 'urgent' && <Badge label="URGENT" color="bg-red-500/20 text-red-400" />}
              </div>
              <h2 className="text-lg font-semibold text-white">{selectedCase.patient_name}</h2>
              <p className="text-sm text-white/50">{selectedCase.procedure_description}</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-white/30">SLA Deadline</p>
              <SlaChip deadline={selectedCase.turnaround_deadline} />
              <p className="text-xs text-white/30 mt-1">{selectedCase.payer_name}</p>
            </div>
          </div>

          {/* Section tabs */}
          <div className="flex items-center gap-1 px-6 pt-3 pb-0 border-b border-white/5 shrink-0">
            {SECTIONS.map(s => (
              <button
                key={s}
                onClick={() => setActiveSection(s)}
                className={`px-3 py-1.5 text-xs font-medium rounded-t-lg capitalize transition-all ${
                  activeSection === s
                    ? 'bg-white/10 text-white border-b-2 border-gold'
                    : 'text-white/40 hover:text-white'
                }`}
              >
                {s === 'criteria' ? 'Criteria Match' : s === 'documentation' ? 'Documents' : s.charAt(0).toUpperCase() + s.slice(1)}
              </button>
            ))}
          </div>

          {/* Section content */}
          <div className="flex-1 overflow-y-auto p-6">
            {activeSection === 'summary' && (
              <div className="space-y-5 animate-fade-in">
                {/* AI rec banner */}
                {aiRec && (
                  <div className={`rounded-xl border p-4 ${aiRec.recommendation === 'approve' ? 'bg-green-500/5 border-green-500/20' : 'bg-red-500/5 border-red-500/20'}`}>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-white/40 uppercase tracking-widest">AI Recommendation</span>
                        <span className={`text-sm font-bold uppercase ${aiRec.recommendation === 'approve' ? 'text-green-400' : 'text-red-400'}`}>
                          {aiRec.recommendation?.replace(/_/g, ' ')}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-white/30">Confidence</span>
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                          aiRec.confidence === 'high' ? 'bg-green-500/20 text-green-400' :
                          aiRec.confidence === 'medium' ? 'bg-yellow-500/20 text-yellow-400' :
                          'bg-red-500/20 text-red-400'
                        }`}>{aiRec.confidence}</span>
                      </div>
                    </div>
                    {briefAnimated && (
                      <p className="text-sm text-white/70 leading-relaxed">
                        <StreamingText text={aiRec.rationale ?? ''} speed={8} />
                      </p>
                    )}
                  </div>
                )}

                {/* Fact check */}
                {factCheck && (
                  <div className="rounded-xl border border-white/10 p-4">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-xs text-white/40 uppercase tracking-widest">Fact-Check Score</span>
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-32 bg-white/10 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-1000 ${factCheck.overall_score >= 80 ? 'bg-green-400' : factCheck.overall_score >= 60 ? 'bg-yellow-400' : 'bg-red-400'}`}
                            style={{ width: briefAnimated ? `${factCheck.overall_score}%` : '0%' }}
                          />
                        </div>
                        <span className="text-white font-bold tabular-nums">{factCheck.overall_score}/100</span>
                      </div>
                    </div>
                    <div className="flex gap-4 text-xs">
                      <span className="text-green-400">✓ {factCheck.summary?.verified ?? 0} verified</span>
                      <span className="text-yellow-400">~ {factCheck.summary?.unverified ?? 0} unverified</span>
                      <span className="text-red-400">⚠ {factCheck.summary?.flagged ?? 0} flagged</span>
                    </div>
                  </div>
                )}

                {/* Patient + provider grid */}
                <div className="grid grid-cols-2 gap-4">
                  {[
                    { title: 'Patient', rows: [
                      ['Name', selectedCase.patient_name],
                      ['DOB', selectedCase.patient_dob],
                      ['Member ID', selectedCase.patient_member_id],
                      ['Gender', selectedCase.patient_gender],
                    ]},
                    { title: 'Provider', rows: [
                      ['Name', selectedCase.requesting_provider],
                      ['NPI', selectedCase.requesting_provider_npi],
                      ['Specialty', selectedCase.requesting_provider_specialty],
                      ['Payer', selectedCase.payer_name],
                    ]},
                    { title: 'Service', rows: [
                      ['CPT', selectedCase.procedure_codes?.join(', ')],
                      ['ICD-10', selectedCase.diagnosis_codes?.join(', ')],
                      ['Category', CAT_LABELS[selectedCase.service_category ?? ''] ?? selectedCase.service_category],
                      ['Review Type', selectedCase.review_type?.replace(/_/g, ' ')],
                    ]},
                  ].map(block => (
                    <div key={block.title} className="rounded-xl border border-white/10 p-4">
                      <p className="text-xs text-white/30 uppercase tracking-widest mb-2">{block.title}</p>
                      <dl className="space-y-1">
                        {block.rows.map(([k, v]) => (
                          <div key={k} className="flex gap-2 text-sm">
                            <dt className="text-white/40 w-20 shrink-0">{k}</dt>
                            <dd className="text-white font-medium font-mono text-xs">{v ?? '—'}</dd>
                          </div>
                        ))}
                      </dl>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {activeSection === 'diagnosis' && selectedCase.ai_brief && (
              <div className="space-y-4 animate-fade-in">
                <div className="rounded-xl border border-white/10 p-5">
                  <p className="text-xs text-white/30 uppercase tracking-widest mb-3">Clinical Question</p>
                  <p className="text-sm text-white/80 leading-relaxed">{selectedCase.ai_brief.clinical_question}</p>
                </div>
                <div className="rounded-xl border border-white/10 p-5">
                  <p className="text-xs text-white/30 uppercase tracking-widest mb-3">Diagnosis Analysis</p>
                  <div className="space-y-3 text-sm">
                    <div>
                      <span className="text-white/40 text-xs">Primary</span>
                      <p className="text-white">{selectedCase.ai_brief.diagnosis_analysis?.primary_diagnosis}</p>
                    </div>
                    {selectedCase.ai_brief.diagnosis_analysis?.secondary_diagnoses?.length > 0 && (
                      <div>
                        <span className="text-white/40 text-xs">Secondary</span>
                        <ul className="list-disc list-inside text-white/70 space-y-0.5 mt-0.5">
                          {selectedCase.ai_brief.diagnosis_analysis.secondary_diagnoses.map((d: string) => (
                            <li key={d}>{d}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    <div>
                      <span className="text-white/40 text-xs">Alignment</span>
                      <p className="text-white/70">{selectedCase.ai_brief.diagnosis_analysis?.diagnosis_procedure_alignment}</p>
                    </div>
                  </div>
                </div>
                <div className="rounded-xl border border-white/10 p-5">
                  <p className="text-xs text-white/30 uppercase tracking-widest mb-3">Procedure Analysis</p>
                  <div className="space-y-2 text-sm text-white/70">
                    <p>{selectedCase.ai_brief.procedure_analysis?.clinical_rationale}</p>
                    <div className="flex gap-4 text-xs mt-2">
                      <span>Complexity: <span className="text-white">{selectedCase.ai_brief.procedure_analysis?.complexity_level}</span></span>
                      <span>Setting: <span className="text-white">{selectedCase.ai_brief.procedure_analysis?.setting_appropriateness}</span></span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeSection === 'criteria' && selectedCase.ai_brief?.criteria_match && (
              <div className="space-y-4 animate-fade-in">
                <div className="rounded-xl border border-white/10 p-4 flex items-center justify-between">
                  <div>
                    <p className="text-xs text-white/30 uppercase tracking-widest">Guideline Source</p>
                    <p className="text-white font-medium mt-0.5">{criteria?.guideline_source}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-white/30">Applicable Guideline</p>
                    <p className="text-sm text-white/70 mt-0.5">{criteria?.applicable_guideline}</p>
                  </div>
                </div>
                {(criteria?.criteria_met?.length ?? 0) > 0 && (
                  <div className="rounded-xl border border-green-500/20 bg-green-500/5 p-4">
                    <p className="text-xs text-green-400 uppercase tracking-widest mb-2">Criteria Met ({criteria!.criteria_met?.length ?? 0})</p>
                    <ul className="space-y-1">
                      {(criteria!.criteria_met ?? []).map((c: string, i: number) => (
                        <li key={i} className="flex items-start gap-2 text-sm text-white/70">
                          <span className="text-green-400 mt-0.5 shrink-0">✓</span>{c}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {(criteria?.criteria_not_met?.length ?? 0) > 0 && (
                  <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4">
                    <p className="text-xs text-red-400 uppercase tracking-widest mb-2">Criteria Not Met ({criteria!.criteria_not_met?.length ?? 0})</p>
                    <ul className="space-y-1">
                      {(criteria!.criteria_not_met ?? []).map((c: string, i: number) => (
                        <li key={i} className="flex items-start gap-2 text-sm text-white/70">
                          <span className="text-red-400 mt-0.5 shrink-0">✗</span>{c}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {(criteria?.criteria_unable_to_assess?.length ?? 0) > 0 && (
                  <div className="rounded-xl border border-yellow-500/20 bg-yellow-500/5 p-4">
                    <p className="text-xs text-yellow-400 uppercase tracking-widest mb-2">Unable to Assess</p>
                    <ul className="space-y-1">
                      {(criteria!.criteria_unable_to_assess ?? []).map((c: string, i: number) => (
                        <li key={i} className="text-sm text-white/50">• {c}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {activeSection === 'documentation' && selectedCase.ai_brief?.documentation_review && (
              <div className="space-y-4 animate-fade-in">
                <div className="rounded-xl border border-white/10 p-4">
                  <p className="text-xs text-white/30 uppercase tracking-widest mb-3">Documents Provided</p>
                  <div className="flex flex-wrap gap-2">
                    {(Array.isArray(selectedCase.ai_brief.documentation_review.documents_provided) ? selectedCase.ai_brief.documentation_review.documents_provided : [selectedCase.ai_brief.documentation_review.documents_provided]).filter(Boolean).map((d: string) => (
                      <span key={d} className="px-2 py-1 bg-white/5 border border-white/10 rounded text-xs text-white/60">📄 {d}</span>
                    ))}
                  </div>
                </div>
                <div className="rounded-xl border border-white/10 p-4">
                  <p className="text-xs text-white/30 uppercase tracking-widest mb-3">Key Findings</p>
                  <ul className="space-y-1.5">
                    {(selectedCase.ai_brief.documentation_review.key_findings ?? []).map((f: string, i: number) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-white/70">
                        <span className="text-gold mt-0.5 shrink-0">›</span>{f}
                      </li>
                    ))}
                  </ul>
                </div>
                {selectedCase.ai_brief.documentation_review.missing_documentation?.length > 0 && (
                  <div className="rounded-xl border border-orange-500/20 bg-orange-500/5 p-4">
                    <p className="text-xs text-orange-400 uppercase tracking-widest mb-2">Missing Documentation</p>
                    <ul className="space-y-1">
                      {selectedCase.ai_brief.documentation_review.missing_documentation.map((d: string, i: number) => (
                        <li key={i} className="text-sm text-white/60">⚠ {d}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {activeSection === 'decision' && (
              <div className="space-y-5 animate-fade-in">
                {existingDecision ? (
                  <div className={`rounded-xl border p-5 ${DET_CONFIG[existingDecision.determination]?.bg ?? 'bg-white/5 border-white/10'}`}>
                    <p className="text-xs text-white/40 uppercase tracking-widest mb-2">Decision Recorded</p>
                    <p className={`text-2xl font-bold ${DET_CONFIG[existingDecision.determination]?.color ?? 'text-white'}`}>
                      {DET_CONFIG[existingDecision.determination]?.label}
                    </p>
                    <p className="text-sm text-white/60 mt-3 leading-relaxed">{existingDecision.rationale}</p>
                    <p className="text-xs text-white/30 mt-2">{new Date(existingDecision.at).toLocaleString()}</p>
                  </div>
                ) : (
                  <>
                    <div className="rounded-xl border border-white/10 p-4">
                      <p className="text-xs text-white/30 uppercase tracking-widest mb-3">AI Recommendation</p>
                      <div className={`rounded-lg p-3 text-sm ${aiRec?.recommendation === 'approve' ? 'bg-green-500/10 text-green-300' : 'bg-red-500/10 text-red-300'}`}>
                        <span className="font-bold uppercase">{aiRec?.recommendation?.replace(/_/g, ' ')}</span>
                        <span className="text-white/40 ml-2">· {aiRec?.confidence} confidence</span>
                      </div>
                    </div>
                    <div>
                      <p className="text-xs text-white/30 uppercase tracking-widest mb-3">Your Determination</p>
                      <div className="grid grid-cols-3 gap-2">
                        {(['approve', 'deny', 'partial_approve', 'modify', 'pend', 'peer_to_peer_requested'] as Determination[]).map(d => (
                          <button
                            key={d}
                            onClick={() => setDecision(d)}
                            className={`rounded-lg border px-3 py-2 text-xs font-medium transition-all ${
                              decision === d
                                ? `${DET_CONFIG[d].bg} ${DET_CONFIG[d].color} border-current`
                                : 'border-white/10 text-white/40 hover:text-white hover:border-white/30'
                            }`}
                          >
                            {DET_CONFIG[d].label}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <p className="text-xs text-white/30 uppercase tracking-widest mb-2">Clinical Rationale</p>
                      <textarea
                        value={rationale}
                        onChange={e => setRationale(e.target.value)}
                        placeholder="Document your clinical reasoning…"
                        rows={4}
                        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-white/20 focus:outline-none focus:border-gold/40 resize-none"
                      />
                    </div>
                    {decision && rationale.length > 10 && (
                      <button
                        onClick={handleSubmit}
                        disabled={submitting}
                        className="w-full py-3 rounded-xl bg-gold text-navy font-bold text-sm hover:bg-gold-light transition-all disabled:opacity-50"
                      >
                        {submitting ? 'Recording determination…' : `Submit: ${DET_CONFIG[decision]?.label}`}
                      </button>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── LPN View ──────────────────────────────────────────────────────────────────

function LpnView({ state, onLpnDecide }: { state: DemoState; onLpnDecide: (caseId: string, det: string, notes: string) => void }) {
  const [selectedCase, setSelectedCase] = useState<Case | null>(null);
  const [checklist, setChecklist] = useState<Record<string, boolean>>({});
  const [notes, setNotes] = useState('');
  const [escalated, setEscalated] = useState<string | null>(null);

  const lpn = demoStaff.find(s => s.id === DEMO_STAFF_IDS.martinezLpn)!;
  const lpnCases = demoCases.filter(c => c.status === 'lpn_review' && c.assigned_lpn_id === lpn.id);

  const CHECKLIST_ITEMS = [
    'Clinical documentation is complete',
    'Diagnosis codes align with requested service',
    'Procedure code matches description',
    'Member eligibility confirmed',
    'Prior auth history reviewed',
    'Guideline criteria checklist completed',
    'SLA deadline within range',
  ];

  const allChecked = CHECKLIST_ITEMS.every(item => checklist[item]);
  const decidedCase = selectedCase ? state.lpnDecisions[selectedCase.id] : null;

  return (
    <div className="flex h-full min-h-0">
      <div className="w-72 shrink-0 border-r border-white/10 overflow-y-auto">
        <div className="px-4 py-3 border-b border-white/10">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-8 h-8 rounded-full bg-navy-light flex items-center justify-center text-sm font-bold text-blue-300">RM</div>
            <div>
              <p className="text-sm font-medium text-white">{lpn.name}</p>
              <p className="text-xs text-white/40">LPN · Pod Alpha General</p>
            </div>
          </div>
          <div className="flex gap-3 mt-2 text-xs text-white/40">
            <span>Quality: {lpn.quality_score}%</span>
            <span>Capacity: {lpn.max_cases_per_day}/day</span>
          </div>
        </div>
        <div className="p-2 space-y-1">
          {lpnCases.length === 0 ? (
            <p className="text-xs text-white/30 text-center py-8">No LPN cases assigned</p>
          ) : lpnCases.map(c => {
            const done = !!state.lpnDecisions[c.id];
            return (
              <button
                key={c.id}
                onClick={() => { setSelectedCase(c); setChecklist({}); setNotes(''); }}
                className={`w-full text-left rounded-lg p-3 transition-all border ${
                  selectedCase?.id === c.id ? 'bg-blue-500/10 border-blue-500/30' : 'hover:bg-white/5 border-transparent'
                } ${done ? 'opacity-50' : ''}`}
              >
                <div className="flex justify-between mb-1">
                  <span className="text-xs font-mono text-white/40">{c.case_number}</span>
                  <SlaChip deadline={c.turnaround_deadline} />
                </div>
                <p className="text-sm font-medium text-white">{c.patient_name}</p>
                <p className="text-xs text-white/40 mt-0.5">{c.procedure_codes?.join(', ')}</p>
                {done && <Badge label="✓ Reviewed" color="bg-green-500/20 text-green-400" />}
              </button>
            );
          })}
        </div>
      </div>

      {!selectedCase ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="text-4xl mb-3">📋</div>
            <p className="text-white/50 text-sm">Select a case from your queue</p>
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-lg font-semibold text-white">{selectedCase.patient_name}</h2>
              <p className="text-sm text-white/50">{selectedCase.procedure_description}</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-white/30">SLA</p>
              <SlaChip deadline={selectedCase.turnaround_deadline} />
            </div>
          </div>

          {decidedCase ? (
            <div className={`rounded-xl border p-5 ${decidedCase.determination === 'escalate_to_rn' ? 'bg-orange-500/10 border-orange-500/30' : 'bg-green-500/10 border-green-500/30'}`}>
              <p className="text-xs text-white/40 uppercase tracking-widest mb-1">LPN Assessment Recorded</p>
              <p className={`text-xl font-bold ${decidedCase.determination === 'escalate_to_rn' ? 'text-orange-400' : 'text-green-400'}`}>
                {decidedCase.determination === 'escalate_to_rn' ? 'Escalated to RN' :
                 decidedCase.determination === 'criteria_met' ? 'Criteria Met' : 'Criteria Not Met'}
              </p>
              <p className="text-sm text-white/60 mt-2">{decidedCase.notes}</p>
            </div>
          ) : (
            <>
              {/* Criteria checklist */}
              <div className="rounded-xl border border-white/10 p-5">
                <p className="text-xs text-white/30 uppercase tracking-widest mb-3">Pre-Review Checklist</p>
                <div className="space-y-2">
                  {CHECKLIST_ITEMS.map(item => (
                    <label key={item} className="flex items-center gap-3 cursor-pointer group">
                      <input
                        type="checkbox"
                        checked={!!checklist[item]}
                        onChange={e => setChecklist(p => ({ ...p, [item]: e.target.checked }))}
                        className="w-4 h-4 rounded accent-gold"
                      />
                      <span className={`text-sm transition-colors ${checklist[item] ? 'text-white/60 line-through' : 'text-white/80 group-hover:text-white'}`}>
                        {item}
                      </span>
                    </label>
                  ))}
                </div>
                <div className="mt-3 flex items-center gap-2">
                  <div className="flex-1 h-1.5 bg-white/10 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gold rounded-full transition-all duration-500"
                      style={{ width: `${(Object.values(checklist).filter(Boolean).length / CHECKLIST_ITEMS.length) * 100}%` }}
                    />
                  </div>
                  <span className="text-xs text-white/40 tabular-nums">
                    {Object.values(checklist).filter(Boolean).length}/{CHECKLIST_ITEMS.length}
                  </span>
                </div>
              </div>

              {/* LPN notes */}
              <div>
                <p className="text-xs text-white/30 uppercase tracking-widest mb-2">Assessment Notes</p>
                <textarea
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder="Document your criteria assessment…"
                  rows={3}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-white/20 focus:outline-none focus:border-gold/40 resize-none"
                />
              </div>

              {/* Action buttons */}
              {allChecked && notes.length > 5 && (
                <div className="flex gap-3">
                  <button
                    onClick={() => onLpnDecide(selectedCase.id, 'criteria_met', notes)}
                    className="flex-1 py-2.5 rounded-xl bg-green-500/20 border border-green-500/30 text-green-400 font-semibold text-sm hover:bg-green-500/30 transition-all"
                  >
                    ✓ Criteria Met
                  </button>
                  <button
                    onClick={() => onLpnDecide(selectedCase.id, 'criteria_not_met', notes)}
                    className="flex-1 py-2.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 font-semibold text-sm hover:bg-red-500/20 transition-all"
                  >
                    ✗ Not Met
                  </button>
                  <button
                    onClick={() => onLpnDecide(selectedCase.id, 'escalate_to_rn', notes)}
                    className="flex-1 py-2.5 rounded-xl bg-orange-500/10 border border-orange-500/20 text-orange-400 font-semibold text-sm hover:bg-orange-500/20 transition-all"
                  >
                    ↑ Escalate to RN
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ── TPA View ──────────────────────────────────────────────────────────────────

function TpaView({ state }: { state: DemoState }) {
  const [selectedCase, setSelectedCase] = useState<Case | null>(null);
  const client = demoClients.find(c => c.id === DEMO_CLIENT_IDS.southwestAdmin)!;
  const tpaCases = demoCases.filter(c => c.client_id === DEMO_CLIENT_IDS.southwestAdmin);

  const PIPELINE_STAGES = [
    { key: 'intake', label: 'Submitted', icon: '📥' },
    { key: 'processing', label: 'AI Analysis', icon: '🤖' },
    { key: 'md_review', label: 'Physician Review', icon: '👨‍⚕️' },
    { key: 'determination_made', label: 'Determined', icon: '✅' },
  ];

  function currentStageIndex(c: Case): number {
    if (state.decisions[c.id]) return 3;
    if (['md_review', 'rn_review', 'lpn_review'].includes(c.status)) return 2;
    if (['processing', 'brief_ready'].includes(c.status)) return 1;
    return 0;
  }

  const decidedCase = selectedCase ? state.decisions[selectedCase.id] : null;

  return (
    <div className="flex h-full min-h-0">
      <div className="w-72 shrink-0 border-r border-white/10 overflow-y-auto">
        <div className="px-4 py-3 border-b border-white/10">
          <p className="text-sm font-medium text-white">{client.name}</p>
          <p className="text-xs text-white/40 mt-0.5">TPA Client · {client.contracted_sla_hours}h SLA</p>
          <div className="flex gap-3 mt-2 text-xs">
            <span className="text-white/40">{tpaCases.length} active cases</span>
            <span className="text-gold">{Object.keys(state.decisions).length} determined</span>
          </div>
        </div>
        <div className="p-2 space-y-1">
          {tpaCases.map(c => {
            const stageIdx = currentStageIndex(c);
            const decided = !!state.decisions[c.id];
            return (
              <button
                key={c.id}
                onClick={() => setSelectedCase(c)}
                className={`w-full text-left rounded-lg p-3 transition-all border ${
                  selectedCase?.id === c.id ? 'bg-gold/10 border-gold/20' : 'hover:bg-white/5 border-transparent'
                }`}
              >
                <div className="flex justify-between mb-1">
                  <span className="text-xs font-mono text-white/40">{c.case_number}</span>
                  {decided
                    ? <Badge label={DET_CONFIG[state.decisions[c.id].determination]?.label ?? '?'} color={`${DET_CONFIG[state.decisions[c.id].determination]?.bg} ${DET_CONFIG[state.decisions[c.id].determination]?.color}`} />
                    : <SlaChip deadline={c.turnaround_deadline} />
                  }
                </div>
                <p className="text-sm font-medium text-white">{c.patient_name?.split(' ')[0]} {c.patient_name?.split(' ').slice(-1)[0]?.charAt(0)}.</p>
                <p className="text-xs text-white/40 mt-0.5">{c.procedure_codes?.join(', ')} · {CAT_LABELS[c.service_category ?? ''] ?? c.service_category}</p>
                {/* Mini pipeline */}
                <div className="flex items-center gap-0.5 mt-2">
                  {PIPELINE_STAGES.map((s, i) => (
                    <div key={s.key} className={`flex-1 h-1 rounded-full ${i <= stageIdx ? 'bg-gold' : 'bg-white/10'}`} />
                  ))}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {!selectedCase ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="text-4xl mb-3">🏥</div>
            <p className="text-white/50 text-sm">Select a case to view status</p>
            <p className="text-white/25 text-xs mt-1">{tpaCases.length} active authorization requests</p>
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          <div className="flex items-start justify-between">
            <div>
              <span className="text-xs font-mono text-white/30">{selectedCase.case_number}</span>
              <h2 className="text-lg font-semibold text-white mt-0.5">{selectedCase.patient_name}</h2>
              <p className="text-sm text-white/50">{selectedCase.procedure_description}</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-white/30">Est. Completion</p>
              <SlaChip deadline={selectedCase.turnaround_deadline} />
            </div>
          </div>

          {/* Pipeline progress */}
          <div className="rounded-xl border border-white/10 p-5">
            <p className="text-xs text-white/30 uppercase tracking-widest mb-4">Authorization Status</p>
            <div className="space-y-3">
              {PIPELINE_STAGES.map((stage, i) => {
                const stageIdx = currentStageIndex(selectedCase);
                const done = i < stageIdx;
                const active = i === stageIdx;
                return (
                  <div key={stage.key} className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm transition-all ${
                      done ? 'bg-gold/20 text-gold' : active ? 'bg-blue-500/20 text-blue-300 ring-2 ring-blue-500/30' : 'bg-white/5 text-white/20'
                    }`}>
                      {done ? '✓' : stage.icon}
                    </div>
                    <div className="flex-1">
                      <p className={`text-sm font-medium ${done ? 'text-white/50' : active ? 'text-white' : 'text-white/25'}`}>
                        {stage.label}
                      </p>
                      {active && !decidedCase && (
                        <p className="text-xs text-blue-300 animate-pulse">In progress…</p>
                      )}
                    </div>
                    {done && <span className="text-xs text-white/30">Complete</span>}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Determination (if done) */}
          {decidedCase && (
            <div className={`rounded-xl border p-5 ${DET_CONFIG[decidedCase.determination]?.bg ?? 'bg-white/5 border-white/10'}`}>
              <p className="text-xs text-white/40 uppercase tracking-widest mb-2">Authorization Decision</p>
              <p className={`text-2xl font-bold ${DET_CONFIG[decidedCase.determination]?.color ?? 'text-white'}`}>
                {DET_CONFIG[decidedCase.determination]?.label}
              </p>
              <p className="text-sm text-white/60 mt-3 leading-relaxed">{decidedCase.rationale}</p>
              <div className="mt-4 pt-4 border-t border-white/10 flex items-center justify-between text-xs text-white/30">
                <span>Reviewed by board-certified physician</span>
                <span>{new Date(decidedCase.at).toLocaleDateString()}</span>
              </div>
              {(decidedCase.determination === 'deny' || decidedCase.determination === 'partial_approve') && (
                <button className="mt-3 w-full py-2 rounded-lg border border-purple-500/30 text-purple-400 text-xs font-medium hover:bg-purple-500/10 transition-all">
                  Request Peer-to-Peer Review
                </button>
              )}
            </div>
          )}

          {/* Case details */}
          <div className="rounded-xl border border-white/10 p-4">
            <p className="text-xs text-white/30 uppercase tracking-widest mb-3">Request Details</p>
            <dl className="grid grid-cols-2 gap-2 text-sm">
              {[
                ['CPT Code', selectedCase.procedure_codes?.join(', ')],
                ['ICD-10', selectedCase.diagnosis_codes?.join(', ')],
                ['Provider', selectedCase.requesting_provider],
                ['Review Type', selectedCase.review_type?.replace(/_/g, ' ')],
                ['Priority', selectedCase.priority],
                ['Submitted', timeAgo(selectedCase.created_at)],
              ].map(([k, v]) => (
                <div key={k}>
                  <dt className="text-white/30 text-xs">{k}</dt>
                  <dd className="text-white/70 font-mono text-xs mt-0.5">{v ?? '—'}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function InteractiveDemoPage() {
  const [role, setRole] = useState<Role | null>(null);
  const [state, setState] = useState<DemoState>(INITIAL_STATE);

  function onDecide(caseId: string, determination: Determination, rationale: string) {
    setState(prev => ({
      ...prev,
      decisions: {
        ...prev.decisions,
        [caseId]: { determination, rationale, at: new Date().toISOString() },
      },
      stats: {
        ...prev.stats,
        casesProcessed: prev.stats.casesProcessed + 1,
        aiAgreements: prev.stats.aiAgreements + (determination === 'approve' ? 1 : 0),
      },
    }));
  }

  function onLpnDecide(caseId: string, determination: string, notes: string) {
    setState(prev => ({
      ...prev,
      lpnDecisions: {
        ...prev.lpnDecisions,
        [caseId]: { determination, notes, at: new Date().toISOString() },
      },
    }));
  }

  function reset() {
    setState(INITIAL_STATE);
    setRole(null);
  }

  if (!role) {
    return (
      <div className="min-h-screen bg-navy flex flex-col items-center justify-center px-6">
        <div className="max-w-2xl w-full">
          <div className="text-center mb-10">
            <div className="flex items-center justify-center gap-2 mb-4">
              <div className="w-10 h-10 bg-navy-light rounded-xl flex items-center justify-center font-bold text-gold text-xl">V</div>
              <span className="text-2xl font-semibold text-white">VantaUM</span>
            </div>
            <h1 className="text-3xl font-bold text-white mb-3">Interactive Demo</h1>
            <p className="text-white/50 text-lg">Experience the full concierge utilization review workflow.<br />Choose your role to begin.</p>
            <p className="text-white/25 text-xs mt-3">All data is simulated. No PHI. No login required.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              {
                role: 'md' as Role,
                icon: '🩺',
                title: 'Physician Reviewer',
                name: 'Dr. James Richardson',
                sub: 'MD, FACP · Internal Medicine',
                desc: 'Review AI-generated clinical briefs, evaluate criteria matches, and make authorization decisions for your assigned cases.',
                color: 'hover:border-gold/40 hover:bg-gold/5',
                badge: '3 cases waiting',
                badgeColor: 'bg-gold/20 text-gold',
              },
              {
                role: 'lpn' as Role,
                icon: '📋',
                title: 'Clinical Coordinator',
                name: 'Rosa Martinez, LPN',
                sub: 'LPN · Pod Alpha General',
                desc: 'Work through criteria checklists, document your assessment, and escalate complex cases to RN or physician review.',
                color: 'hover:border-blue-500/40 hover:bg-blue-500/5',
                badge: '2 cases assigned',
                badgeColor: 'bg-blue-500/20 text-blue-300',
              },
              {
                role: 'tpa' as Role,
                icon: '🏢',
                title: 'TPA Client',
                name: 'Southwest Administrators',
                sub: 'TPA · 48h contracted SLA',
                desc: 'Track your authorization requests in real time. See exactly where each case is in the review pipeline.',
                color: 'hover:border-purple-500/40 hover:bg-purple-500/5',
                badge: '4 active requests',
                badgeColor: 'bg-purple-500/20 text-purple-300',
              },
            ].map(r => (
              <button
                key={r.role}
                onClick={() => setRole(r.role)}
                className={`rounded-2xl border border-white/10 bg-white/3 p-6 text-left transition-all ${r.color} group`}
              >
                <div className="text-3xl mb-3">{r.icon}</div>
                <div className="mb-1">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${r.badgeColor}`}>{r.badge}</span>
                </div>
                <h3 className="text-base font-semibold text-white mt-2">{r.title}</h3>
                <p className="text-sm text-white/60 font-medium">{r.name}</p>
                <p className="text-xs text-white/30">{r.sub}</p>
                <p className="text-sm text-white/50 mt-3 leading-relaxed">{r.desc}</p>
                <div className="mt-4 text-xs text-gold group-hover:underline">Enter as {r.title} →</div>
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  const ROLE_LABELS: Record<Role, string> = { md: 'Physician Reviewer', lpn: 'Clinical Coordinator', tpa: 'TPA Client' };

  return (
    <div className="h-screen flex flex-col bg-navy overflow-hidden">
      {/* Top bar */}
      <div className="shrink-0 flex items-center justify-between px-5 py-3 bg-navy-dark border-b border-white/10">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 bg-navy-light rounded-lg flex items-center justify-center font-bold text-gold text-sm">V</div>
          <span className="text-sm font-semibold text-white">VantaUM</span>
          <span className="text-white/20">·</span>
          <span className="text-xs text-white/40">{ROLE_LABELS[role]}</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex gap-2">
            {(['md', 'lpn', 'tpa'] as Role[]).map(r => (
              <button
                key={r}
                onClick={() => setRole(r)}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${
                  role === r ? 'bg-gold text-navy' : 'text-white/40 hover:text-white hover:bg-white/10'
                }`}
              >
                {r === 'md' ? '🩺 Physician' : r === 'lpn' ? '📋 LPN' : '🏢 TPA'}
              </button>
            ))}
          </div>
          <button onClick={reset} className="text-xs text-white/30 hover:text-white/60 transition-colors px-2 py-1 rounded hover:bg-white/5">
            ↺ Reset
          </button>
        </div>
      </div>

      {/* Stats bar */}
      <StatBar state={state} />

      {/* Main content */}
      <div className="flex-1 min-h-0">
        {role === 'md' && <MdView state={state} onDecide={onDecide} />}
        {role === 'lpn' && <LpnView state={state} onLpnDecide={onLpnDecide} />}
        {role === 'tpa' && <TpaView state={state} />}
      </div>
    </div>
  );
}
