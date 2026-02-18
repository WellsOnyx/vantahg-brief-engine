'use client';

import { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import { CaseTable } from '@/components/CaseTable';
import { SlaTracker } from '@/components/SlaTracker';
import { getTimeRemaining, formatTimeRemaining } from '@/lib/sla-calculator';
import type { UrgencyLevel } from '@/lib/sla-calculator';
import type { Case, CaseStatus } from '@/lib/types';

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
    status: 'in_review',
    label: 'In Review',
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

const steps = [
  {
    number: '01',
    title: 'Submit Clinical Documentation',
    description: 'Upload operative notes, imaging reports, lab results, and procedure codes (CPT/HCPCS) through our secure, HIPAA-compliant portal.',
    icon: (
      <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m6.75 12H9m1.5-12H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
      </svg>
    ),
  },
  {
    number: '02',
    title: 'AI-Powered Analysis',
    description: 'Our clinical AI engine analyzes documentation against InterQual, MCG, and NCCN guidelines, evaluating medical necessity for surgeries, imaging, specialty procedures, and more.',
    icon: (
      <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0112 15a9.065 9.065 0 00-6.23.693L5 14.5m14.8.8l1.402 1.402c1.232 1.232.65 3.318-1.067 3.611A48.309 48.309 0 0112 21c-2.773 0-5.491-.235-8.135-.687-1.718-.293-2.3-2.379-1.067-3.61L5 14.5" />
      </svg>
    ),
  },
  {
    number: '03',
    title: 'Physician Determination',
    description: 'Board-certified physicians review every case and make the final clinical determination, informed by AI-generated insights.',
    icon: (
      <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
      </svg>
    ),
  },
];

const stats = [
  {
    value: '< 24hr',
    label: 'Prior Auth Reviews',
    sublabel: 'Average turnaround time',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  {
    value: '100%',
    label: 'Medical Necessity Determinations',
    sublabel: 'Physician-reviewed, every case',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12.75L11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 01-1.043 3.296 3.745 3.745 0 01-3.296 1.043A3.745 3.745 0 0112 21c-1.268 0-2.39-.63-3.068-1.593a3.746 3.746 0 01-3.296-1.043 3.745 3.745 0 01-1.043-3.296A3.745 3.745 0 013 12c0-1.268.63-2.39 1.593-3.068a3.745 3.745 0 011.043-3.296 3.746 3.746 0 013.296-1.043A3.746 3.746 0 0112 3c1.268 0 2.39.63 3.068 1.593a3.746 3.746 0 013.296 1.043 3.746 3.746 0 011.043 3.296A3.745 3.745 0 0121 12z" />
      </svg>
    ),
  },
  {
    value: 'Board-Certified',
    label: 'Physician Panel',
    sublabel: 'Multi-specialty coverage',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 9h3.75M15 12h3.75M15 15h3.75M4.5 19.5h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5zm6-10.125a1.875 1.875 0 11-3.75 0 1.875 1.875 0 013.75 0zm1.294 6.336a6.721 6.721 0 01-3.17.789 6.721 6.721 0 01-3.168-.789 3.376 3.376 0 016.338 0z" />
      </svg>
    ),
  },
  {
    value: 'HIPAA',
    label: 'Compliant Infrastructure',
    sublabel: 'SOC 2 Type II certified',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
      </svg>
    ),
  },
];

const verticals = [
  {
    name: 'Medical',
    description: 'Prior authorization, medical necessity, concurrent and retrospective reviews for imaging, surgeries, specialty procedures, DME, and more',
    hero: true,
    icon: (
      <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" />
      </svg>
    ),
  },
  {
    name: 'Dental',
    description: 'Dental necessity reviews, predeterminations, and coverage assessments',
    hero: false,
    comingSoon: true,
    icon: (
      <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.182 15.182a4.5 4.5 0 01-6.364 0M21 12a9 9 0 11-18 0 9 9 0 0118 0zM9.75 9.75c0 .414-.168.75-.375.75S9 10.164 9 9.75 9.168 9 9.375 9s.375.336.375.75zm-.375 0h.008v.015h-.008V9.75zm5.625 0c0 .414-.168.75-.375.75s-.375-.336-.375-.75.168-.75.375-.75.375.336.375.75zm-.375 0h.008v.015h-.008V9.75z" />
      </svg>
    ),
  },
  {
    name: 'Vision',
    description: 'Vision care reviews, surgical necessity, and optical coverage determinations',
    hero: false,
    comingSoon: true,
    icon: (
      <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
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

export default function Dashboard() {
  const [cases, setCases] = useState<Case[]>([]);
  const [loading, setLoading] = useState(true);
  const dashboardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchCases();
  }, []);

  async function fetchCases() {
    try {
      const res = await fetch('/api/cases');
      if (res.ok) {
        const data = await res.json();
        setCases(data);
      }
    } catch (err) {
      console.error('Failed to fetch cases:', err);
    } finally {
      setLoading(false);
    }
  }

  function countByStatus(status: CaseStatus): number {
    return cases.filter((c) => c.status === status).length;
  }

  function scrollToDashboard() {
    dashboardRef.current?.scrollIntoView({ behavior: 'smooth' });
  }

  return (
    <div className="scroll-smooth">
      {/* ================================================================ */}
      {/* HERO SECTION                                                     */}
      {/* ================================================================ */}
      <section className="relative bg-navy overflow-hidden">
        {/* Subtle geometric pattern overlay */}
        <div className="absolute inset-0 opacity-[0.04]">
          <svg className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <pattern id="heroGrid" width="60" height="60" patternUnits="userSpaceOnUse">
                <path d="M 60 0 L 0 0 0 60" fill="none" stroke="white" strokeWidth="0.5" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#heroGrid)" />
          </svg>
        </div>

        {/* Gold accent line at top */}
        <div className="h-1 bg-gradient-to-r from-gold/0 via-gold to-gold/0" />

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 md:py-28 lg:py-32">
          <div className="max-w-4xl">
            {/* Badge */}
            <div className="inline-flex items-center gap-2 bg-white/10 backdrop-blur-sm border border-white/10 rounded-full px-4 py-1.5 mb-8">
              <span className="w-2 h-2 bg-gold rounded-full animate-pulse" />
              <span className="text-sm text-white/80 font-medium tracking-wide">Utilization Review Platform</span>
            </div>

            <h1 className="font-[family-name:var(--font-dm-serif)] text-4xl sm:text-5xl md:text-6xl lg:text-7xl text-white leading-[1.1] tracking-tight">
              AI-Powered Clinical Review.{' '}
              <span className="text-gold">Physician-Led</span>{' '}
              Determinations.
            </h1>

            <p className="mt-6 md:mt-8 text-lg md:text-xl text-white/70 max-w-2xl leading-relaxed">
              Our AI engine augments -- never replaces -- board-certified physicians.
              Every clinical determination is made by a licensed specialist, informed
              by evidence-based AI analysis.
            </p>

            <div className="mt-10 flex flex-col sm:flex-row items-start gap-4">
              <Link
                href="/cases/new"
                className="group inline-flex items-center gap-3 bg-gold text-navy px-8 py-4 rounded-lg font-semibold text-lg hover:bg-gold-light transition-all duration-200 shadow-lg shadow-gold/20 hover:shadow-xl hover:shadow-gold/30"
              >
                Submit a Case
                <svg className="w-5 h-5 transition-transform group-hover:translate-x-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
              </Link>
              <button
                onClick={scrollToDashboard}
                className="inline-flex items-center gap-2 text-white/70 hover:text-white px-6 py-4 rounded-lg font-medium transition-colors border border-white/10 hover:border-white/25 hover:bg-white/5"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
                </svg>
                View Dashboard
              </button>
            </div>
          </div>

          {/* Decorative element - floating card preview */}
          <div className="hidden lg:block absolute right-8 xl:right-16 top-1/2 -translate-y-1/2 w-80 xl:w-96">
            <div className="bg-white/[0.06] backdrop-blur-md border border-white/10 rounded-2xl p-6 shadow-2xl">
              <div className="flex items-center gap-3 mb-5">
                <div className="w-10 h-10 bg-gold/20 rounded-lg flex items-center justify-center">
                  <svg className="w-5 h-5 text-gold" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0112 15a9.065 9.065 0 00-6.23.693L5 14.5m14.8.8l1.402 1.402c1.232 1.232.65 3.318-1.067 3.611A48.309 48.309 0 0112 21c-2.773 0-5.491-.235-8.135-.687-1.718-.293-2.3-2.379-1.067-3.61L5 14.5" />
                  </svg>
                </div>
                <div>
                  <div className="text-white/90 font-semibold text-sm">AI Brief Generated</div>
                  <div className="text-white/40 text-xs">Case #VHG-2026-0847</div>
                </div>
              </div>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-white/50 text-xs">Clinical Criteria</span>
                  <span className="text-xs font-medium text-green-400 bg-green-400/10 px-2 py-0.5 rounded-full">4/4 Met</span>
                </div>
                <div className="w-full bg-white/10 rounded-full h-1.5">
                  <div className="bg-gradient-to-r from-gold to-green-400 h-1.5 rounded-full w-full" />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-white/50 text-xs">Documentation</span>
                  <span className="text-xs font-medium text-gold bg-gold/10 px-2 py-0.5 rounded-full">Complete</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-white/50 text-xs">AI Confidence</span>
                  <span className="text-xs font-medium text-white/80">High</span>
                </div>
                <div className="pt-3 border-t border-white/10">
                  <div className="text-xs text-white/40 mb-1">AI Recommendation</div>
                  <div className="text-sm text-white/90 font-medium">Approve -- Meets clinical necessity criteria per InterQual guidelines</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom curve transition */}
        <div className="absolute bottom-0 left-0 right-0">
          <svg viewBox="0 0 1440 56" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full" preserveAspectRatio="none">
            <path d="M0 56h1440V28C1440 28 1140 0 720 0S0 28 0 28v28z" fill="#f8f9fb" />
          </svg>
        </div>
      </section>

      {/* ================================================================ */}
      {/* HOW IT WORKS                                                     */}
      {/* ================================================================ */}
      <section className="py-20 md:py-28 bg-background">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Section header */}
          <div className="text-center max-w-2xl mx-auto mb-16 md:mb-20">
            <div className="inline-flex items-center gap-2 text-gold-dark font-semibold text-sm tracking-widest uppercase mb-4">
              <span className="w-8 h-px bg-gold" />
              How It Works
              <span className="w-8 h-px bg-gold" />
            </div>
            <h2 className="font-[family-name:var(--font-dm-serif)] text-3xl md:text-4xl text-navy">
              Clinical Review in Three Steps
            </h2>
            <p className="mt-4 text-muted text-lg">
              Our streamlined workflow combines AI efficiency with physician expertise
              to deliver faster, more accurate clinical determinations.
            </p>
          </div>

          {/* Steps */}
          <div className="grid md:grid-cols-3 gap-8 lg:gap-12 relative">
            {/* Connector line (desktop) */}
            <div className="hidden md:block absolute top-16 left-[20%] right-[20%] h-px bg-gradient-to-r from-border via-gold/30 to-border" />

            {steps.map((step, index) => (
              <div key={step.number} className="relative group">
                <div className="bg-surface rounded-2xl border border-border p-8 md:p-10 shadow-sm hover:shadow-md hover:border-gold/30 transition-all duration-300 h-full">
                  {/* Step number circle */}
                  <div className="relative z-10 w-14 h-14 bg-navy rounded-2xl flex items-center justify-center mb-6 group-hover:bg-navy-light transition-colors shadow-lg shadow-navy/20">
                    <span className="text-gold">{step.icon}</span>
                  </div>

                  {/* Step number label */}
                  <div className="text-xs font-bold text-gold tracking-widest uppercase mb-2">Step {step.number}</div>

                  <h3 className="font-[family-name:var(--font-dm-serif)] text-xl md:text-2xl text-navy mb-3">
                    {step.title}
                  </h3>

                  <p className="text-muted leading-relaxed">
                    {step.description}
                  </p>
                </div>

                {/* Arrow connector (mobile) */}
                {index < steps.length - 1 && (
                  <div className="md:hidden flex justify-center py-4">
                    <svg className="w-6 h-6 text-gold/50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                    </svg>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ================================================================ */}
      {/* STATS / TRUST SECTION                                            */}
      {/* ================================================================ */}
      <section className="py-20 md:py-28 bg-navy relative overflow-hidden">
        {/* Background subtle pattern */}
        <div className="absolute inset-0 opacity-[0.03]">
          <svg className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <pattern id="statsGrid" width="40" height="40" patternUnits="userSpaceOnUse">
                <circle cx="20" cy="20" r="1" fill="white" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#statsGrid)" />
          </svg>
        </div>

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Section header */}
          <div className="text-center max-w-2xl mx-auto mb-16">
            <div className="inline-flex items-center gap-2 text-gold font-semibold text-sm tracking-widest uppercase mb-4">
              <span className="w-8 h-px bg-gold/50" />
              Trust &amp; Performance
              <span className="w-8 h-px bg-gold/50" />
            </div>
            <h2 className="font-[family-name:var(--font-dm-serif)] text-3xl md:text-4xl text-white">
              Built for Clinical Accuracy and Speed
            </h2>
            <p className="mt-4 text-white/50 text-lg">
              Designed to meet the rigorous demands of health plans, TPAs, and self-funded employers.
            </p>
          </div>

          {/* Stats grid */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 md:gap-8">
            {stats.map((stat) => (
              <div
                key={stat.label}
                className="relative bg-white/[0.06] backdrop-blur-sm border border-white/10 rounded-2xl p-6 md:p-8 text-center hover:bg-white/[0.1] transition-all duration-300 group"
              >
                <div className="inline-flex items-center justify-center w-12 h-12 bg-gold/10 rounded-xl mb-5 group-hover:bg-gold/20 transition-colors">
                  <span className="text-gold">{stat.icon}</span>
                </div>
                <div className="font-[family-name:var(--font-dm-serif)] text-2xl md:text-3xl text-white mb-1">
                  {stat.value}
                </div>
                <div className="text-white/80 font-semibold text-sm">{stat.label}</div>
                <div className="text-white/40 text-xs mt-1">{stat.sublabel}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ================================================================ */}
      {/* VERTICALS SECTION                                                */}
      {/* ================================================================ */}
      <section className="py-20 md:py-28 bg-background">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-16">
            <div className="inline-flex items-center gap-2 text-gold-dark font-semibold text-sm tracking-widest uppercase mb-4">
              <span className="w-8 h-px bg-gold" />
              Coverage Areas
              <span className="w-8 h-px bg-gold" />
            </div>
            <h2 className="font-[family-name:var(--font-dm-serif)] text-3xl md:text-4xl text-navy">
              Multi-Specialty Clinical Review
            </h2>
            <p className="mt-4 text-muted text-lg">
              Medical utilization review across imaging, surgery, specialty procedures, DME, infusions, behavioral health, and more -- with specialty-matched physician reviewers.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {verticals.map((vertical) => (
              <div
                key={vertical.name}
                className={`bg-surface rounded-2xl border p-8 transition-all duration-300 group ${
                  vertical.hero
                    ? 'border-gold/30 shadow-md hover:shadow-lg ring-2 ring-gold/10'
                    : 'border-border hover:shadow-lg hover:border-gold/20 opacity-75'
                }`}
              >
                <div className="flex items-center gap-3 mb-6">
                  <div className={`w-14 h-14 rounded-2xl flex items-center justify-center group-hover:bg-navy/10 transition-colors ${
                    vertical.hero ? 'bg-gold/10' : 'bg-navy/5'
                  }`}>
                    <span className={vertical.hero ? 'text-gold-dark' : 'text-navy'}>{vertical.icon}</span>
                  </div>
                  {vertical.hero && (
                    <span className="px-2.5 py-0.5 bg-gold/10 text-gold-dark text-xs font-semibold rounded-full border border-gold/20">
                      Primary
                    </span>
                  )}
                  {'comingSoon' in vertical && vertical.comingSoon && (
                    <span className="px-2.5 py-0.5 bg-gray-100 text-muted text-xs font-semibold rounded-full border border-border">
                      Coming Soon
                    </span>
                  )}
                </div>
                <h3 className="font-[family-name:var(--font-dm-serif)] text-2xl text-navy mb-3">
                  {vertical.name}
                </h3>
                <p className="text-muted leading-relaxed">{vertical.description}</p>
                <div className="mt-6 pt-6 border-t border-border">
                  {'comingSoon' in vertical && vertical.comingSoon ? (
                    <span className="inline-flex items-center gap-2 text-sm font-semibold text-muted">
                      Coming Soon
                    </span>
                  ) : (
                    <Link
                      href="/cases/new"
                      className="inline-flex items-center gap-2 text-sm font-semibold text-gold-dark hover:text-gold transition-colors group/link"
                    >
                      Submit Medical Case
                      <svg className="w-4 h-4 transition-transform group-hover/link:translate-x-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                      </svg>
                    </Link>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ================================================================ */}
      {/* CTA BANNER                                                       */}
      {/* ================================================================ */}
      <section className="bg-gradient-to-r from-navy via-navy-light to-navy relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-gold/5 via-transparent to-gold/5" />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 md:py-20">
          <div className="flex flex-col md:flex-row items-center justify-between gap-8">
            <div>
              <h2 className="font-[family-name:var(--font-dm-serif)] text-2xl md:text-3xl text-white">
                Ready to streamline your clinical review process?
              </h2>
              <p className="mt-2 text-white/60 text-lg">Submit your first case in minutes. No setup required.</p>
            </div>
            <Link
              href="/cases/new"
              className="group inline-flex items-center gap-3 bg-gold text-navy px-8 py-4 rounded-lg font-semibold text-lg hover:bg-gold-light transition-all duration-200 shadow-lg shadow-gold/20 hover:shadow-xl hover:shadow-gold/30 whitespace-nowrap"
            >
              Get Started
              <svg className="w-5 h-5 transition-transform group-hover:translate-x-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </Link>
          </div>
        </div>
      </section>

      {/* ================================================================ */}
      {/* CASE DASHBOARD                                                   */}
      {/* ================================================================ */}
      <section ref={dashboardRef} className="py-16 md:py-24 bg-background scroll-mt-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Dashboard header */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-10">
            <div>
              <h2 className="font-[family-name:var(--font-dm-serif)] text-3xl text-navy">
                Clinical Review Dashboard
              </h2>
              <p className="text-muted mt-1">Medical utilization review case management and AI brief generation</p>
            </div>
            <Link
              href="/cases/new"
              className="inline-flex items-center gap-2 bg-navy text-white px-5 py-2.5 rounded-lg font-medium hover:bg-navy-light transition-colors shadow-sm"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              New Case
            </Link>
          </div>

          {/* Status Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4 mb-8">
            {statusCards.map(({ status, label, color, icon }) => (
              <div key={status} className={`rounded-xl border p-5 ${color} transition-all hover:shadow-md`}>
                <div className="flex items-center justify-between mb-2">
                  <span className="opacity-60">{icon}</span>
                </div>
                <div className="text-3xl font-bold tracking-tight">{loading ? '--' : countByStatus(status)}</div>
                <div className="text-sm font-medium mt-1">{label}</div>
              </div>
            ))}
          </div>

          {/* SLA Alerts Section */}
          <SlaAlerts cases={cases} loading={loading} />

          {/* Cases Table */}
          <div className="bg-surface rounded-xl border border-border shadow-sm overflow-hidden">
            <div className="px-6 py-5 border-b border-border bg-gray-50/30">
              <div className="flex items-center gap-3">
                <svg className="w-5 h-5 text-navy/60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zM3.75 12h.007v.008H3.75V12zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm-.375 5.25h.007v.008H3.75v-.008zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
                </svg>
                <h3 className="font-semibold text-lg text-navy">Recent Cases</h3>
              </div>
            </div>
            {loading ? (
              <div className="p-16 text-center">
                <div className="inline-flex items-center gap-3 text-muted">
                  <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Loading cases...
                </div>
              </div>
            ) : (
              <CaseTable cases={cases} showFilters />
            )}
          </div>
        </div>
      </section>

      {/* ================================================================ */}
      {/* COMPLIANCE FOOTER                                                */}
      {/* ================================================================ */}
      <section className="bg-surface border-t border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 md:py-16">
          <div className="flex flex-col md:flex-row items-start gap-10 md:gap-16">
            {/* Brand column */}
            <div className="md:w-1/3">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 bg-gold rounded-lg flex items-center justify-center font-bold text-navy text-sm">V</div>
                <span className="font-[family-name:var(--font-dm-serif)] text-xl text-navy tracking-tight">VantaHG</span>
              </div>
              <p className="text-muted text-sm leading-relaxed">
                Clinical Brief Engine for utilization review. AI-powered analysis with physician-led determinations.
              </p>
            </div>

            {/* Links column */}
            <div className="md:w-1/3">
              <h4 className="font-semibold text-navy text-sm uppercase tracking-wider mb-4">Platform</h4>
              <div className="grid grid-cols-2 gap-2">
                <Link href="/cases/new" className="text-sm text-muted hover:text-navy transition-colors">Submit Case</Link>
                <Link href="/reviewers" className="text-sm text-muted hover:text-navy transition-colors">Reviewers</Link>
                <Link href="/clients" className="text-sm text-muted hover:text-navy transition-colors">Clients</Link>
                <Link href="/" className="text-sm text-muted hover:text-navy transition-colors">Dashboard</Link>
              </div>
            </div>

            {/* Compliance column */}
            <div className="md:w-1/3">
              <h4 className="font-semibold text-navy text-sm uppercase tracking-wider mb-4">Compliance</h4>
              <div className="flex items-center gap-4 mb-4">
                <div className="flex items-center gap-1.5 text-xs font-medium text-muted bg-gray-100 px-3 py-1.5 rounded-full">
                  <svg className="w-3.5 h-3.5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  HIPAA Compliant
                </div>
                <div className="flex items-center gap-1.5 text-xs font-medium text-muted bg-gray-100 px-3 py-1.5 rounded-full">
                  <svg className="w-3.5 h-3.5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  SOC 2
                </div>
              </div>
            </div>
          </div>

          {/* Compliance disclosure */}
          <div className="mt-10 pt-8 border-t border-border">
            <p className="text-xs text-muted leading-relaxed max-w-4xl">
              All clinical determinations are made by licensed, board-certified physicians. AI technology
              is used solely to assist in clinical documentation analysis and does not make coverage decisions.
              VantaHG complies with all applicable state and federal regulations governing utilization review,
              including URAC and NCQA standards where applicable.
            </p>
            <p className="text-xs text-muted/60 mt-4">
              &copy; {new Date().getFullYear()} VantaHG. All rights reserved.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
