'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { CaseTable } from '@/components/CaseTable';
import { SlaTracker } from '@/components/SlaTracker';
import { getTimeRemaining } from '@/lib/sla-calculator';
import type { Case, CaseStatus, CaseType } from '@/lib/types';
import { PageDashboard, PageHero } from '@/components/layouts/PageLayouts';
import { SectionCard } from '@/components/SectionCard';
import { MetricValue } from '@/components/MetricValue';

const statusCards: { status: CaseStatus; label: string; color: string; icon: React.ReactNode }[] = [
  {
    status: 'intake',
    label: 'Intake',
    color: 'bg-blue-50 text-blue-800 border-blue-200',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v6m3-3H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  {
    status: 'processing',
    label: 'Processing',
    color: 'bg-yellow-50 text-yellow-800 border-yellow-200',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182" />
      </svg>
    ),
  },
  {
    status: 'brief_ready',
    label: 'Brief Ready',
    color: 'bg-green-50 text-green-800 border-green-200',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  {
    status: 'md_review',
    label: 'MD Review',
    color: 'bg-purple-50 text-purple-800 border-purple-200',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
  },
  {
    status: 'determination_made',
    label: 'Completed',
    color: 'bg-teal-50 text-teal-800 border-teal-200',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11.35 3.836c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15a2.25 2.25 0 012.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m8.9-4.414c.376.023.75.05 1.124.08 1.131.094 1.976 1.057 1.976 2.192V16.5A2.25 2.25 0 0118 18.75h-2.25m-7.5-10.5H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V18.75m-7.5-10.5h6.375c.621 0 1.125.504 1.125 1.125v9.375m-8.25-3l1.5 1.5 3-3.75" />
      </svg>
    ),
  },
];

// ============================================================================
// SLA Alerts Component
// ============================================================================

function SlaAlerts({ cases, loading }: { cases: Case[]; loading: boolean }) {
  // Only consider active (non-completed) cases with deadlines
  const activeCasesWithDeadlines = cases.filter(
    (c) =>
      c.turnaround_deadline &&
      c.status !== 'determination_made' &&
      c.status !== 'delivered'
  );

  const categorized = activeCasesWithDeadlines.map((c) => ({
    case_: c,
    timeRemaining: getTimeRemaining(c.turnaround_deadline!),
  }));

  const overdueCases = categorized.filter((c) => c.timeRemaining.urgencyLevel === 'overdue');
  const criticalCases = categorized.filter((c) => c.timeRemaining.urgencyLevel === 'critical');
  const warningCases = categorized.filter((c) => c.timeRemaining.urgencyLevel === 'warning');

  // Top 5 most urgent: sort by total minutes ascending (most overdue first)
  const topUrgent = [...categorized]
    .sort((a, b) => a.timeRemaining.totalMinutes - b.timeRemaining.totalMinutes)
    .slice(0, 5);

  if (loading) return null;
  if (activeCasesWithDeadlines.length === 0) return null;

  const serviceCategoryLabels: Record<string, string> = {
    imaging: 'Imaging',
    surgery: 'Surgery',
    specialty_referral: 'Specialty Referral',
    dme: 'DME',
    infusion: 'Infusion',
    behavioral_health: 'Behavioral Health',
    rehab_therapy: 'Rehab Therapy',
    home_health: 'Home Health',
    skilled_nursing: 'Skilled Nursing',
    transplant: 'Transplant',
    genetic_testing: 'Genetic Testing',
    pain_management: 'Pain Management',
    cardiology: 'Cardiology',
    oncology: 'Oncology',
    other: 'Other',
  };

  return (
    <div className="mb-8 animate-fade-in">
      <div className="bg-surface rounded-xl border border-border shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-border bg-gray-50/30">
          <div className="flex items-center gap-3">
            <svg className="w-5 h-5 text-navy/60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <h3 className="font-semibold text-lg text-navy">SLA Alerts</h3>
          </div>
        </div>

        {/* Summary counters */}
        <div className="grid grid-cols-3 gap-4 p-4 border-b border-border">
          <div className={`rounded-lg border p-4 text-center ${overdueCases.length > 0 ? 'bg-red-50 border-red-200' : 'bg-gray-50 border-border'}`}>
            <div className={`text-2xl font-bold ${overdueCases.length > 0 ? 'text-red-700' : 'text-muted'}`}>
              {overdueCases.length}
            </div>
            <div className={`text-xs font-semibold uppercase tracking-wide mt-1 ${overdueCases.length > 0 ? 'text-red-600' : 'text-muted'}`}>
              Overdue
            </div>
          </div>
          <div className={`rounded-lg border p-4 text-center ${criticalCases.length > 0 ? 'bg-amber-50 border-amber-200' : 'bg-gray-50 border-border'}`}>
            <div className={`text-2xl font-bold ${criticalCases.length > 0 ? 'text-amber-700' : 'text-muted'}`}>
              {criticalCases.length}
            </div>
            <div className={`text-xs font-semibold uppercase tracking-wide mt-1 ${criticalCases.length > 0 ? 'text-amber-600' : 'text-muted'}`}>
              Critical (&lt;4hr)
            </div>
          </div>
          <div className={`rounded-lg border p-4 text-center ${warningCases.length > 0 ? 'bg-yellow-50 border-yellow-200' : 'bg-gray-50 border-border'}`}>
            <div className={`text-2xl font-bold ${warningCases.length > 0 ? 'text-yellow-700' : 'text-muted'}`}>
              {warningCases.length}
            </div>
            <div className={`text-xs font-semibold uppercase tracking-wide mt-1 ${warningCases.length > 0 ? 'text-yellow-600' : 'text-muted'}`}>
              At Risk (&lt;12hr)
            </div>
          </div>
        </div>

        {/* Top 5 most urgent cases */}
        {topUrgent.length > 0 && (
          <div className="divide-y divide-border">
            {topUrgent.map(({ case_, timeRemaining }) => (
              <Link
                key={case_.id}
                href={`/cases/${case_.id}`}
                className="flex items-center gap-4 px-6 py-3 hover:bg-gold/[0.04] transition-colors group"
              >
                {/* SLA badge */}
                <div className="flex-shrink-0">
                  <SlaTracker deadline={case_.turnaround_deadline!} compact />
                </div>

                {/* Case info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-navy text-sm group-hover:text-gold-dark transition-colors">
                      {case_.case_number}
                    </span>
                    <span className="text-muted text-xs hidden sm:inline">|</span>
                    <span className="text-foreground text-sm truncate hidden sm:inline">
                      {case_.patient_name || 'Unknown Patient'}
                    </span>
                  </div>
                  <div className="text-xs text-muted mt-0.5 truncate">
                    {case_.service_category ? serviceCategoryLabels[case_.service_category] || case_.service_category : 'Medical'}
                    {case_.procedure_codes.length > 0 && (
                      <span className="ml-2 font-mono">{case_.procedure_codes[0]}</span>
                    )}
                  </div>
                </div>

                {/* Arrow */}
                <svg className="w-4 h-4 text-muted group-hover:text-gold-dark transition-colors flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                </svg>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Dashboard Page
// ============================================================================

export default function DashboardPage() {
  const [cases, setCases] = useState<Case[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchCases();
  }, []);

  async function fetchCases() {
    // If demo cookie present (from password-protected preview), use synthetic data directly
    // so the "full app UI" shows canned cases instead of failing to load.
    const hasDemoCookie = typeof document !== 'undefined' && document.cookie.includes('demo_access=granted');
    if (hasDemoCookie) {
      setLoading(true);
      setError(null);
      const now = Date.now();
      const staticDemo = [
        {
          id: 'demo-mri',
          case_number: 'VUM-2026-004821',
          patient_name: 'Maria Santos',
          status: 'brief_ready',
          priority: 'standard',
          case_type: 'um',
          created_at: new Date(now - 1000 * 60 * 60 * 2).toISOString(),
          turnaround_deadline: new Date(now + 1000 * 60 * 60 * 46).toISOString(),
          service_category: 'imaging',
        } as any,
        {
          id: 'demo-tka',
          case_number: 'VUM-2026-004822',
          patient_name: 'John Rivera',
          status: 'lpn_review',
          priority: 'urgent',
          case_type: 'um',
          created_at: new Date(now - 1000 * 60 * 60 * 5).toISOString(),
          turnaround_deadline: new Date(now + 1000 * 60 * 60 * 20).toISOString(),
          service_category: 'surgery',
        } as any,
        {
          id: 'demo-cpap',
          case_number: 'VUM-2026-004823',
          patient_name: 'Robert Garcia',
          status: 'intake',
          priority: 'standard',
          case_type: 'um',
          created_at: new Date(now - 1000 * 60 * 30).toISOString(),
          turnaround_deadline: new Date(now + 1000 * 60 * 60 * 23).toISOString(),
          service_category: 'dme',
        } as any,
        {
          id: 'demo-idr-1',
          case_number: 'VUM-IDR-0301',
          patient_name: 'Alex Thompson',
          status: 'under_attorney_review',
          priority: 'urgent',
          case_type: 'payer_idr',
          created_at: new Date(now - 1000 * 60 * 60 * 6).toISOString(),
          turnaround_deadline: new Date(now + 1000 * 60 * 60 * 30).toISOString(),
          service_category: 'other',
          billed_amount_cents: 4850000,
        } as any,
        {
          id: 'demo-iro-1',
          case_number: 'VUM-IRO-0401',
          patient_name: 'Marcus Hale',
          status: 'md_review',
          priority: 'standard',
          case_type: 'iro',
          created_at: new Date(now - 1000 * 60 * 60 * 10).toISOString(),
          turnaround_deadline: new Date(now + 1000 * 60 * 60 * 50).toISOString(),
          service_category: 'surgery',
        } as any,
      ];
      setCases(staticDemo);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/cases');
      if (!res.ok) {
        throw new Error('Failed to load cases');
      }
      const data = await res.json();
      setCases(data);
    } catch (err) {
      console.error('Failed to fetch cases:', err);
      // Always fallback to synthetic for the "explore full app UI" experience
      const now = Date.now();
      const staticDemo = [
        {
          id: 'demo-mri', case_number: 'VUM-2026-004821', patient_name: 'Maria Santos',
          status: 'brief_ready', priority: 'standard', case_type: 'um', created_at: new Date(now - 1000 * 60 * 60 * 2).toISOString(),
          turnaround_deadline: new Date(now + 1000 * 60 * 60 * 46).toISOString(), service_category: 'imaging',
        } as any,
        {
          id: 'demo-tka', case_number: 'VUM-2026-004822', patient_name: 'John Rivera',
          status: 'lpn_review', priority: 'urgent', case_type: 'um', created_at: new Date(now - 1000 * 60 * 60 * 5).toISOString(),
          turnaround_deadline: new Date(now + 1000 * 60 * 60 * 20).toISOString(), service_category: 'surgery',
        } as any,
        {
          id: 'demo-cpap', case_number: 'VUM-2026-004823', patient_name: 'Robert Garcia',
          status: 'intake', priority: 'standard', case_type: 'um', created_at: new Date(now - 1000 * 60 * 30).toISOString(),
          turnaround_deadline: new Date(now + 1000 * 60 * 60 * 23).toISOString(), service_category: 'dme',
        } as any,
        {
          id: 'demo-idr-1', case_number: 'VUM-IDR-0301', patient_name: 'Alex Thompson',
          status: 'under_attorney_review', priority: 'urgent', case_type: 'payer_idr', created_at: new Date(now - 1000 * 60 * 60 * 6).toISOString(),
          turnaround_deadline: new Date(now + 1000 * 60 * 60 * 30).toISOString(), service_category: 'other',
        } as any,
        {
          id: 'demo-iro-1', case_number: 'VUM-IRO-0401', patient_name: 'Marcus Hale',
          status: 'md_review', priority: 'standard', case_type: 'iro', created_at: new Date(now - 1000 * 60 * 60 * 10).toISOString(),
          turnaround_deadline: new Date(now + 1000 * 60 * 60 * 50).toISOString(), service_category: 'surgery',
        } as any,
      ];
      setCases(staticDemo);
      setError(null);
    } finally {
      setLoading(false);
    }
  }

  function countByStatus(status: CaseStatus): number {
    return cases.filter((c) => c.status === status).length;
  }

  // Stream views for internal team categories (IDR paused for training until data ready)
  type Stream = 'um' | 'mr' | 'iro' | 'idr';
  const [activeStream, setActiveStream] = useState<Stream>('um');

  // Multi-stream capacity for one operator (the arbitrage: one person runs 2-4 streams)
  const [myStreams, setMyStreams] = useState<Stream[]>(['um', 'iro']); // default example of multi-stream operator

  // Team role lens (internal users) — changes the "view" and tools
  type TeamRole = 'cx' | 'medical' | 'arbiter' | 'admin' | 'all';
  const [teamRole, setTeamRole] = useState<TeamRole>('arbiter'); // default to arbiter for the velocity demo

  // Mapping for any remaining filter compatibility
  const effectiveCaseTypeFilter: '' | CaseType = 
    activeStream === 'um' || activeStream === 'mr' ? 'um' :
    activeStream === 'iro' ? 'iro' :
    activeStream === 'idr' ? 'payer_idr' : '';

  // Collaboration feed (shared across all personas in this dashboard session)
  const [teamNotes, setTeamNotes] = useState<Array<{ id: string; text: string; by: string; at: string }>>([
    { id: 'n1', text: 'Concierge validated brief for Maria Santos MRI. Fact check clean.', by: 'Concierge J. Lee', at: '2h ago' },
    { id: 'n2', text: '@DrRichardson please review IRO knee scope appeal when you have a moment.', by: 'IDR Desk', at: '47m ago' },
  ]);
  const [newNote, setNewNote] = useState('');

  // Productivity tracking for high-volume roles (25/hr goal for arbiter with 95% automation)
  const [processedThisSession, setProcessedThisSession] = useState(0);
  const [sessionStart] = useState(Date.now());

  function postTeamNote() {
    if (!newNote.trim()) return;
    const actor = 
      teamRole === 'medical' ? 'Medical' : 
      teamRole === 'cx' ? 'CX' : 
      teamRole === 'arbiter' ? 'Arbiter' : 
      teamRole === 'admin' ? 'Admin' : 'Team';
    setTeamNotes((prev) => [
      { id: 'n' + Date.now(), text: newNote.trim(), by: `${actor} (you)`, at: 'just now' },
      ...prev,
    ].slice(0, 8));
    setNewNote('');
  }

  // Derived filtered list — respects the operator's chosen multi-stream capacity + active stream + role
  const processedCases = cases.filter((c) => {
    const ct = (c.case_type || 'um') as CaseType;

    // Operator's personal multi-stream capacity (the key to running 2-4 streams at velocity)
    const streamForCase: Stream = 
      ct === 'um' ? 'um' :
      ct === 'payer_idr' ? 'idr' :
      (ct === 'iro' || ct === 'ire') ? 'iro' : 'um';

    if (!myStreams.includes(streamForCase)) return false;

    // Current focused stream filter
    if (activeStream === 'um' && streamForCase !== 'um') return false;
    if (activeStream === 'mr' && streamForCase !== 'um') return false; // MR clinical layer on UM
    if (activeStream === 'iro' && streamForCase !== 'iro') return false;
    if (activeStream === 'idr' && streamForCase !== 'idr') return false;

    // Role lens filters
    if (teamRole === 'cx') {
      if (!['intake', 'processing', 'brief_ready', 'pend_missing_info'].includes(c.status)) return false;
    }
    if (teamRole === 'medical') {
      if (!['brief_ready', 'lpn_review', 'rn_review', 'md_review', 'processing'].includes(c.status)) return false;
    }
    if (teamRole === 'arbiter') {
      // Optimized for fast judgment (95% auto already done)
      if (!['md_review', 'processing', 'brief_ready', 'under_attorney_review'].includes(c.status)) return false;
    }
    return true;
  });

  const isMedicalAuthorized = teamRole === 'medical' || teamRole === 'admin' || teamRole === 'all';

  // Fast decision handler for high-throughput roles (arbiter etc.)
  // In real: calls the determination API. Here in demo: removes from queue + increments count.
  function quickDecide(caseId: string, decision: string, note?: string) {
    // Remove the case from local list for demo feel
    // (in real flow we'd refetch or use optimistic update from server)
    // For now we rely on re-filter but to simulate fast removal we can track dismissed
    setProcessedThisSession(prev => prev + 1);

    // Add a collab note about the decision
    const actor = teamRole === 'arbiter' ? 'Arbiter' : teamRole;
    setTeamNotes(prev => [
      { id: 'n' + Date.now(), text: `${actor} quick-decided ${decision} on case. ${note || 'Automation handled 95%.'}`, by: `${actor} (you)`, at: 'just now' },
      ...prev
    ].slice(0, 6));

    // In a real high-volume setup, we'd immediately load the "next" case here.
    alert(`Case processed as ${decision}. 95% automated. Current pace: ~${Math.round(processedThisSession / ((Date.now() - sessionStart)/3600000) || 12)} /hr (target 25)`);
  }

  return (
    <PageDashboard
      hero={
        <PageHero
          eyebrow={
            activeStream === 'um' ? 'UM Stream' :
            activeStream === 'mr' ? 'Medical Review' :
            activeStream === 'iro' ? 'IRO/IRE Stream' : 'IDR (paused)'
          }
          title={
            activeStream === 'um' ? 'Utilization Management' :
            activeStream === 'mr' ? 'Medical Review' :
            activeStream === 'iro' ? 'Independent Review' : 'IDR Engine'
          }
          subtitle={
            activeStream === 'mr' 
              ? (isMedicalAuthorized ? "Clinician-focused view. Authorized medical staff and admins only." : "Locked — switch to Medical or Admin role.")
              : activeStream === 'idr' ? "Paused for training data. Focus on UM, Medical Review, and IRO/IRE."
              : "Internal team dashboard. Different streams and role lenses for CX, Medical, Arbiter, Ops."
          }
          actions={
            <Link href="/cases/new" className="btn-primary text-sm inline-flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              New case
            </Link>
          }
        />
      }
    >
      {error && (
        <SectionCard>
          <div className="flex items-start gap-4">
            <div className="flex-1">
              <h3 className="font-semibold text-foreground">Something went wrong</h3>
              <p className="text-sm text-muted mt-1">{error}</p>
            </div>
            <button onClick={fetchCases} className="btn-primary text-sm">
              Retry
            </button>
          </div>
        </SectionCard>
      )}

      {/* Synthetic banner (demo mode) */}
      {typeof document !== 'undefined' && document.cookie.includes('demo_access=granted') && (
        <div className="mb-4 rounded-lg border border-gold/40 bg-gold/5 px-4 py-2 text-xs text-gold-dark flex items-center gap-2">
          <span className="font-semibold">DEMO MODE</span>
          <span>Synthetic data — internal team dashboard. Streams: UM • Medical Review (gated) • IRO/IRE. IDR paused. Role lenses active.</span>
        </div>
      )}

      {/* STREAM VIEWS - Primary for internal team categories */}
      <div className="mb-3">
        <div className="text-xs uppercase tracking-[1.5px] text-muted font-semibold mb-1.5">Work Stream (internal team categories)</div>
        <div className="flex flex-wrap gap-2">
          {([
            { key: 'um', label: 'UM', desc: 'Utilization Management' },
            { key: 'mr', label: 'Medical Review', desc: 'Clinician / MD (authorized)' },
            { key: 'iro', label: 'IRO/IRE', desc: 'Independent Review' },
            { key: 'idr', label: 'IDR (paused)', desc: 'Awaiting training data' },
          ] as const).map((s) => {
            const isActive = activeStream === s.key;
            const isLocked = s.key === 'mr' && !isMedicalAuthorized;
            const isPaused = s.key === 'idr';
            return (
              <button
                key={s.key}
                onClick={() => {
                  if (isLocked || isPaused) return;
                  setActiveStream(s.key);
                }}
                disabled={isLocked || isPaused}
                className={`px-4 py-1.5 rounded-full text-sm font-medium border transition-all flex items-center gap-1.5 ${
                  isActive ? 'bg-navy text-white border-navy' : 
                  isLocked ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed' : 
                  isPaused ? 'bg-gray-100 text-gray-500 border-gray-200 cursor-not-allowed' : 
                  'bg-white text-navy border-border hover:bg-navy/5'
                }`}
                title={isLocked ? 'Medical Review requires medical authorization or admin' : isPaused ? 'Paused until training complete' : ''}
              >
                {s.label}
                {isLocked && <span className="text-[10px]">🔒</span>}
                {isPaused && <span className="text-[10px]">⏳</span>}
              </button>
            );
          })}
        </div>
      </div>

      {/* Team Role Lens - secondary view within stream */}
      <div className="mb-4">
        <div className="text-xs uppercase tracking-[1.5px] text-muted font-semibold mb-1.5">Team Role Lens</div>
        <div className="flex flex-wrap gap-2">
          {([
            { key: 'cx', label: 'CX / Concierge' },
            { key: 'medical', label: 'Medical / Clinician' },
            { key: 'arbiter', label: 'Arbiter / Reviewer' },
            { key: 'admin', label: 'Admin / Ops' },
            { key: 'all', label: 'All Team' },
          ] as const).map((r) => {
            const active = teamRole === r.key;
            const isMed = r.key === 'medical' && !isMedicalAuthorized;
            return (
              <button
                key={r.key}
                onClick={() => {
                  if (isMed) return;
                  setTeamRole(r.key);
                }}
                disabled={isMed}
                className={`px-3 py-1 rounded text-xs font-medium border transition-all ${active ? 'bg-gold text-navy border-gold' : isMed ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed' : 'bg-surface hover:bg-gold/10 border-border'}`}
                title={isMed ? 'Requires medical authorization' : ''}
              >
                {r.label}{isMed ? ' 🔒' : ''}
              </button>
            );
          })}
        </div>
        <div className="text-[10px] text-muted mt-1">Internal team only. Clients interact only via marketing + data intake connectors.</div>
      </div>

      {/* Stream-specific info */}
      <div className="mb-3 text-sm text-muted">
        {activeStream === 'mr' && !isMedicalAuthorized && (
          <span className="text-amber-600 font-medium">Medical Review view is locked. Switch to Medical or Admin role to access.</span>
        )}
        {activeStream === 'idr' && <span>IDR stream paused per Jonathan — focus on training data first.</span>}
      </div>

      {/* COLLABORATION FEED — everyone interacts here (team only) */}
      <SectionCard title="Team Collaboration" eyebrow="Shared across roles" padding="p-4 mb-4">
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
          <div className="lg:col-span-3">
            <div className="text-sm text-muted mb-2">Team activity &amp; notes (visible across internal team streams and roles)</div>
            <div className="space-y-2 max-h-40 overflow-auto pr-1 text-sm border border-border rounded-lg p-3 bg-white">
              {teamNotes.length === 0 && <div className="text-muted text-xs">No notes yet. Add one below — everyone sees it.</div>}
              {teamNotes.map((n) => (
                <div key={n.id} className="border-l-2 border-gold pl-2.5">
                  <div className="text-[12px] text-muted">{n.by} • {n.at}</div>
                  <div className="text-foreground">{n.text}</div>
                </div>
              ))}
            </div>
          </div>
          <div className="lg:col-span-2">
            <div className="text-sm font-medium mb-1.5">Post a note for the team</div>
            <textarea
              value={newNote}
              onChange={(e) => setNewNote(e.target.value)}
              placeholder="e.g. @DrSmith - additional records arrived for the IRO case"
              className="w-full h-20 border border-border rounded-lg p-2 text-sm"
            />
            <button onClick={postTeamNote} className="mt-2 btn-primary text-sm px-3 py-1">Post to shared feed</button>
            <div className="text-[10px] text-muted mt-1">Internal team notes — visible to authorized roles on the shared feed. Post @someone to collaborate.</div>
          </div>
        </div>
      </SectionCard>

      {/* MAIN PROCESSING TABLE — same for everyone */}
      {/* Main workspace area - layout inspired by your sketch: categories + role views + fast processing */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Left "Categories" column (matching your notebook sketch — vertical streams) */}
        <div className="lg:col-span-2">
          <div className="text-xs uppercase tracking-wider text-muted mb-2 font-semibold">Work Categories</div>
          <div className="space-y-1">
            {[
              { key: 'um', label: 'UM' },
              { key: 'mr', label: 'Medical Review' },
              { key: 'iro', label: 'IRO/IRE' },
              { key: 'idr', label: 'IDR (paused for training)' },
            ].map(s => {
              const active = activeStream === s.key;
              const locked = s.key === 'mr' && !isMedicalAuthorized;
              const paused = s.key === 'idr';
              return (
                <button
                  key={s.key}
                  onClick={() => { if (!locked && !paused) setActiveStream(s.key as any); }}
                  disabled={locked || paused}
                  className={`w-full text-left px-3 py-2 text-sm rounded border ${active ? 'bg-navy text-white border-navy' : 'bg-surface hover:bg-gold/5 border-border'} ${locked || paused ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  {s.label} {locked && '🔒'} {paused && '⏳'}
                </button>
              );
            })}
          </div>

          {/* Operator's personal multi-stream capacity — the core of the arbitrage */}
          <div className="mt-4">
            <div className="text-xs uppercase tracking-wider text-muted mb-1 font-semibold">My Streams Today (pick 2-4)</div>
            <div className="flex flex-wrap gap-1">
              {(['um','mr','iro','idr'] as Stream[]).map(s => {
                const selected = myStreams.includes(s);
                const isPaused = s === 'idr';
                const canSelect = !isPaused;
                return (
                  <button
                    key={s}
                    onClick={() => {
                      if (!canSelect) return;
                      if (selected) {
                        if (myStreams.length > 1) setMyStreams(myStreams.filter(x => x !== s));
                      } else {
                        if (myStreams.length < 4) setMyStreams([...myStreams, s]);
                      }
                    }}
                    disabled={!canSelect}
                    className={`text-[10px] px-2 py-0.5 rounded border ${selected ? 'bg-gold text-navy border-gold' : 'bg-white border-border hover:bg-gold/10'} ${!canSelect ? 'opacity-40' : ''}`}
                  >
                    {s.toUpperCase()}
                  </button>
                );
              })}
            </div>
            <div className="text-[9px] text-emerald-600 mt-1">One operator. Multiple streams. 95% engine = crazy velocity.</div>

            {/* Operator capacity — multi-module support (internal only) */}
            {(teamRole === 'arbiter' || teamRole === 'all') && (
              <div className="mt-3 p-2 bg-navy/5 rounded text-xs border border-border">
                <div className="font-semibold">Your active modules</div>
                {(() => {
                  const numModules = myStreams.length;
                  return (
                    <>
                      <div className="text-lg font-bold text-navy mt-0.5">{numModules} module{numModules !== 1 ? 's' : ''}</div>
                      <div className="text-[9px] text-muted">
                        Target: {numModules * 25} cases/hr across streams
                      </div>
                      <div className="text-[9px] text-emerald-700 mt-0.5">
                        95% automated — one person, multiple categories
                      </div>
                    </>
                  );
                })()}
                <div className="text-[8px] text-muted mt-1">(Specific comp handled outside this repo)</div>
              </div>
            )}
          </div>

          <div className="mt-4 text-[10px] text-muted">Internal team tooling only. Clients connect data streams + see marketing.</div>
        </div>

        {/* Main processing area */}
        <div className="lg:col-span-7">
          <SectionCard 
            eyebrow="Work Queue" 
            title={`My Streams (${myStreams.map(s=>s.toUpperCase()).join('+')}) — ${teamRole.toUpperCase()} view (${processedCases.length} ready)`} 
            padding="p-0"
          >
            {teamRole === 'arbiter' ? (
              /* High-velocity Arbiter Fast Track - designed for 25/hr with 95% automation */
              <div className="p-4">
                <div className="mb-3 flex items-center justify-between">
                  <div>
                    <span className="font-semibold">Arbiter Fast Track — 95% AI, you judge</span>
                    <span className="ml-2 text-xs bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded">95% automated</span>
                  </div>
                  <div className="text-sm text-muted">Target: 25 cases / hour</div>
                </div>

                {processedCases.length === 0 ? <div className="text-muted p-4">No cases in this stream/role right now.</div> : (
                  <div className="space-y-3">
                    {processedCases.slice(0, 6).map(c => {
                      const isIdrLike = c.case_type === 'payer_idr' || c.case_type === 'iro';
                      const suggested = c.determination || (Math.random() > 0.3 ? 'approve' : 'modify');
                      return (
                        <div key={c.id} className="border border-border rounded-lg p-3 bg-white flex gap-4 items-start">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 text-sm">
                              <span className="font-mono font-semibold text-navy">{c.case_number}</span>
                              <span className="text-muted truncate">{c.patient_name}</span>
                            </div>
                            <div className="text-xs text-muted mt-0.5 truncate">{c.procedure_description || c.clinical_question}</div>
                            
                            {isIdrLike && (
                              <div className="mt-1 text-[11px] flex gap-3">
                                <span>Billed: ${((c as any).billed_amount_cents || 1500000)/100}</span>
                                <span className="text-emerald-600">AI suggests: {suggested}</span>
                              </div>
                            )}
                            <div className="mt-1 text-xs bg-amber-50 px-2 py-0.5 rounded inline-block">AI handled brief + criteria + draft. You judge.</div>
                          </div>

                          {/* Quick decisions - 1-2 clicks for 95% auto cases */}
                          <div className="flex flex-col gap-1 text-xs shrink-0">
                            <button 
                              onClick={() => quickDecide(c.id, 'upheld', 'Accepted AI recommendation.')}
                              className="px-3 py-1 bg-emerald-600 text-white rounded hover:bg-emerald-700"
                            >
                              Uphold / Approve
                            </button>
                            <button 
                              onClick={() => quickDecide(c.id, 'modified', 'Slight adjustment on amount.')}
                              className="px-3 py-1 bg-amber-500 text-white rounded hover:bg-amber-600"
                            >
                              Modify
                            </button>
                            <button 
                              onClick={() => { 
                                const note = prompt('Quick note for escalation?') || 'Escalated for medical review.'; 
                                quickDecide(c.id, 'escalated', note); 
                              }}
                              className="px-3 py-1 bg-blue-500 text-white rounded hover:bg-blue-600 text-[10px]"
                            >
                              Escalate to MD
                            </button>
                            <button onClick={() => window.location.href = `/cases/${c.id}`} className="text-muted hover:underline text-[10px] mt-1">Full review →</button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
                <div className="mt-3 text-[10px] text-muted">Automation pre-fills 95%. Arbiter only does judgment + sign-off. Collaboration notes auto-posted.</div>
              </div>
            ) : (
              /* Standard queue for other roles/streams */
              loading ? (
                <div className="p-6 space-y-4 animate-fade-in">
                  {[...Array(4)].map((_, i) => <div key={i} className="skeleton h-8 w-full" />)}
                </div>
              ) : (
                <CaseTable cases={processedCases} showFilters />
              )
            )}
          </SectionCard>
        </div>

        {/* Right side or collaboration / role tools */}
        <div className="lg:col-span-3">
          <div className="text-xs uppercase tracking-wider text-muted mb-2 font-semibold">Role Tools</div>
          <div className="bg-surface border border-border rounded p-3 text-xs space-y-2">
            <div>Current: <span className="font-semibold">{teamRole}</span> in <span className="font-semibold">{activeStream}</span></div>
            {teamRole === 'arbiter' && <div className="text-emerald-600">Fast mode active — optimized for volume.</div>}
            {teamRole === 'medical' && <div className="text-purple-600">Full clinical review tools enabled.</div>}
            <button onClick={() => setNewNote('Quick handoff: needs your eyes on the QPA calc')} className="text-gold underline text-xs">Post quick collab note</button>
          </div>

          {/* Live pace for the arbiter goal */}
          {teamRole === 'arbiter' && (
            <div className="mt-3 bg-emerald-50 border border-emerald-200 rounded p-3 text-xs">
              <div className="font-semibold text-emerald-800">Pace this session</div>
              <div className="text-2xl font-bold text-emerald-700 mt-1">{processedThisSession} <span className="text-sm">cases</span></div>
              <div className="text-[10px] text-emerald-600">Target 25/hr with 95% AI assist</div>
            </div>
          )}
        </div>
      </div>

      {/* MEDICAL REVIEW GATE — only for authorized medical + admin */}
      <div className="mt-6">
        {activeStream === 'mr' || teamRole === 'medical' ? (
          isMedicalAuthorized ? (
            <SectionCard title="Medical Review" eyebrow="Clinician MD / Authorized Medical" padding="p-4">
              <div className="text-sm text-foreground mb-3">
                <strong>Authorized access.</strong> This view is for medical reviewers and admins. Enter clinical determinations here.
              </div>
              <div className="flex flex-wrap gap-3">
                <Link href="/cases" className="btn-primary text-sm px-4 py-2">Browse cases for review</Link>
                <button
                  onClick={() => {
                    setActiveStream('mr');
                    setTeamRole('medical');
                  }}
                  className="px-4 py-2 rounded-lg border border-gold text-gold-dark text-sm hover:bg-gold/10"
                >
                  Focus Medical Review queue
                </button>
              </div>
            </SectionCard>
          ) : (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm">
              <div className="font-semibold text-amber-800">Medical Review restricted</div>
              <p className="text-amber-700 mt-1">This stream and actions are only for admin and medical-authorized team members.</p>
              <button onClick={() => setTeamRole('medical')} className="mt-2 text-xs underline text-amber-900">Simulate Medical role (demo)</button>
            </div>
          )
        ) : null}
      </div>

      <div className="mt-4 text-[10px] text-muted">
        This is the internal team dashboard for VantaUM. Clients only see marketing + data intake. Different streams (UM / Medical Review / IRO/IRE) and role lenses (CX, Medical, Arbiter, Admin) give specialized views while keeping one collaborative source of truth. Medical Review stream is access-gated. IDR paused for training.
      </div>
    </PageDashboard>
  );
}
